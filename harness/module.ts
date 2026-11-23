import { z } from 'zod';
import { str, type Config } from './config.ts';

const row = z.object({
  name: str,
  key: str,
  isOpen: z.boolean(),
  isReference: z.boolean().optional(),
  tabId: str.optional(),
  moduleType: str.optional(),
});

// Input is the parsed discovery payload, never the authorization envelope.
export function resolveModule(c: Config, raw: unknown) {
  const catalog = z.union([
    z.object({ apps: z.array(row) }).transform((v) => v.apps),
    z.object({ modules: z.array(row) }).transform((v) => v.modules),
  ]).parse(raw);
  const matches = catalog.filter((r) =>
    r.isOpen && !r.isReference && r.name === c.outsystems.testModule,
  );
  if (matches.length !== 1) throw Error('Open Test Module must resolve uniquely');
  const target = matches[0];
  const pinned = c.outsystems.moduleKey;
  if (pinned !== 'replace-with-the-Test-Module-key' && pinned !== target.key)
    throw Error('Pinned module identity changed; review the target');
  if (!target.moduleType || target.moduleType === 'Unknown')
    throw Error('Verify the module style');
  return target;
}
