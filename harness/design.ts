import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { z } from 'zod';
import {
  designFrame,
  frameAddress,
  readJson,
  str,
  type Config,
  type Viewport,
} from './config.ts';
import { hash, json, save } from './io.ts';

const bounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
const nodeSchema = z
  .object({
    id: str,
    name: z.string(),
    type: str,
    absoluteBoundingBox: bounds.optional(),
    children: z.array(z.unknown()).default([]),
    visible: z.boolean().optional(),
  })
  .passthrough();
const fields = [
  'characters',
  'componentId',
  'componentProperties',
  'variantProperties',
  'layoutMode',
  'layoutWrap',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'layoutAlign',
  'layoutGrow',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'itemSpacing',
  'constraints',
  'fills',
  'strokes',
  'strokeWeight',
  'cornerRadius',
  'rectangleCornerRadii',
  'effects',
  'styles',
  'boundVariables',
  'explicitVariableModes',
  'resolvedVariableModes',
  'opacity',
  'style',
] as const;
export function normalize(
  document: unknown,
  frameUrl: string,
  revision: string | null,
  scale: number,
) {
  const { key, node } = frameAddress(frameUrl);
  const component = z.object({ name: str, componentSetId: str.optional() });
  const source = z
    .object({
      document: z.unknown().nonoptional(),
      components: z.record(str, component).optional(),
      componentSets: z.record(str, component).optional(),
      styles: z
        .record(str, z.object({ name: str, styleType: str.optional() }))
        .optional(),
      variables: z
        .record(
          str,
          z.object({
            name: str,
            value: z.json().optional(),
            valuesByMode: z.record(str, z.json()).optional(),
            variableCollectionId: str.optional(),
          }).refine(v => v.value !== undefined || v.valuesByMode !== undefined),
        )
        .optional(),
      assets: z
        .array(z.object({ nodeId: str, name: str, localFile: str.nullable() }))
        .optional(),
      assumptions: z.array(str).optional(),
      responsiveVariants: z
        .array(z.object({ frameId: str, width: z.number().positive() }))
        .optional(),
    })
    .safeParse(document);
  const root = nodeSchema.parse(
    source.success ? source.data.document : document,
  );
  if (
    root.id !== node ||
    !root.absoluteBoundingBox?.width ||
    !root.absoluteBoundingBox.height
  )
    throw Error('Frame identity or dimensions missing');
  const origin = root.absoluteBoundingBox;
  const ids = new Set<string>();
  const nodes: {
    id: string;
    parent: string | null;
    name: string;
    type: string;
    box: z.infer<typeof bounds> | null;
    properties: Record<string, unknown>;
  }[] = [];
  function visit(raw: unknown, parent: string | null) {
    const n = nodeSchema.parse(raw);
    if (n.visible === false) return;
    if (ids.has(n.id)) throw Error('Duplicate Figma node');
    ids.add(n.id);
    const box = n.absoluteBoundingBox;
    const properties = Object.fromEntries(
      fields.filter((k) => n[k] !== undefined).map((k) => [k, n[k]]),
    );
    nodes.push({
      id: n.id,
      parent,
      name: n.name,
      type: n.type,
      box: box ? { ...box, x: box.x - origin.x, y: box.y - origin.y } : null,
      properties,
    });
    for (const child of n.children) visit(child, n.id);
  }
  visit(root, null);
  if (!nodes.length) throw Error('Hidden frame');
  const metadata = source.success ? source.data : undefined;
  return {
    schema: 3,
    fileKey: key,
    frameId: node,
    revision,
    scale,
    width: origin.width,
    height: origin.height,
    nodes,
    components: metadata?.components ?? {},
    componentSets: metadata?.componentSets ?? {},
    styles: metadata?.styles ?? {},
    variables: metadata?.variables ?? {},
    assets: metadata?.assets ?? [],
    assumptions: metadata?.assumptions ?? [],
    responsiveVariants: metadata?.responsiveVariants ?? [],
  };
}
type Manifest = ReturnType<typeof normalize>;
function cacheDir(url: string, revision: string, scale: number) {
  return join(
    '.harness-cache',
    'design',
    hash(JSON.stringify([3, frameAddress(url), revision, scale])),
  );
}
function persist(dir: string, manifest: Manifest, image: Buffer) {
  save(join(dir, 'reference.png'), image);
  json(join(dir, 'manifest.json'), manifest);
  json(join(dir, 'integrity.json'), {
    image: hash(image),
    manifest: hash(JSON.stringify(manifest)),
  });
}
export function importDesign(
  c: Config,
  v: Viewport,
  dir: string,
  raw: unknown,
  image: Buffer,
  revision: string | null,
) {
  const url = designFrame(c, v);
  if (!url) throw Error('No frame assigned to this viewport');
  const manifest = normalize(raw, url, revision, c.figma.referenceExportScale);
  const png = PNG.sync.read(image);
  if (
    png.width !== Math.round(manifest.width * manifest.scale) ||
    png.height !== Math.round(manifest.height * manifest.scale)
  )
    throw Error('Reference dimensions disagree with frame and export scale');
  persist(dir, manifest, image);
  if (revision)
    persist(cacheDir(url, revision, manifest.scale), manifest, image);
  return manifest.nodes.length;
}
export function reuseDesign(
  c: Config,
  v: Viewport,
  dir: string,
  revision: string,
) {
  const url = designFrame(c, v);
  if (!url || !revision) return false;
  const from = cacheDir(url, revision, c.figma.referenceExportScale);
  if (!existsSync(join(from, 'integrity.json'))) return false;
  const manifest = readJson(join(from, 'manifest.json')) as Manifest;
  const image = readFileSync(join(from, 'reference.png'));
  const integrity = readJson(join(from, 'integrity.json')) as {
    image: string;
    manifest: string;
  };
  if (
    manifest.revision !== revision ||
    hash(image) !== integrity.image ||
    hash(JSON.stringify(manifest)) !== integrity.manifest
  )
    return false;
  persist(dir, manifest, image);
  return true;
}
export async function restDesign(
  c: Config,
  v: Viewport,
  dir: string,
  request: typeof fetch = fetch,
) {
  if (c.figma.accessMode !== 'mcp-with-rest-fallback')
    throw Error('REST fallback disabled');
  const token = process.env.FIGMA_ACCESS_TOKEN;
  const url = designFrame(c, v);
  if (!token || !url)
    throw Error('REST fallback requires token and selected frame');
  const { key, node } = frameAddress(url);
  async function api(path: string) {
    const res = await request('https://api.figma.com/v1/' + path, {
      headers: { 'X-Figma-Token': token! },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw Error('Figma REST response ' + res.status);
    return res.json();
  }
  const data = await api(
    'files/' + key + '/nodes?ids=' + encodeURIComponent(node),
  );
  const revision = str.parse(data.version);
  if (reuseDesign(c, v, dir, revision)) return 'cache';
  const images = await api(
    'images/' +
      key +
      '?ids=' +
      encodeURIComponent(node) +
      '&format=png&use_absolute_bounds=true&scale=' +
      c.figma.referenceExportScale +
      '&version=' +
      encodeURIComponent(revision),
  );
  const imageUrl = new URL(str.parse(images.images?.[node]));
  if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password)
    throw Error('Invalid Figma image URL');
  const res = await request(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw Error('Figma PNG unavailable');
  importDesign(
    c,
    v,
    dir,
    data.nodes?.[node],
    Buffer.from(await res.arrayBuffer()),
    revision,
  );
  return 'rest';
}
