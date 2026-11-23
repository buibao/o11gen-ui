import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { configSchema, frameAddress, readJson } from '../../harness/config.ts';
import {
  importDesign,
  reuseDesign,
  normalize,
  restDesign,
} from '../../harness/design.ts';
import { mappings, registry } from '../../harness/mapping.ts';
import { gate, repairDecision, type Attempt } from '../../harness/gates.ts';
import { check, classify, diff, writeView } from '../../harness/visual.ts';
import {
  config,
  design,
  evidence,
  inventory,
  reference,
} from '../fixtures/data.ts';
import { readiness } from '../../harness/readiness.ts';
import { resolveModule } from '../../harness/module.ts';
const temp = () => mkdtempSync(join(tmpdir(), 'figma-o11-'));
test('module key resolves only from one exact open target and preserves pinned identity', () => {
  const c = config();
  const target = { name: c.outsystems.testModule, key: 'real-key', isOpen: true,
    isReference: false, moduleType: 'Reactive', tabId: 'tab-A' };
  for (const kind of ['apps', 'modules']) {
    assert.equal(resolveModule(c, { [kind]: [target] }).key, 'real-key');
    for (const rows of [[], [target, { ...target, tabId: 'tab-B' }],
      [{ ...target, isReference: true }], [{ ...target, isOpen: false }],
      [{ ...target, name: 'Other' }], [{ ...target, moduleType: 'Unknown' }]]) {
      assert.throws(() => resolveModule(c, { [kind]: rows }));
    }
  }
  c.outsystems.moduleKey = 'real-key';
  assert.equal(resolveModule(c, { apps: [target] }).key, 'real-key');
  assert.throws(() => resolveModule(c, { apps: [{ ...target, key: 'replaced-key' }] }));
});

test('early listApps accepts explicit operator choice without inventing selection metadata', () => {
  const c = config();
  const e = evidence(c);
  const target = { name: c.outsystems.testModule, key: c.outsystems.moduleKey,
    isOpen: true, isReference: false, moduleType: 'Reactive' };
  const identity = { ...e.identity, discovery: 'listApps', address: target.name,
    operatorSelectedAddress: target.name,
    tabs: [target, { ...target, name: 'Other', key: 'other' }] };
  assert.equal(gate(c, 'generate', { ...e, identity }).status, 'PASS');
  assert.equal('isSelected' in identity.tabs[0], false);
  for (const bad of [
    { ...identity, operatorSelectedAddress: undefined },
    { ...identity, operatorSelectedAddress: 'Missing' },
    { ...identity, discovery: 'listOpenModules' },
    { ...identity, tabs: [target, target] },
    { ...identity, tabs: [{ ...target, tabId: 'tab-A' }] },
    { ...identity, tabs: [{ ...target, isSelected: false }] },
    { ...identity, tabs: [target, { ...target, name: 'Other', isSelected: true }] },
  ]) assert.equal(gate(c, 'generate', { ...e, identity: bad }).status, 'BLOCKED');
});


test('documented contract 1 theme exception permits only the identified unchanged icon library', () => {
  const c = config(), e = evidence(c);
  const issue = { type: 'Error', id: 'InvalidIconLibrary', ownerType: 'IMobileTheme', ownerPath: '/TestTheme' };
  const mutation = { ...e.mutation, validationMessages: [issue],
    legacyThemeCompatibility: { contract: 1, themeName: 'TestTheme', themeStyleSheetEdited: true,
      iconLibraryUntouched: true, initialIconLibrary: null } };
  assert.equal(gate(c, 'merge', { ...e, mutation }).status, 'PASS');
  for (const bad of [
    { ...mutation, legacyThemeCompatibility: undefined },
    { ...mutation, legacyThemeCompatibility: { ...mutation.legacyThemeCompatibility, contract: 2 } },
    { ...mutation, legacyThemeCompatibility: { ...mutation.legacyThemeCompatibility, iconLibraryUntouched: false } },
    { ...mutation, validationMessages: [{ ...issue, id: 'OtherError' }] },
    { ...mutation, validationMessages: [{ ...issue, ownerPath: '/OtherTheme' }] },
    { ...mutation, readbackValidation: [{ type: 'Error', id: 'OtherError' }] },
  ]) assert.equal(gate(c, 'merge', { ...e, mutation: bad }).status, 'BLOCKED');
});

