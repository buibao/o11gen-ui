import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readJson, str } from './config.ts';
import { json, hash } from './io.ts';

const entry = z.strictObject({
  component: str,
  aliases: z.array(str).min(1),
  target: str,
  alternatives: z.array(str).optional(),
  members: z.array(str).min(1).optional(),
  dependencies: z.array(str),
  properties: z.record(str, str),
  tokens: z.record(str, str),
  limitations: str,
  fallback: str,
});
export const registry = z
  .array(entry)
  .min(1)
  .refine((rows) => {
    const aliases = rows.flatMap((r) => r.aliases.map((a) => a.toLowerCase()));
    return new Set(aliases).size === aliases.length;
  }, 'Ambiguous mapping alias');
const inventory = z.strictObject({
  moduleKey: str,
  available: z.array(str),
  nodeKinds: z.record(str, str).default({}),
});
export function mappings(
  input: unknown,
  available: unknown,
  moduleKey: string,
  rawRegistry: unknown = readJson('config/osui-registry.json'),
) {
  const manifest = z
    .object({
      nodes: z
        .array(
          z.object({
            id: str,
            name: z.string(),
            type: str,
            properties: z.object({ componentId: str.optional() }).catchall(z.unknown()).optional(),
          }),
        )
        .min(1),
      components: z
        .record(str, z.object({ name: str, componentSetId: str.optional() }))
        .default({}),
      componentSets: z.record(str, z.object({ name: str })).default({}),
      variables: z.record(str, z.unknown()).default({}),
    })
    .parse(input);
  const catalog = registry.parse(rawRegistry);
  const actual = inventory.parse(available);
  if (actual.moduleKey !== moduleKey)
    throw Error('Wrong mapping inventory module');
  const key = hash(JSON.stringify([3, manifest, catalog, actual]));
  const path = join('.harness-cache', 'mapping', key + '.json');
  if (existsSync(path)) return readJson(path);
  const byAlias = new Map(
    catalog.flatMap((r) => r.aliases.map((a) => [a.toLowerCase(), r] as const)),
  );
  const mapped = manifest.nodes.map((n) => {
    const hint = actual.nodeKinds[n.id];
    const component = n.properties?.componentId
      ? manifest.components[n.properties.componentId]
      : undefined;
    const componentSet = component?.componentSetId
      ? manifest.componentSets[component.componentSetId]
      : undefined;
    const row = hint
      ? byAlias.get(hint.toLowerCase())
      : (byAlias.get(componentSet?.name.toLowerCase() ?? '') ??
        byAlias.get(component?.name.toLowerCase() ?? '') ??
        byAlias.get(n.name.toLowerCase()) ??
        byAlias.get(n.type.toLowerCase()));
    const target = row && ([row.target, ...(row.alternatives ?? [])]
      .find(candidate => actual.available.includes(candidate)) ?? row.target);
    const required = row ? [...(row.members ?? [target!]), ...row.dependencies] : [];
    const missing = required.filter((d) => !actual.available.includes(d));
    return {
      node: n.id,
      component: row?.component ?? null,
      target: target ?? null,
      source: n.properties ?? {},
      status: row && !missing.length ? 'PASS' : 'BLOCKED',
      missing,
    };
  });
  const output = {
    status: mapped.every((m) => m.status === 'PASS') ? 'PASS' : 'BLOCKED',
    mapped,
    variables: manifest.variables,
  };
  json(path, output);
  return output;
}
