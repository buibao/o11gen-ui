import { PNG } from 'pngjs';
import { readConfig, type Config } from '../../harness/config.ts';
import type { Plan } from '../../harness/visual.ts';
import { hash } from '../../harness/io.ts';

const themeCss = ':root{--brand:rgb(10,20,30)}.stack{display:flex;flex-direction:column}.primary{background:var(--brand)}';

export function config(): Config {
  const c = readConfig('config/harness.example.json');
  c.execution = {
    allowTestModuleMerge: true,
    allowTestModulePublish: true,
    requireManualApproval: true,
  };
  c.playwright.viewports = [{ name: 'desktop', width: 120, height: 80 }];
  c.validation.enableFunctionalTests = true;
  c.playwright.readyTimeoutMs = 2000;
  return c;
}
export function design(width = 120, height = 80) {
  return {
    id: '1:2',
    type: 'FRAME',
    name: 'Frame',
    absoluteBoundingBox: { x: 100, y: 200, width, height },
    layoutMode: 'VERTICAL',
    children: [
      {
        id: '1:3',
        name: 'Button',
        type: 'INSTANCE',
        componentId: 'master',
        absoluteBoundingBox: { x: 110, y: 210, width: 40, height: 20 },
      },
    ],
  };
}
export const inventory = (c: Config) => ({
  moduleKey: c.outsystems.moduleKey,
  available: ['Container', 'Button'],
});
export function reference(width = 120, height = 80, scale = 1) {
  const png = new PNG({ width: width * scale, height: height * scale });
  png.data.fill(255);
  for (let y = 10 * scale; y < 30 * scale; y++)
    for (let x = 10 * scale; x < 50 * scale; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = 10;
      png.data[i + 1] = 20;
      png.data[i + 2] = 30;
    }
  return PNG.sync.write(png);
}
export function evidence(c: Config) {
  const address = 'studio-tab-A',
    screen = c.outsystems.testScreen;
  const tab = {
    name: c.outsystems.testModule,
    key: c.outsystems.moduleKey,
    tabId: address,
    isOpen: true,
    isSelected: true,
    moduleType: 'Reactive',
  };
  const styleReadback = {
    sheets: { FixtureTheme: hash(themeCss) },
    widgets: {
      ScreenRoot: { kind: 'Container', classes: ['stack'], facts: {}, customStyle: null, attributes: {} },
      Primary: { kind: 'Button', classes: ['primary'], facts: {}, customStyle: null, attributes: {} },
    },
  };
  return {
    theme: { moduleKey: c.outsystems.moduleKey, theme: 'FixtureTheme', complete: true,
      sheets: { FixtureTheme: themeCss }, changes: {} },
    identity: {
      tabs: [tab],
      address,
      discovery: 'listOpenModules',
      screen,
      confirmedTestOrigin: new URL(c.outsystems.testAppUrl).origin,
      confirmedTestModule: true,
      endpoint: c.outsystems.mcpEndpoint,
    },
    preflight: {
      dependenciesVerified: true,
      scopedReadComplete: true,
      writeAuthorized: true,
      ownSessionOrIdle: true,
    },
    mutation: {
      styleReadback,
      address,
      screen,
      mutatedOmlPath: 'working.oml',
      exceptionMessage: '',
      validationMessages: [] as { type: string }[],
      readbackValidation: [] as { type: string }[],
      beforeHash: '0'.repeat(64),
      afterHash: '1'.repeat(64),
      readbackName: screen,
      expectedChangesPresent: true,
    },
    mergeAuthorized: true,
    mergeReviewed: true,
    merge: {
      styleReadback,
      address,
      mutatedOmlPath: 'working.oml',
      merged: true,
      sessionEnded: true,
      acceptedReadbackMatches: true,
    },
    publishAuthorized: true,
    publishReviewed: true,
    publish: {
      address,
      published: true,
      status: 'success',
      screenUrl: c.outsystems.testAppUrl,
    },
    freshness: {
      selector: 'html',
      attribute: 'data-build',
      previous: 'old',
      expected: 'new',
    },
    browserInspection: {
      screenUrl: c.outsystems.testAppUrl,
      observedMarker: 'new',
      status: 'PASS',
      checks: ['Fixture screen ready'],
    },
  };
}
export const plan: Plan = {
  styleRoot: 'body',
  model: {
    '1:2': { path: 'ScreenRoot', classes: ['stack'], facts: {},
      bindings: { layoutMode: { source: 'VERTICAL', field: 'class:stack' } },
      visualExemption: 'The frame is covered by the whole-viewport pixel comparison.' },
    '1:3': { path: 'Primary', classes: ['primary'], facts: {}, bindings: {} },
  },
  stableData: true,
  fontsAvailable: true,
  assetsAvailable: true,
  readySelector: '#button',
  elements: [
    {
      id: '1:3',
      selector: '#button',
      box: { x: 10, y: 10, width: 40, height: 20 },
      style: {
        backgroundColor: 'rgb(10, 20, 30)',
        fontFamily: 'Arial',
        fontSize: '16px',
      },
    },
  ],
  inapplicable: { assets: 'Fixture contains no images' },
  masks: [],
  steps: [
    { action: 'click', selector: '#button' },
    { action: 'visible', selector: '#opened' },
  ],
};
export const fixtureHtml =
  `<!doctype html><html data-build="new"><meta charset="utf-8"><style>*{box-sizing:border-box} body{background:white;margin:0} button{position:absolute;left:10px;top:10px;width:40px;height:20px;border:0;font:16px Arial}${themeCss}</style><body class="stack"><button class="primary" id="button" aria-label="Open"></button><p id="opened" hidden>Opened</p><script>document.querySelector("button").onclick=()=>document.querySelector("p").hidden=false</script></body></html>`;