test('blocked publish has no confirmed screen URL; disabled validation needs no deployment marker', () => {
  const c = config(),
    e = evidence(c);
  expectStatus('NEEDS_APPROVAL', {
    ...e,
    publish: {
      address: e.identity.address,
      published: false,
      status: 'blocked',
    },
  });
  c.validation.enabled = false;
  expectStatus('NOT_RUN', { ...e, freshness: undefined });
  function expectStatus(status: string, input: unknown) {
    assert.equal(gate(c, 'browser', input).status, status);
  }
});
test('readiness distinguishes unavailable transports, OAuth and discoverable catalogs', async () => {
  let n = 0;
  const services = await readiness(config(), async () => {
    switch (n++) {
      case 0:
        throw Error('401 unauthorized');
      case 1:
        throw Error('connection refused');
      default:
        return {
          names: ['browser_snapshot'],
          server: 'fixture',
          contract: null,
        };
    }
  });
  assert.deepEqual(
    services.map((s) => s.status),
    ['NEEDS_APPROVAL', 'BLOCKED', 'PASS'],
  );
});
test('strict configuration, selected Figma frame and permission defaults', () => {
  const raw = readJson('config/harness.example.json');
  assert.equal(configSchema.parse(raw).execution.allowTestModulePublish, false);
  const c = config();
  assert.deepEqual(frameAddress(c.figma.frameUrl), {
    key: 'ExampleKey',
    node: '1:2',
  });
  for (const bad of [
    { ...c, production: true },
    { ...c, figma: { ...c.figma, frameUrl: 'https://elsewhere.test/a' } },
    { ...c, playwright: { ...c.playwright, viewports: [] } },
    { ...c, validation: { ...c.validation, maxRepairAttempts: -1 } },
    {
      ...c,
      outsystems: {
        ...c.outsystems,
        testAppUrl: 'https://john:pw@test.invalid/path',
      },
    },
  ])
    assert.equal(configSchema.safeParse(bad).success, false);
});
test('frame-relative geometry, source ordering, component metadata and hidden elements', () => {
  const c = config(),
    raw = design();
  const m = normalize(
    {
      ...raw,
      children: [
        ...raw.children,
        { id: 'hidden', name: 'ignore', type: 'TEXT', visible: false },
      ],
    },
    c.figma.frameUrl,
    'v1',
    1,
  );
  assert.equal(m.nodes.length, 2);
  assert.equal(m.nodes[1].parent, '1:2');
  assert.equal(m.nodes[1].box?.x, 10);
  assert.equal(m.nodes[1].properties.componentId, 'master');
  assert.throws(() =>
    normalize({ ...raw, id: 'wrong' }, c.figma.frameUrl, null, 1),
  );
  assert.throws(() =>
    normalize(
      { ...raw, children: [...raw.children, ...raw.children] },
      c.figma.frameUrl,
      null,
      1,
    ),
  );
});
test('reference acquisition verifies PNG, cache revision and scale', () => {
  const c = config(),
    v = c.playwright.viewports[0],
    dir = temp(),
    revision = crypto.randomUUID();
  assert.equal(importDesign(c, v, dir, design(), reference(), revision), 2);
  assert.equal(reuseDesign(c, v, temp(), revision), true);
  assert.equal(reuseDesign(c, v, temp(), revision + 'changed'), false);
  assert.throws(() =>
    importDesign(c, v, dir, design(), reference(100), revision),
  );
  assert.throws(() =>
    importDesign(c, v, dir, design(), Buffer.from('not a PNG'), null),
  );
});
test('scoped REST fallback pins PNG revision and keeps credentials on the API origin', async () => {
  const c = config(),
    version = crypto.randomUUID(),
    calls: string[] = [];
  c.figma.accessMode = 'mcp-with-rest-fallback';
  const prior = process.env.FIGMA_ACCESS_TOKEN;
  process.env.FIGMA_ACCESS_TOKEN = 'fixture-only';
  try {
    await restDesign(
      c,
      c.playwright.viewports[0],
      temp(),
      async (input, init) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        if (url.hostname === 'api.figma.com') {
          assert.equal(
            new Headers(init?.headers).get('X-Figma-Token'),
            'fixture-only',
          );
          assert.equal(url.searchParams.get('ids'), '1:2');
          if (url.pathname.endsWith('/nodes'))
            return Response.json({
              version,
              nodes: { '1:2': { document: design() } },
            });
          assert.equal(url.searchParams.get('version'), version);
          return Response.json({
            images: { '1:2': 'https://fixture.invalid/image' },
          });
        }
        assert.equal(init?.headers, undefined);
        return new Response(new Uint8Array(reference()));
      },
    );
    assert.equal(calls.length, 3);
  } finally {
    if (prior === undefined) delete process.env.FIGMA_ACCESS_TOKEN;
    else process.env.FIGMA_ACCESS_TOKEN = prior;
  }
});
test('canonical registry rejects ambiguity, missing inventory and unknown mappings', () => {
  const c = config(),
    m = normalize(design(), c.figma.frameUrl, null, 1),
    inv = inventory(c);
  const rows = registry.parse(readJson('config/osui-registry.json'));
  assert.throws(() => registry.parse([...rows, rows[0]]));
  const map = (i: unknown) =>
    mappings(m, i, inv.moduleKey) as { status: string };
  assert.equal(map(inv).status, 'PASS');
  assert.equal(map({ ...inv, available: [] }).status, 'BLOCKED');
  assert.equal(
    map({ ...inv, nodeKinds: { '1:3': 'undefined' } }).status,
    'BLOCKED',
  );
  assert.throws(() => map({ ...inv, moduleKey: 'other' }));
});
type Evidence = ReturnType<typeof evidence>;
const cases: [
  string,
  'generate' | 'merge' | 'publish' | 'browser',
  (e: Evidence) => void,
  string,
][] = [
  [
    'wrong selected key',
    'generate',
    (e) => (e.identity.tabs[0].key = 'wrong'),
    'BLOCKED',
  ],
  ['no Test Module', 'generate', (e) => (e.identity.tabs = []), 'BLOCKED'],
  [
    'several selected windows',
    'generate',
    (e) => e.identity.tabs.push(e.identity.tabs[0]),
    'BLOCKED',
  ],
  [
    'missing OSUI dependency',
    'generate',
    (e) => (e.preflight.dependenciesVerified = false),
    'BLOCKED',
  ],
  [
    'wrong environment',
    'generate',
    (e) => (e.identity.confirmedTestOrigin = 'https://prod.invalid'),
    'BLOCKED',
  ],
  [
    'Model API exception',
    'merge',
    (e) => (e.mutation.exceptionMessage = 'error'),
    'BLOCKED',
  ],
  [
    'sidecar empty path',
    'merge',
    (e) => (e.mutation.mutatedOmlPath = ''),
    'BLOCKED',
  ],
  [
    'silent no-op',
    'merge',
    (e) => (e.mutation.afterHash = e.mutation.beforeHash),
    'BLOCKED',
  ],
  [
    'silently renamed',
    'merge',
    (e) => (e.mutation.readbackName += '2'),
    'BLOCKED',
  ],
  [
    'TrueChange error',
    'merge',
    (e) => e.mutation.readbackValidation.push({ type: 'Error' }),
    'BLOCKED',
  ],
  [
    'merge approval withheld',
    'merge',
    (e) => (e.mergeReviewed = false),
    'NEEDS_APPROVAL',
  ],
  ['rejected merge', 'publish', (e) => (e.merge.merged = false), 'BLOCKED'],
  [
    'stale merge path',
    'publish',
    (e) => (e.merge.mutatedOmlPath = 'other.oml'),
    'BLOCKED',
  ],
  [
    'publish authorization missing',
    'publish',
    (e) => (e.publishAuthorized = false),
    'NEEDS_APPROVAL',
  ],
  [
    'publish blocked',
    'browser',
    (e) => {
      e.publish.published = false;
      e.publish.status = 'blocked';
    },
    'NEEDS_APPROVAL',
  ],
  [
    'stale deployment',
    'browser',
    (e) => (e.freshness.expected = e.freshness.previous),
    'REVIEW_REQUIRED',
  ],
  [
    'incorrect screen URL',
    'browser',
    (e) => (e.publish.screenUrl += '/login'),
    'BLOCKED',
  ],
];
for (const [name, phase, change, status] of cases)
  test(name, () => {
    const c = config(),
      e = evidence(c);
    change(e);
    assert.equal(gate(c, phase, e).status, status);
  });
