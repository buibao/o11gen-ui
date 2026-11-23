import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../../harness/design.ts';
import { mappings } from '../../harness/mapping.ts';
import { inspectTheme } from '../../harness/theme.ts';
import { checkDesignPlan, modelReadback } from '../../harness/conformance.ts';
import { config, design, evidence, inventory, plan } from '../fixtures/data.ts';

const c = config();
const e = evidence(c);
const css = e.theme.sheets.FixtureTheme;
const theme = inspectTheme(e.theme, c.outsystems.moduleKey);
const checkedWidgets = () =>
  modelReadback(structuredClone(e.mutation.styleReadback), theme);
function map(raw: unknown, available: string[] = inventory(c).available) {
  return mappings(
    normalize(raw, c.figma.frameUrl, 'fixture', 1),
    { ...inventory(c), available },
    c.outsystems.moduleKey,
  ) as {
    mapped: { node: string; target: string; source: Record<string, unknown> }[];
    variables: Record<string, unknown>;
    status: string;
  };
}
const checkCSS = (
  extra: string,
  base = ':root{--ink:#abc;--space:8px}.pad{padding:var(--space)}',
) =>
  inspectTheme(
    {
      ...e.theme,
      sheets: { Base: base, FixtureTheme: '' },
      changes: {
        FixtureTheme: {
          css: extra,
          missingReason: 'The design needs a previously unavailable value.',
        },
      },
    },
    c.outsystems.moduleKey,
  );

test('reuse inherited theme classes and tokens; permit genuinely missing CSS and tokens', () => {
  assert.throws(
    () => checkCSS('.copy{padding:var(--space)}'),
    /Reuse theme CSS .pad/,
  );
  assert.throws(
    () => checkCSS('.new{border:1px solid #aabbcc}'),
    /Reuse theme token --ink/,
  );
  assert.throws(
    () => checkCSS(':root{--duplicate:rgb(170,187,204)}'),
    /Reuse theme token --ink/,
  );
  assert.throws(
    () => checkCSS(':root{--alias:var(--space)}'),
    /Reuse theme token --space/,
  );
  assert.throws(
    () => checkCSS('.new{color:var(--unknown)}'),
    /Unresolved theme token/,
  );
  assert.doesNotThrow(() =>
    checkCSS(
      ':root{--outline:3px}.outlined{outline:var(--outline) solid var(--ink)}',
    ),
  );
  assert.doesNotThrow(() =>
    checkCSS('.new{padding:8px}', '@media print{.pad{padding:8px}}'),
  );
  assert.doesNotThrow(() => checkCSS('.new{padding:8px}', '.dark{--gap:8px}'));
  assert.throws(() =>
    inspectTheme({ ...e.theme, complete: false }, c.outsystems.moduleKey),
  );
  assert.throws(() => inspectTheme(e.theme, 'other module'), /selected module/);
});

test('block unplanned CSS, authored inline styles and extended style attributes in model readback', () => {
  const r = e.mutation.styleReadback;
  for (const [customStyle, attributes] of [
    ['color:red', {}],
    [null, { STYLE: 'color:var(--brand)' }],
  ] as const)
    assert.throws(
      () =>
        modelReadback(
          {
            ...r,
            widgets: {
              Primary: {
                ...r.widgets.Primary,
                customStyle,
                attributes,
              },
            },
          },
          theme,
        ),
      /Inline style/,
    );
  assert.throws(
    () => modelReadback({ ...r, sheets: { FixtureTheme: css } }, theme),
    /Stylesheet readback/,
  );
});

test('Card uses a referenced composite; generation and readback require its source block', () => {
  const raw = design();
  raw.children[0].name = 'Card';
  const m = map(raw, ['Container', 'Content/CardSectioned']);
  assert.equal(m.mapped[1].target, 'Content/CardSectioned');
  const p = structuredClone(plan);
  assert.throws(() => checkDesignPlan(p, m, theme), /SourceBlock/);
  p.model['1:3'].facts.sourceBlock = 'Content/CardSectioned';
  const w = checkedWidgets();
  assert.throws(() => checkDesignPlan(p, m, theme, w), /readback mismatch/);
  w.Primary.kind = 'Block';
  w.Primary.facts.sourceBlock = 'Content/CardSectioned';
  assert.doesNotThrow(() => checkDesignPlan(p, m, theme, w));
  assert.equal(map(raw, ['Container']).mapped[1].target, 'Container');
});

test('input requires individual widgets, typed data and Label.TargetWidget readback', () => {
  const raw = design();
  raw.children[0].name = 'Input';
  assert.equal(map(raw, ['Container', 'Input + Label']).status, 'BLOCKED');
  const m = map(raw, ['Container', 'Input', 'Label']);
  assert.equal(m.status, 'PASS');
  const p = structuredClone(plan);
  assert.throws(() => checkDesignPlan(p, m, theme), /typed variable/);
  p.model['1:3'].facts = {
    variable: 'Search',
    dataType: 'Text',
    labelPath: 'SearchLabel',
  };
  const w = checkedWidgets();
  w.Primary = {
    ...w.Primary,
    kind: 'Input',
    facts: { ...p.model['1:3'].facts },
  };
  w.SearchLabel = {
    ...w.Primary,
    kind: 'Label',
    facts: { targetWidget: 'WrongInput' },
  };
  assert.throws(() => checkDesignPlan(p, m, theme, w), /Label.TargetWidget/);
  w.SearchLabel.facts.targetWidget = 'Primary';
  assert.doesNotThrow(() => checkDesignPlan(p, m, theme, w));
});

test('variant, variables, layout and node IDs stay bound to actual properties', () => {
  const raw = design();
  const disabled = { type: 'VARIANT', value: 'Disabled' };
  const alias = { type: 'VARIABLE_ALIAS', id: 'v1' };
  const variable = {
    name: 'brand',
    valuesByMode: { day: '#0a141e', night: '#ffffff' },
  };
  Object.assign(raw.children[0], {
    componentProperties: { State: disabled },
    boundVariables: { fill: alias },
  });
  const m = map({ document: raw, variables: { v1: variable } });
  const p = structuredClone(plan),
    button = p.model['1:3'];
  assert.throws(() => checkDesignPlan(p, m, theme), /Incomplete Figma/);
  button.facts.Enabled = 'False';
  button.bindings = {
    'componentProperties.State': { source: disabled, field: 'Enabled' },
    'boundVariables.fill': { source: alias, field: 'token:--brand' },
    'variable.v1': {
      source: variable,
      field: 'token:--brand',
      mode: 'day',
      cssValue: '#0a141e',
    },
  };
  const w = checkedWidgets();
  w.Primary.facts.Enabled = 'True';
  assert.throws(() => checkDesignPlan(p, m, theme, w), /readback mismatch/);
  w.Primary.facts.Enabled = 'False';
  assert.doesNotThrow(() => checkDesignPlan(p, m, theme, w));
  button.bindings['variable.v1'].mode = 'night';
  assert.throws(() => checkDesignPlan(p, m, theme, w), /selected Figma value/);
  button.bindings['variable.v1'].mode = 'day';
  Object.assign(raw.children[0], {
    componentProperties: { State: { type: 'VARIANT', value: 'Default' } },
  });
  assert.throws(
    () =>
      checkDesignPlan(
        p,
        map({ document: raw, variables: { v1: variable } }),
        theme,
      ),
    /Stale Figma/,
  );
  assert.throws(
    () => checkDesignPlan(p, map(raw), theme),
    /Missing Figma variable/,
  );
  p.elements[0].id = 'absent';
  assert.throws(() => checkDesignPlan(p, m, theme), /Unknown Figma node/);
});
