import { join } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { type Config, type Viewport } from './config.ts';
import { freshness } from './gates.ts';
import { check, diff, writeView, type Plan, type Check } from './visual.ts';
import { type z } from 'zod';
import { canonicalCss } from './theme.ts';

type Marker = z.infer<typeof freshness>;
async function inlineStyles(page: Page, rootSelector: string) {
  const root = page.locator(rootSelector);
  if (await root.count() !== 1) return check('css', 'style-root', 'FAIL', 'Expected one screen root');
  const count = await root.evaluate(el => Number(el.hasAttribute('style')) + el.querySelectorAll('[style]').length);
  return check('css', 'inline-style', count ? 'FAIL' : 'PASS', 'Inline style attributes in screen: ' + count);
}
function cssArea(key: string) {
  if (key.toLowerCase().includes('color') || key === 'boxShadow')
    return 'color';
  if (['padding', 'gap', 'borderRadius'].includes(key)) return 'geometry';
  return 'typography';
}
async function elementChecks(page: Page, plan: Plan, c: Config) {
  const checks: Check[] = [];
  for (const e of plan.elements) {
    const loc = page.locator(e.selector);
    if ((await loc.count()) !== 1 || !(await loc.isVisible())) {
      checks.push(
        check('geometry', e.id, 'FAIL', 'Expected one visible component'),
      );
      continue;
    }
    if (e.box) {
      const actual = await loc.boundingBox();
      const delta = actual
        ? Math.max(
            ...(['x', 'y', 'width', 'height'] as const).map((k) =>
              Math.abs(actual[k] - e.box![k]),
            ),
          )
        : Infinity;
      checks.push(
        check(
          'geometry',
          e.id,
          delta <= c.validation.geometryTolerancePx ? 'PASS' : 'FAIL',
          'Largest box deviation ' + delta + ' CSS px',
        ),
      );
    }
    const model = plan.model[e.id];
    if (model) {
      const missing = await loc.evaluate((el, classes) => classes.filter(k => !el.classList.contains(k)), model.classes);
      if (missing.length) checks.push(check('css', e.id, 'FAIL', 'Missing theme classes: ' + missing.join(', ')));
      for (const b of Object.values(model.bindings)) {
        if (!b.cssValue) continue;
        const prop = b.field.startsWith('token:') ? b.field.slice(6) : b.cssProperty;
        if (!prop) continue;
        const actual = await loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);
        checks.push(check('css', e.id, canonicalCss(actual) === canonicalCss(b.cssValue) ? 'PASS' : 'FAIL',
          prop + ' expected ' + b.cssValue + ', observed ' + actual));
      }
      const layout = model.bindings.layoutMode?.source;
      if (layout === 'VERTICAL' || layout === 'HORIZONTAL') {
        const direction = await loc.evaluate(el => getComputedStyle(el).flexDirection);
        const display = await loc.evaluate(el => getComputedStyle(el).display);
        if (display.includes('flex') && direction !== (layout === 'VERTICAL' ? 'column' : 'row'))
          checks.push(check('geometry', e.id, 'FAIL', 'Flex direction disagrees with Figma Auto Layout'));
      }
      if (model.facts.Enabled?.toLowerCase() === 'false' && !await loc.isDisabled())
        checks.push(check('functional', e.id, 'FAIL', 'Expected disabled control'));
    }
    for (const [key, expected] of Object.entries(e.style ?? {})) {
      const actual = await loc.evaluate(
        (el, k) => getComputedStyle(el)[k as keyof CSSStyleDeclaration],
        key,
      );
      checks.push(
        check(
          cssArea(key),
          e.id,
          actual === expected ? 'PASS' : 'FAIL',
          key + ' expected ' + expected + '; observed ' + String(actual),
        ),
      );
    }
    if (e.image) {
      const loaded = await loc.evaluate(
        (el) =>
          el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
      );
      checks.push(
        check(
          'assets',
          e.id,
          loaded ? 'PASS' : 'FAIL',
          'Required image decoded',
        ),
      );
    }
  }
  return checks;
}
async function functional(page: Page, plan: Plan, c: Config) {
  if (!c.validation.enableFunctionalTests)
    return check(
      'functional',
      'requirements',
      'NOT_RUN',
      'Disabled in configuration',
    );
  if (!plan.steps.some((s) => ['visible', 'text', 'url'].includes(s.action)))
    return check(
      'functional',
      'requirements',
      'REVIEW_REQUIRED',
      'No expected functional outcome',
    );
  for (const [index, s] of plan.steps.entries()) {
    try {
      if (s.action === 'url') {
        if (new URL(s.value).origin !== new URL(c.outsystems.testAppUrl).origin)
          throw Error();
        await expect(page).toHaveURL(s.value);
      } else {
        const loc = page.locator(s.selector);
        switch (s.action) {
          case 'click':
            await loc.click();
            break;
          case 'fill':
            await loc.fill(s.value);
            break;
          case 'select':
            await loc.selectOption(s.value);
            break;
          case 'scroll':
            await loc.scrollIntoViewIfNeeded();
            break;
          case 'visible':
            await expect(loc).toBeVisible();
            break;
          case 'text':
            await expect(loc).toHaveText(s.value);
            break;
        }
      }
    } catch {
      return check(
        'functional',
        'step-' + (index + 1),
        'FAIL',
        'Requirement failed at ' + s.action,
      );
    }
  }
  return check(
    'functional',
    'requirements',
    'PASS',
    'All specified steps completed',
  );
}
export async function capture(
  browser: Browser,
  c: Config,
  v: Viewport,
  plan: Plan,
  marker: Marker,
  reference: Buffer | undefined,
  dir: string,
  focus: string[] = [],
) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    storageState: process.env.O11_BROWSER_STATE || undefined,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const origin = new URL(c.outsystems.testAppUrl).origin;
  const checks: Check[] = [];
  let failedResources = 0,
    errors = 0;
  let pixels: ReturnType<typeof diff> | null = null;
  let stage = 'Opening configured screen';
  const relevant = (type: string) =>
    [
      'script',
      'image',
      'stylesheet',
      'font',
      'document',
      'xhr',
      'fetch',
    ].includes(type);
  page.on('pageerror', () => errors++);
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors++;
  });
  page.on('requestfailed', (r) => {
    if (
      relevant(r.resourceType()) &&
      r.failure()?.errorText !== 'net::ERR_ABORTED'
    )
      failedResources++;
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && relevant(r.request().resourceType()))
      failedResources++;
  });
  try {
    await context.route('**/*', async (route) => {
      if (
        route.request().isNavigationRequest() &&
        new URL(route.request().url()).origin !== origin
      )
        await route.abort();
      else await route.continue();
    });
    const res = await page.goto(c.outsystems.testAppUrl, {
      waitUntil: 'load',
      timeout: 30000,
    });
    if (!res?.ok() || page.url() !== c.outsystems.testAppUrl) throw Error();
    stage = 'Deployment marker or ready element unavailable';
    const readyTimeout = c.playwright.readyTimeoutMs ?? 45000;
    await expect(page.locator(marker.selector)).toHaveAttribute(
      marker.attribute,
      marker.expected,
      { timeout: readyTimeout },
    );
    await page.locator(plan.readySelector).waitFor({ state: 'visible', timeout: readyTimeout });
    stage = 'Waiting for required assets';
    await page.waitForFunction(
      () =>
        document.fonts.status === 'loaded' &&
        [...document.images]
          .filter(
            (i) =>
              i.loading !== 'lazy' ||
              i.getBoundingClientRect().top < innerHeight,
          )
          .every((i) => i.complete),
      {},
      { timeout: 10000 },
    );
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const broken = await page.evaluate(
      () =>
        [...document.images].filter((i) => i.complete && !i.naturalWidth)
          .length,
    );
    if (broken)
      checks.push(
        check('assets', 'document', 'FAIL', 'Broken images ' + broken),
      );
    if (!plan.stableData || !plan.fontsAvailable || !plan.assetsAvailable)
      checks.push(
        check(
          'visual',
          'preconditions',
          'REVIEW_REQUIRED',
          'Stable data, fonts or source assets unverified',
        ),
      );
    stage = 'Measuring viewport';
    if (focus.length) {
      const focused = await elementChecks(
        page,
        {
          ...plan,
          elements: plan.elements.filter((e) => focus.includes(e.id)),
        },
        c,
      );
      checks.push(...focused.map((x) => ({ ...x, area: 'repair-' + x.area })));
    }
    checks.push(...(await elementChecks(page, plan, c)));
    checks.push(await inlineStyles(page, plan.styleRoot));
    for (const area of ['geometry', 'typography', 'color', 'assets'] as const) {
      if (!checks.some((x) => x.area === area))
        checks.push(
          check(
            area,
            'coverage',
            plan.inapplicable[area] ? 'NOT_RUN' : 'REVIEW_REQUIRED',
            plan.inapplicable[area] ?? 'Missing design assertions',
          ),
        );
    }
    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    );
    checks.push(
      check(
        'responsive',
        v.name,
        overflow ? 'FAIL' : 'PASS',
        'Horizontal overflow ' + overflow + ' CSS px',
      ),
    );
    const screenshot = await page.screenshot({
      animations: 'disabled',
      // Playwright's caret hiding leaves style="" on inputs after the capture.
      // A transient stylesheet keeps the authored DOM available for the second inline-style check.
      caret: 'initial',
      style: 'input, textarea, [contenteditable] { caret-color: transparent !important; }',
      scale: 'css',
      timeout: 15000,
    });
    pixels = diff(c, v, reference, screenshot, dir, plan.masks);
    checks.push(pixels.check, await functional(page, plan, c));
    if (c.validation.enableFunctionalTests && page.url() === c.outsystems.testAppUrl)
      checks.push(await inlineStyles(page, plan.styleRoot));
    checks.push(
      check(
        'health',
        'browser',
        errors || failedResources ? 'FAIL' : 'PASS',
        'Browser errors ' + errors + ', failed resources ' + failedResources,
      ),
    );
  } catch {
    checks.push(check('deployment', v.name, 'BLOCKED', stage));
  } finally {
    await context.close();
  }
  const outcome = writeView(dir, checks, pixels);
  return { ...outcome, checks, differentPixels: pixels?.differentPixels ?? 0 };
}
