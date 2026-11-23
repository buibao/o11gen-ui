import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const str = z.string().trim().min(1);
export const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const dimension = z.number().int().min(1).max(8192);
const safeUrl = z.url().refine((value) => {
  const u = new URL(value);
  return (
    ['http:', 'https:'].includes(u.protocol) &&
    !u.username &&
    !u.password &&
    !u.hash &&
    !u.search
  );
}, 'Use a plain HTTP(S) URL without credentials, query or fragment');
export function frameAddress(value: string) {
  const url = new URL(value);
  const key = url.pathname.match(
    /^\/(?:design|file|proto)\/([A-Za-z0-9]+)(?:\/|$)/,
  )?.[1];
  const node = url.searchParams
    .get('node-id')
    ?.replace(/^(\d+)-(\d+)$/, '$1:$2');
  if (
    url.protocol !== 'https:' ||
    !['figma.com', 'www.figma.com'].includes(url.hostname) ||
    url.username ||
    url.password ||
    !key ||
    !node ||
    !/^\d+:\d+$/.test(node)
  )
    throw Error('Expected a selected Figma frame URL');
  return { key, node };
}
const figmaUrl = str.refine((value) => {
  try {
    frameAddress(value);
    return true;
  } catch {
    return false;
  }
});
export const viewport = z.strictObject({
  name: id,
  width: dimension,
  height: dimension,
  frameUrl: figmaUrl.optional(),
});
export const configSchema = z.strictObject({
  figma: z.strictObject({
    frameUrl: figmaUrl,
    accessMode: z.enum(['mcp', 'mcp-with-rest-fallback']),
    referenceExportScale: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
  }),
  outsystems: z.strictObject({
    mcpEndpoint: safeUrl,
    testModule: id,
    moduleKey: str,
    testScreen: id,
    testAppUrl: safeUrl,
  }),
  playwright: z.strictObject({
    browser: z.enum(['chromium', 'firefox', 'webkit']),
    headless: z.boolean(),
    readyTimeoutMs: z.number().int().min(1).max(120000).optional(),
    viewports: z
      .array(viewport)
      .min(1)
      .refine(
        (xs) => new Set(xs.map((x) => x.name)).size === xs.length,
        'Duplicate viewport',
      ),
  }),
  validation: z.strictObject({
    maxDifferentFraction: z.number().min(0).max(1),
    pixelTolerance: z.number().min(0).max(1),
    geometryTolerancePx: z.number().nonnegative(),
    maxRepairAttempts: z.number().int().nonnegative().max(20),
    enableResponsiveTests: z.boolean(),
    enableFunctionalTests: z.boolean(),
    enabled: z.boolean(),
    repair: z.boolean(),
  }),
  execution: z.strictObject({
    allowTestModuleMerge: z.boolean(),
    allowTestModulePublish: z.boolean(),
    requireManualApproval: z.boolean(),
  }),
});
export type Config = z.infer<typeof configSchema>;
export type Viewport = z.infer<typeof viewport>;
export function activeViews(c: Config) {
  return c.validation.enableResponsiveTests
    ? c.playwright.viewports
    : c.playwright.viewports.slice(0, 1);
}
export function designFrame(c: Config, v: Viewport) {
  return (
    v.frameUrl ??
    (v.name === c.playwright.viewports[0].name ? c.figma.frameUrl : undefined)
  );
}
export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
export function readConfig(file: string) {
  return configSchema.parse(readJson(file));
}
