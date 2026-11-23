import { generate, parse, walk, type CssNode } from 'css-tree';
import { z } from 'zod';
import { str } from './config.ts';
import { hash } from './io.ts';

const strings = z.record(str, z.string());
const inventory = z.strictObject({
  moduleKey: str,
  theme: str,
  complete: z.literal(true),
  sheets: strings,
  changes: z.record(
    str,
    z.strictObject({ css: z.string(), missingReason: str }),
  ),
});
type Rule = {
  owner: string;
  context: string;
  selector: string;
  declarations: Map<string, string>;
};

function cssRules(owner: string, css: string) {
  const rules: Rule[] = [];
  const classes = new Set<string>();
  const unparsed: string[] = [];
  const tree = parse(css, {
    parseCustomProperty: true,
    onParseError(_error, fallback) {
      unparsed.push(generate(fallback));
    },
  });
  const context: string[] = [];
  walk(tree, {
    enter(node: CssNode) {
      if (node.type === 'ClassSelector') classes.add(node.name);
      if (node.type === 'Atrule')
        context.push(
          '@' + node.name + ' ' + (node.prelude ? generate(node.prelude) : ''),
        );
      if (node.type !== 'Rule') return;
      const declarations = new Map<string, string>();
      for (const item of node.block.children) {
        if (item.type === 'Declaration')
          declarations.set(
            item.property,
            generate(item.value).trim() + (item.important ? '!important' : ''),
          );
      }
      const selectors =
        node.prelude.type === 'SelectorList'
          ? [...node.prelude.children].map((s) => generate(s))
          : [generate(node.prelude)];
      for (const selector of selectors)
        rules.push({
          owner,
          selector,
          context: context.join('/'),
          declarations,
        });
    },
    leave(node: CssNode) {
      if (node.type === 'Atrule') context.pop();
    },
  });
  return { rules, classes, unparsed };
}

export function canonicalCss(value: string) {
  return value
    .replace(/#[0-9a-f]{3,8}\b/gi, (hex) => {
      const digits = hex.slice(1).toLowerCase();
      return (
        '#' +
        ([3, 4].includes(digits.length)
          ? [...digits].map((c) => c + c).join('')
          : digits)
      );
    })
    .replace(
      /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)\)/gi,
      (original, ...rgb: string[]) =>
        rgb.slice(0, 3).every((v) => Number(v) <= 255)
          ? '#' +
            rgb
              .slice(0, 3)
              .map((v) => Number(v).toString(16).padStart(2, '0'))
              .join('')
          : original,
    );
}

function accessible(from: Rule, to: Rule) {
  return (
    (!from.context || from.context === to.context) &&
    ([':root', 'html', 'body', '*'].includes(from.selector) ||
      from.selector === to.selector)
  );
}

function tokenValues(rules: Rule[], rule: Rule) {
  const values = new Map<string, string>();
  for (const candidate of rules.filter((r) => accessible(r, rule)))
    for (const [key, val] of candidate.declarations)
      if (key.startsWith('--')) values.set(key, val);
  return values;
}
function resolveValue(
  value: string,
  tokens: Map<string, string>,
  seen = new Set<string>(),
): string {
  return canonicalCss(
    value.replace(/var\((--[\w-]+)\)/g, (original, key: string) => {
      if (seen.has(key) || !tokens.has(key)) return original;
      return resolveValue(tokens.get(key)!, tokens, new Set([...seen, key]));
    }),
  );
}

