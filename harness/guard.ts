import { join } from 'node:path';
import { z } from 'zod';
import { readConfig, readJson, str } from './config.ts';
import { checkedGate, paths } from './run.ts';
import { gate, type Phase } from './gates.ts';
import { hash } from './io.ts';

export const clients = ['claude', 'codex'] as const;
export type WorkflowClient = (typeof clients)[number];
export const bindingPath = (session: string, client: WorkflowClient = 'claude') =>
  join('.harness-cache', client, hash(str.parse(session)) + '.json');
export function guard(raw: unknown, client: WorkflowClient = 'claude') {
  const event = z
    .object({
      session_id: str,
      tool_name: str,
      tool_input: z.object({
        input: z.object({
          eSpaceName: z.string().min(1),
          mutatedOmlPath: z.string().min(1).optional(),
          code: z.string().min(1).optional(),
        }),
      }),
    })
    .parse(raw);
  const { file, run } = z
    .object({ file: str, run: str })
    .parse(readJson(bindingPath(event.session_id, client)));
  const c = readConfig(file),
    { attempt } = paths(c, run);
  const rawEvidence = readJson(join(attempt, 'evidence.json'));
  const evidence = z
    .object({
      identity: z.object({ address: str }),
      sessionOwned: z.boolean().optional(),
      mutation: z.object({ mutatedOmlPath: str }).optional(),
      merge: z.object({ merged: z.boolean() }).optional(),
      publish: z.object({ published: z.boolean() }).optional(),
    })
    .passthrough()
    .parse(rawEvidence);
  const args = event.tool_input.input;
  if (args.eSpaceName !== evidence.identity.address) return false;
  const name = event.tool_name.replace(/^mcp__servicestudio__/, '');
  if (name === 'endOmlEditSession')
    return (
      evidence.sessionOwned === true &&
      gate(c, 'generate', rawEvidence).status === 'PASS'
    );
  const phases: Record<string, Phase> = {
    startOmlEditSession: 'generate',
    applyModelApiCode: 'generate',
    omlMerge: 'merge',
    omlPublish: 'publish',
  };
  const phase = phases[name];
  if (!phase || checkedGate(c, run, phase).status !== 'PASS') return false;
  if (name === 'startOmlEditSession')
    return !evidence.sessionOwned && !evidence.merge?.merged;
  if (name === 'omlPublish') return !evidence.publish?.published;
  if (!evidence.sessionOwned || evidence.merge?.merged) return false;
  if (name === 'omlMerge')
    return args.mutatedOmlPath === evidence.mutation?.mutatedOmlPath;
  return (
    !!args.code &&
    /^eSpace\s*=>\s*\{/.test(args.code) &&
    args.code.endsWith('}') &&
    !/\beSpace\s*\.\s*Save\s*\(/.test(args.code)
  );
}
