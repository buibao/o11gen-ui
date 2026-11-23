import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { z } from 'zod';
import { str, type Config, type Viewport } from './config.ts';
import { save, json, type Result, result } from './io.ts';

const rect = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
const styleProps = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'color',
  'backgroundColor',
  'borderColor',
  'borderRadius',
  'boxShadow',
  'padding',
  'gap',
] as const;
const element = z.strictObject({
  id: str,
  selector: str,
  box: rect.optional(),
  style: z.partialRecord(z.enum(styleProps), str).optional(),
  image: z.boolean().optional(),
});
const step = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('click'), selector: str }),
  z.strictObject({
    action: z.literal('fill'),
    selector: str,
    value: z.string(),
  }),
  z.strictObject({ action: z.literal('select'), selector: str, value: str }),
  z.strictObject({ action: z.literal('scroll'), selector: str }),
  z.strictObject({ action: z.literal('visible'), selector: str }),
  z.strictObject({
    action: z.literal('text'),
    selector: str,
    value: z.string(),
  }),
  z.strictObject({ action: z.literal('url'), value: z.url() }),
]);
export const planSchema = z.strictObject({
  styleRoot: str,
  model: z.record(str, z.strictObject({
    path: str,
    classes: z.array(str),
    facts: z.record(str, str),
    bindings: z.record(str, z.strictObject({
      source: z.json(),
      field: str,
      mode: str.optional(),
      cssValue: str.optional(),
      cssProperty: str.optional(),
      tokenSelector: str.optional(),
      tokenContext: str.optional(),
    })),
    visualExemption: str.optional(),
  })),
  readySelector: str,
  stableData: z.boolean(),
  fontsAvailable: z.boolean(),
  assetsAvailable: z.boolean(),
  elements: z.array(element),
  inapplicable: z
    .strictObject({
      geometry: str.optional(),
      typography: str.optional(),
      color: str.optional(),
      assets: str.optional(),
    })
    .default({}),
  masks: z.array(z.strictObject({ box: rect, reason: str })).default([]),
  steps: z.array(step).default([]),
});
export type Plan = z.infer<typeof planSchema>;
export type Check = Result & { area: string; id: string };
export function check(
  area: string,
  id: string,
  status: Result['status'],
  reason: string,
): Check {
  return { area, id, status, reason };
}
export function classify(checks: Check[]): Result {
  for (const status of [
    'BLOCKED',
    'NEEDS_APPROVAL',
    'REVIEW_REQUIRED',
    'FAIL',
  ] as const) {
    const first = checks.find((c) => c.status === status);
    if (first)
      return result(
        status,
        first.area + ' / ' + first.id + ' - ' + first.reason,
      );
  }
  return checks.some((c) => c.status === 'PASS')
    ? result('PASS', 'All required checks passed')
    : result('NOT_RUN', 'No completed checks');
}
// Box-filter an integer Figma export scale. Never stretch or crop to hide a viewport mismatch.
function normalize(image: PNG, w: number, h: number, scale: number) {
  if (image.width !== w * scale || image.height !== h * scale) return null;
  if (scale === 1) return image;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sums = [0, 0, 0, 0];
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * image.width + x * scale + dx) * 4;
          const alpha = image.data[i + 3] / 255;
          for (let k = 0; k < 3; k++) sums[k] += image.data[i + k] * alpha;
          sums[3] += alpha;
        }
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++)
        out.data[i + k] = Math.round(sums[k] / (sums[3] || 1));
      out.data[i + 3] = Math.round((255 * sums[3]) / (scale * scale));
    }
  return out;
}
export function diff(
  c: Config,
  v: Viewport,
  ref: Buffer | undefined,
  actual: Buffer,
  dir: string,
  masks: Plan['masks'],
) {
  save(join(dir, 'actual.png'), actual);
  const inconclusive = (reason: string) => ({
    check: check('visual', v.name, 'REVIEW_REQUIRED', reason),
    differentPixels: null,
    comparedPixels: 0,
    fraction: null,
  });
  if (!ref) return inconclusive('Missing Figma reference for viewport');
  save(join(dir, 'reference.png'), ref);
  const a = PNG.sync.read(actual);
  const r = normalize(
    PNG.sync.read(ref),
    v.width,
    v.height,
    c.figma.referenceExportScale,
  );
  if (!r || a.width !== v.width || a.height !== v.height)
    return inconclusive('Viewport, scale or frame dimensions differ');
  save(join(dir, 'reference.png'), PNG.sync.write(r));
  const overlay = new PNG({ width: a.width, height: a.height });
  const delta = new PNG({ width: a.width, height: a.height });
  for (let i = 0; i < a.data.length; i++)
    overlay.data[i] = Math.round((a.data[i] + r.data[i]) / 2);
  save(join(dir, 'overlay.png'), PNG.sync.write(overlay));
  const excluded = new Uint8Array(a.width * a.height);
  for (const { box: b } of masks) {
    if (
      b.x < 0 ||
      b.y < 0 ||
      b.x + b.width > a.width ||
      b.y + b.height > a.height
    )
      return inconclusive('Dynamic mask outside viewport');
    for (let y = Math.floor(b.y); y < Math.ceil(b.y + b.height); y++)
      for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.width); x++) {
        const i = y * a.width + x;
        excluded[i] = 1;
        a.data.copy(r.data, i * 4, i * 4, i * 4 + 4);
      }
  }
  const comparedPixels = excluded.length - excluded.reduce((a, b) => a + b, 0);
  if (!comparedPixels) return inconclusive('Entire viewport excluded');
  const differentPixels = pixelmatch(
    r.data,
    a.data,
    delta.data,
    v.width,
    v.height,
    { threshold: c.validation.pixelTolerance, includeAA: true },
  );
  save(join(dir, 'difference.png'), PNG.sync.write(delta));
  const fraction = differentPixels / comparedPixels;
  return {
    check: check(
      'visual',
      v.name,
      fraction <= c.validation.maxDifferentFraction ? 'PASS' : 'FAIL',
      'Different pixels ' + differentPixels + ' / ' + comparedPixels,
    ),
    differentPixels,
    comparedPixels,
    fraction,
  };
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ]!,
  );
export function writeView(
  dir: string,
  checks: Check[],
  pixels: ReturnType<typeof diff> | null,
) {
  const outcome = classify(checks);
  json(join(dir, 'metrics.json'), { ...outcome, checks, pixels });
  const rows = checks
    .map(
      (c) =>
        '<tr>' +
        [c.area, c.id, c.status, c.reason]
          .map((x) => '<td>' + escape(x) + '</td>')
          .join('') +
        '</tr>',
    )
    .join('');
  const images =
    pixels?.fraction != null
      ? ['reference', 'actual', 'difference', 'overlay']
      : pixels
        ? ['actual']
        : [];
  save(
    join(dir, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>Viewport validation</title><h1>' +
      outcome.status +
      '</h1><table><tr><th>Area</th><th>Element</th><th>Status</th><th>Evidence</th></tr>' +
      rows +
      '</table>' +
      images
        .map(
          (n) =>
            '<figure><figcaption>' +
            n +
            '</figcaption><img style="max-width:100%" src="' +
            n +
            '.png"></figure>',
        )
        .join(''),
  );
  return outcome;
}