/** Compare proposed CSS with the observed project, base themes and consumed stylesheets. */
export function inspectTheme(raw: unknown, moduleKey: string) {
  const plan = inventory.parse(raw);
  if (plan.moduleKey !== moduleKey || !Object.hasOwn(plan.sheets, plan.theme))
    throw Error('Missing selected module theme stylesheet');
  const baseline = new Map(
    Object.entries(plan.sheets).map(([owner, css]) => [
      owner,
      cssRules(owner, css),
    ]),
  );
  const original = [...baseline.values()].flatMap((s) => s.rules);
  const sheets = { ...plan.sheets };
  for (const [owner, change] of Object.entries(plan.changes)) {
    if (!Object.hasOwn(sheets, owner))
      throw Error('New CSS needs an inventoried stylesheet owner: ' + owner);
    sheets[owner] = change.css;
  }
  const parsed = Object.entries(sheets).map(([owner, css]) => {
    const before = baseline.get(owner)!;
    if (css === plan.sheets[owner]) return before;
    const after = cssRules(owner, css);
    if (after.unparsed.some((fragment) => !before.unparsed.includes(fragment)))
      throw Error('Cannot verify new CSS syntax in ' + owner);
    const signature = (rule: Rule) =>
      JSON.stringify([rule.context, rule.selector, [...rule.declarations]]);
    const seen = new Map<string, number>();
    for (const r of before.rules)
      seen.set(signature(r), (seen.get(signature(r)) ?? 0) + 1);
    for (const r of after.rules) {
      const key = signature(r),
        remaining = seen.get(key) ?? 1;
      if (remaining <= 0) throw Error('Duplicate CSS rule: ' + r.selector);
      seen.set(key, remaining - 1);
    }
    return after;
  });
  const rules = parsed.flatMap((p) => p.rules);
  const selectorRules = new Map<string, Rule[]>();
  const selectorKey = (r: Rule) => JSON.stringify([r.context, r.selector]);
  for (const rule of rules) {
    const key = selectorKey(rule);
    const group = selectorRules.get(key) ?? [];
    group.push(rule);
    selectorRules.set(key, group);
  }
  const classes = new Set(parsed.flatMap((p) => [...p.classes]));
  const tokens = new Set(
    rules.flatMap((r) =>
      [...r.declarations.keys()].filter((k) => k.startsWith('--')),
    ),
  );
  for (const rule of rules.filter((r) =>
    Object.hasOwn(plan.changes, r.owner),
  )) {
    const previous = original.filter(
      (r) =>
        r.owner === rule.owner &&
        r.selector === rule.selector &&
        r.context === rule.context,
    );
    const changed = [...rule.declarations].filter(
      ([key, val]) => !previous.some((r) => r.declarations.get(key) === val),
    );
    if (!changed.length) continue;
    const available = tokenValues([...original, ...rules], rule);
    for (const [key, value] of changed) {
      const isToken = key.startsWith('--');
      for (const ref of value.matchAll(/var\(\s*(--[\w-]+)/g))
        if (!tokens.has(ref[1]))
          throw Error('Unresolved theme token ' + ref[1]);
      if (
        isToken &&
        original.some(
          (r) => accessible(r, rule) && r.declarations.get(key) === value,
        ) &&
        !previous.some((r) => r.declarations.has(key))
      )
        throw Error('Reuse existing token ' + key);
      const literal = resolveValue(value, available);
      const atoms = new Set([canonicalCss(value)]);
      const ast = parse(value.replace(/!important$/, ''), { context: 'value' });
      // Inspect shorthand components but preserve deliberate references to existing variables.
      walk(ast, {
        enter(n: CssNode) {
          if (n.type === 'Function' && n.name === 'var') return walk.skip;
          if (['Hash', 'Dimension', 'Percentage', 'Function'].includes(n.type))
            atoms.add(canonicalCss(generate(n)));
        },
      });
      for (const [name, def] of available) {
        const resolved = resolveValue(def, available);
        if (
          name !== key &&
          (atoms.has(resolved) || (isToken && literal === resolved))
        )
          throw Error(
            'Reuse theme token ' + name + ' for ' + rule.selector + ' / ' + key,
          );
      }
    }
    const reuseClasses = new Set<string>();
    for (const candidate of rules) {
      if (
        candidate === rule ||
        candidate.context !== rule.context ||
        (candidate.owner === rule.owner && candidate.selector === rule.selector)
      )
        continue;
      // A reusable utility must be applicable in the same state and introduce no extra declarations.
      const shape = (selector: string) =>
        selector.replace(/^\.[\w-]+/, '.class');
      if (
        !/^\.[\w-]+(?:[:][\w-]+)*$/.test(candidate.selector) ||
        shape(candidate.selector) !== shape(rule.selector.split(/\s+/).at(-1)!)
      )
        continue;
      if (
        candidate.declarations.size &&
        selectorRules
          .get(selectorKey(candidate))!
          .flatMap((r) => [...r.declarations])
          .every(([key, val]) =>
            changed.some(
              ([k, v]) =>
                k === key &&
                resolveValue(v, available) === resolveValue(val, available),
            ),
          )
      )
        reuseClasses.add(candidate.selector);
    }
    if (reuseClasses.size) {
      const values = changed.map(([, val]) => val);
      const matchesTokenName = (selector: string) =>
        Number(values.includes('var(--' + selector.slice(1) + ')'));
      const options = [...reuseClasses].sort(
        (a, b) => matchesTokenName(b) - matchesTokenName(a),
      );
      throw Error(
        'Reuse theme CSS ' + options.join(' or ') + ' for ' + rule.selector,
      );
    }
  }
  return {
    classes,
    tokens,
    rules,
    tokenValue(name: string, selector = ':root', context = '') {
      const available = tokenValues(rules, {
        owner: '',
        selector,
        context,
        declarations: new Map(),
      });
      const val = available.get(name);
      return val === undefined ? undefined : resolveValue(val, available);
    },
    digests: Object.fromEntries(
      Object.entries(sheets).map(([k, v]) => [k, hash(v)]),
    ),
  };
}
