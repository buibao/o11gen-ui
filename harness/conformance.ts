import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { str } from './config.ts';
import { canonicalCss, inspectTheme } from './theme.ts';
import type { Plan } from './visual.ts';

const mapping = z
  .object({
    mapped: z.array(
      z
        .object({ node: str, target: str, source: z.record(str, z.json()) })
        .passthrough(),
    ),
    variables: z.record(str, z.json()),
  })
  .passthrough();
const widget = z.strictObject({
  kind: str,
  classes: z.array(str),
  facts: z.record(str, str),
  customStyle: z.string().nullable(),
  attributes: z.record(str, z.string()),
});
const readback = z.strictObject({
  sheets: z.record(str, str),
  widgets: z.record(str, widget),
});
type Theme = ReturnType<typeof inspectTheme>;

function variableValue(
  id: string,
  variables: Record<string, unknown>,
  mode: string | undefined,
  modes: Record<string, string>,
  seen = new Set<string>(),
): unknown {
  if (seen.has(id)) throw Error('Cyclic Figma variable alias: ' + id);
  const def = z
    .object({
      value: z.json().optional(),
      valuesByMode: z.record(str, z.json()).optional(),
      variableCollectionId: str.optional(),
    })
    .parse(variables[id]);
  const selected =
    (def.variableCollectionId && modes[def.variableCollectionId]) || mode;
  const keys = Object.keys(def.valuesByMode ?? {});
  const value = def.valuesByMode
    ? def.valuesByMode[selected ?? (keys.length === 1 ? keys[0] : '')]
    : def.value;
  if (value === undefined || value === null)
    throw Error('Missing selected Figma variable mode/value: ' + id);
  if (
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'VARIABLE_ALIAS' &&
    'id' in value
  )
    return variableValue(
      String(value.id),
      variables,
      mode,
      modes,
      new Set([...seen, id]),
    );
  if (
    typeof value === 'object' &&
    'r' in value &&
    'g' in value &&
    'b' in value
  ) {
    const channels = [value.r, value.g, value.b];
    if ('a' in value && value.a !== 1) channels.push(value.a);
    return (
      '#' +
      channels
        .map((x) =>
          Math.round(Number(x) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }
  return value;
}

export function modelReadback(raw: unknown, theme: Theme) {
  const actual = readback.parse(raw);
  if (!isDeepStrictEqual(actual.sheets, theme.digests))
    throw Error('Stylesheet readback differs from the approved theme plan');
  for (const [path, w] of Object.entries(actual.widgets)) {
    if (
      w.customStyle?.trim() ||
      Object.keys(w.attributes).some((k) => k.trim().toLowerCase() === 'style')
    )
      throw Error('Inline style on ' + path);
  }
  return actual.widgets;
}

export function checkDesignPlan(
  plan: Plan,
  raw: unknown,
  theme: Theme,
  observed?: ReturnType<typeof modelReadback>,
) {
  const report = mapping.parse(raw);
  const { mapped, variables } = report;
  const nodes = new Set(mapped.map((m) => m.node));
  for (const id of [
    ...Object.keys(plan.model),
    ...plan.elements.map((e) => e.id),
  ])
    if (!nodes.has(id)) throw Error('Unknown Figma node in plan: ' + id);
  const measured = new Set(plan.elements.map((e) => e.id));
  for (const row of mapped) {
    const p = plan.model[row.node];
    if (!p || (!measured.has(row.node) && !p.visualExemption))
      throw Error('Missing widget plan or visual coverage for ' + row.node);
    for (const name of p.classes)
      if (!theme.classes.has(name))
        throw Error('Class missing from effective theme: ' + name);
    const expected: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row.source)) {
      if (key === 'componentId') continue;
      if (
        ['componentProperties', 'variantProperties', 'boundVariables'].includes(
          key,
        ) &&
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val)
      ) {
        for (const [name, source] of Object.entries(val))
          expected[key + '.' + name] = source;
      } else expected[key] = val;
    }
    // Keep Figma variable definitions (including mode values and aliases) tied to the binding.
    const visited = new Set<string>();
    function variableDefinitions(value: unknown) {
      if (!value || typeof value !== 'object') return;
      if ('type' in value && value.type === 'VARIABLE_ALIAS' && 'id' in value) {
        const id = String(value.id);
        const def = variables[id];
        if (
          !def ||
          (typeof def === 'object' &&
            'value' in def &&
            def.value === null &&
            !('valuesByMode' in def))
        )
          throw Error('Missing Figma variable definition: ' + id);
        if (visited.has(id)) return;
        visited.add(id);
        expected['variable.' + id] = def;
        variableDefinitions(def);
      } else Object.values(value).forEach(variableDefinitions);
    }
    variableDefinitions(row.source);
    if (Object.keys(expected).length !== Object.keys(p.bindings).length)
      throw Error('Incomplete Figma property mapping for ' + row.node);
    for (const [key, value] of Object.entries(expected)) {
      const b = p.bindings[key];
      if (!b || !isDeepStrictEqual(b.source, value))
        throw Error('Stale Figma property mapping: ' + row.node + ' / ' + key);
      if (b.field.startsWith('class:')) {
        if (!p.classes.includes(b.field.slice(6)))
          throw Error('Missing applied class for ' + key);
      } else if (b.field.startsWith('token:')) {
        const token = b.field.slice(6);
        if (
          !theme.tokens.has(token) ||
          !theme.rules.some(
            (r) =>
              p.classes.some((name) =>
                r.selector.match(/\.[\w-]+/g)?.includes('.' + name),
              ) &&
              [...r.declarations.values()].some((v) =>
                v.includes('var(' + token + ')'),
              ),
          )
        )
          throw Error('Token missing from planned widget CSS: ' + token);
      } else if (!Object.hasOwn(p.facts, b.field))
        throw Error('Unmapped O11 field: ' + b.field);
      if (key.startsWith('variable.')) {
        const modes = {
          ...z.record(str, str).parse(row.source.explicitVariableModes ?? {}),
          ...z.record(str, str).parse(row.source.resolvedVariableModes ?? {}),
        };
        const resolved = variableValue(key.slice(9), variables, b.mode, modes);
        if (/^(class|token):/.test(b.field)) {
          const expectedCSS = canonicalCss(b.cssValue ?? '');
          if (
            !expectedCSS ||
            (expectedCSS !== canonicalCss(String(resolved)) &&
              !(
                typeof resolved === 'number' && expectedCSS === resolved + 'px'
              ))
          )
            throw Error(
              'CSS expectation disagrees with selected Figma value: ' + key,
            );
          if (
            b.field.startsWith('token:') &&
            theme.tokenValue(
              b.field.slice(6),
              b.tokenSelector,
              b.tokenContext,
            ) !== expectedCSS
          )
            throw Error(
              'Theme token value differs from selected Figma mode: ' + b.field,
            );
          if (
            b.field.startsWith('class:') &&
            !theme.rules.some(
              (r) =>
                r.selector === (b.tokenSelector ?? '.' + b.field.slice(6)) &&
                r.context === (b.tokenContext ?? '') &&
                canonicalCss(r.declarations.get(b.cssProperty ?? '') ?? '') ===
                  expectedCSS,
            )
          )
            throw Error(
              'Existing class does not supply the expected variable value: ' +
                b.field,
            );
        } else if (
          p.facts[b.field].toLowerCase() !== String(resolved).toLowerCase()
        ) {
          throw Error(
            'Bound widget property differs from selected Figma value: ' +
              b.field,
          );
        }
      }
      if (row.target === 'Button' && /\.(state|disabled)$/i.test(key)) {
        const state =
          value && typeof value === 'object' && 'value' in value
            ? value.value
            : value;
        if (
          (String(state).toLowerCase() === 'disabled' ||
            (/\.disabled$/i.test(key) && state === true)) &&
          (b.field.toLowerCase() !== 'enabled' ||
            p.facts[b.field]?.toLowerCase() !== 'false')
        )
          throw Error('Disabled Button variant requires Enabled=False');
      }
    }
    if (
      row.target === 'Input + Label' &&
      (!p.facts.variable || !p.facts.dataType || !p.facts.labelPath)
    )
      throw Error('Input needs a typed variable binding and its Label path');
    if (
      row.target.includes('/') &&
      !row.target.includes(' ') &&
      p.facts.sourceBlock !== row.target
    )
      throw Error('Missing selected SourceBlock for ' + row.node);
    if (!observed) continue;
    const w = observed[p.path];
    const kind =
      row.target === 'Input + Label'
        ? 'Input'
        : row.target.includes('/')
          ? 'Block'
          : row.target;
    if (
      !w ||
      w.kind !== kind ||
      !isDeepStrictEqual(new Set(w.classes), new Set(p.classes)) ||
      !Object.entries(p.facts).every(([k, v]) => w.facts[k] === v)
    )
      throw Error(
        'Widget type, class or property readback mismatch: ' + p.path,
      );
    if (kind === 'Input' && row.target === 'Input + Label') {
      const label = observed[p.facts.labelPath];
      if (label?.kind !== 'Label' || label.facts.targetWidget !== p.path)
        throw Error('Incorrect Label.TargetWidget for ' + p.path);
    }
  }
  return {
    ...report,
    mapped: mapped.map((row) => ({
      ...row,
      implementation: plan.model[row.node],
    })),
  };
}