test('contract 1 accepts uniquely resolved name only on listApps', () => {
  const c = config(),
    e = evidence(c);
  Reflect.deleteProperty(e.identity.tabs[0], 'tabId');
  e.identity.address = c.outsystems.testModule;
  assert.equal(gate(c, 'generate', e).status, 'BLOCKED');
  e.identity.discovery = 'listApps';
  assert.equal(gate(c, 'generate', e).status, 'PASS');
});
test('scale normalization, masks, artifact metrics and inconclusive comparisons', () => {
  const c = config(),
    v = c.playwright.viewports[0],
    dir = temp();
  c.figma.referenceExportScale = 2;
  const ref = reference(120, 80, 2),
    actual = reference();
  const compare = (img: Buffer, masks: Parameters<typeof diff>[5] = []) =>
    diff(c, v, ref, img, dir, masks);
  assert.equal(compare(actual).differentPixels, 0);
  const altered = PNG.sync.read(actual);
  for (let i = 0; i < 120 * 2; i++) altered.data.fill(0, i * 4, i * 4 + 3);
  const changed = PNG.sync.write(altered),
    delta = compare(changed);
  assert.equal(delta.check.status, 'FAIL');
  assert.equal(delta.differentPixels, 240);
  assert.equal(
    compare(changed, [
      { box: { x: 0, y: 0, width: 120, height: 2 }, reason: 'clock' },
    ]).differentPixels,
    0,
  );
  assert.equal(
    compare(changed, [
      { box: { x: 0, y: 0, width: 120, height: 80 }, reason: 'whole frame' },
    ]).check.status,
    'REVIEW_REQUIRED',
  );
  assert.equal(
    diff(c, v, undefined, actual, dir, []).check.status,
    'REVIEW_REQUIRED',
  );
  assert.equal(compare(reference(90)).check.status, 'REVIEW_REQUIRED');
  writeView(dir, [delta.check], delta);
  for (const name of [
    'actual.png',
    'reference.png',
    'difference.png',
    'overlay.png',
    'metrics.json',
    'index.html',
  ])
    assert.ok(existsSync(join(dir, name)));
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /FAIL/);
});
test('repair controller stops at limit, no improvement, ineligible status and changed baseline', () => {
  const c = config(),
    a: Attempt = {
      status: 'FAIL',
      reason: 'visual',
      failures: 1,
      differentPixels: 50,
      comparable: 'same',
    };
  assert.equal(repairDecision(c, [a]).action, 'repair');
  assert.equal(repairDecision(c, [a, a]).action, 'stop');
  assert.equal(
    repairDecision(c, [a, { ...a, differentPixels: 40 }]).action,
    'repair',
  );
  assert.equal(
    repairDecision(c, [a, { ...a, comparable: 'other', differentPixels: 0 }])
      .action,
    'stop',
  );
  assert.equal(
    repairDecision(c, [a, { ...a, status: 'PASS', comparable: 'other' }])
      .status,
    'REVIEW_REQUIRED',
  );
  c.validation.maxRepairAttempts = 1;
  assert.equal(
    repairDecision(c, [a, { ...a, differentPixels: 40 }]).action,
    'stop',
  );
  for (const status of [
    'BLOCKED',
    'NEEDS_APPROVAL',
    'REVIEW_REQUIRED',
    'PASS',
    'NOT_RUN',
  ] as const)
    assert.equal(repairDecision(c, [{ ...a, status }]).action, 'stop');
  assert.equal(classify([]).status, 'NOT_RUN');
  assert.equal(
    classify([check('deployment', 'marker', 'BLOCKED', 'stale')]).status,
    'BLOCKED',
  );
});
