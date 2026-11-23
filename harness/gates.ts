import { z } from 'zod';
import { str, type Config } from './config.ts';
import { result, type Result } from './io.ts';

export const phases = ['generate', 'merge', 'publish', 'browser'] as const;
export type Phase = (typeof phases)[number];
const row = z.object({
  name: str,
  key: str,
  tabId: str.optional(),
  isOpen: z.boolean(),
  isSelected: z.boolean().optional(),
  isReference: z.boolean().optional(),
  moduleType: str.optional(),
});
const identity = z.object({
  tabs: z.array(row),
  address: str,
  discovery: z.enum(['listApps', 'listOpenModules']),
  operatorSelectedAddress: str.optional(),
  confirmedTestOrigin: str,
  confirmedTestModule: z.literal(true),
  screen: str,
  endpoint: str,
});
const dependency = z.object({
  dependenciesVerified: z.literal(true),
  scopedReadComplete: z.literal(true),
  writeAuthorized: z.literal(true),
  ownSessionOrIdle: z.literal(true),
});
const messages = z.array(z.object({ type: str, id: str.optional(), ownerType: str.optional(), ownerPath: str.optional() }));
const mutation = z.object({
  address: str,
  screen: str,
  mutatedOmlPath: str,
  exceptionMessage: z.string().nullable(),
  validationMessages: messages,
  readbackValidation: messages,
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/),
  readbackName: str,
  expectedChangesPresent: z.literal(true),
  legacyThemeCompatibility: z.object({ contract: z.literal(1), themeName: str,
    themeStyleSheetEdited: z.literal(true), iconLibraryUntouched: z.literal(true),
    initialIconLibrary: z.null() }).optional(),
});
const released = z.object({
  address: str,
  mutatedOmlPath: str,
  merged: z.literal(true),
  sessionEnded: z.literal(true),
  acceptedReadbackMatches: z.literal(true),
});
const publication = z.object({
  address: str,
  published: z.boolean(),
  status: str,
  screenUrl: str,
});
export const freshness = z
  .strictObject({
    selector: str,
    attribute: str,
    previous: z.string().nullable(),
    expected: str,
  })
  .refine((x) => x.previous !== x.expected, 'Marker must change');
export function gate(c: Config, phase: Phase, input: unknown): Result {
  const data = z.record(z.string(), z.unknown()).safeParse(input);
  if (!data.success) return result('BLOCKED', 'Missing evidence');
  const e = data.data;
  const ident = identity.safeParse(e.identity);
  if (!ident.success)
    return result(
      'BLOCKED',
      'Verify selected Test Module identity, screen, environment and endpoint',
    );
  const i = ident.data;
  const tabs = i.tabs;
  let selected = tabs.filter(
    (t) => t.isSelected && t.isOpen && !t.isReference,
  );
  // Early contract 1 has neither tabId nor selection metadata. Preserve the
  // observed rows and record the operator's explicit choice separately.
  if (i.discovery === 'listApps' &&
      tabs.filter((t) => t.isOpen && !t.isReference)
        .every((t) => t.isSelected === undefined && !t.tabId) &&
      i.operatorSelectedAddress) {
    selected = tabs.filter((t) => t.isOpen && !t.isReference &&
      t.name === i.operatorSelectedAddress);
  }
  const t = selected[0];
  const legacy =
    t &&
    !t.tabId &&
    i.discovery === 'listApps' &&
    tabs.filter((r) => r.isOpen && r.name === t.name).length === 1;
  if (
    !t ||
    selected.length !== 1 ||
    !t.moduleType ||
    i.address !== (t.tabId ?? (legacy ? t.name : null)) ||
    t.name !== c.outsystems.testModule ||
    t.key !== c.outsystems.moduleKey ||
    i.screen !== c.outsystems.testScreen ||
    i.confirmedTestOrigin !== new URL(c.outsystems.testAppUrl).origin ||
    i.endpoint !== c.outsystems.mcpEndpoint ||
    i.endpoint !==
      (process.env.O11_MCP_ENDPOINT ?? 'http://127.0.0.1:41820/mcp')
  )
    return result(
      'BLOCKED',
      'Test Module scope mismatch or ambiguous selection',
    );
  if (!dependency.safeParse(e.preflight).success)
    return result(
      'BLOCKED',
      'Missing scoped read, dependencies, write authorization or session ownership',
    );
  if (phase === 'generate')
    return result('PASS', 'Scoped generation may proceed');
  const m = mutation.safeParse(e.mutation);
  if (
    !m.success ||
    m.data.exceptionMessage ||
    m.data.beforeHash === m.data.afterHash ||
    m.data.readbackName !== i.screen ||
    m.data.address !== i.address ||
    m.data.screen !== i.screen ||
    [...m.data.validationMessages, ...m.data.readbackValidation].some(
      (v) => v.type.toLowerCase() === 'error' && !(
        m.data.legacyThemeCompatibility && v.id === 'InvalidIconLibrary' &&
        v.ownerType === 'IMobileTheme' &&
        v.ownerPath === '/' + m.data.legacyThemeCompatibility.themeName
      ),
    )
  )
    return result(
      'BLOCKED',
      'Mutation, named readback or model validation failed',
    );
  if (
    !c.execution.allowTestModuleMerge ||
    e.mergeAuthorized !== true ||
    (c.execution.requireManualApproval && e.mergeReviewed !== true)
  )
    return result('NEEDS_APPROVAL', 'Approve merge for this attempt');
  if (phase === 'merge')
    return result('PASS', 'Validated pending model may merge');
  const merge = released.safeParse(e.merge);
  if (
    !merge.success ||
    merge.data.address !== i.address ||
    merge.data.mutatedOmlPath !== m.data.mutatedOmlPath
  )
    return result(
      'BLOCKED',
      'Confirm matching successful merge and session closure',
    );
  if (
    !c.execution.allowTestModulePublish ||
    e.publishAuthorized !== true ||
    (c.execution.requireManualApproval && e.publishReviewed !== true)
  )
    return result('NEEDS_APPROVAL', 'Approve publication for this attempt');
  if (phase === 'publish')
    return result('PASS', 'Publish explicitly approved Test Module');
  const denial = z.object({
    address: z.literal(i.address),
    published: z.literal(false),
    status: z.literal('blocked'),
  });
  if (denial.safeParse(e.publish).success)
    return result('NEEDS_APPROVAL', 'Service Studio blocked publication');
  const p = publication.safeParse(e.publish);
  if (
    !p.success ||
    !p.data.published ||
    p.data.status.toLowerCase() !== 'success' ||
    p.data.address !== i.address ||
    p.data.screenUrl !== c.outsystems.testAppUrl
  )
    return result(
      'BLOCKED',
      'Expected publish result and screen URL are unconfirmed',
    );
  if (!c.validation.enabled)
    return result(
      'NOT_RUN',
      'Published Test Module; browser validation disabled',
    );
  if (!freshness.safeParse(e.freshness).success)
    return result(
      'REVIEW_REQUIRED',
      'Independent deployment marker unavailable',
    );
  return result('PASS', 'Verify the deployment marker in the browser');
}
export interface Attempt extends Result {
  failures: number;
  differentPixels: number;
  comparable: string;
}
export function repairDecision(c: Config, history: Attempt[]) {
  if (!history.length)
    return {
      action: 'validate',
      ...result('NOT_RUN', 'No completed validation'),
    };
  const last = history.at(-1)!;
  const prev = history.at(-2);
  if (prev && prev.comparable !== last.comparable)
    return {
      action: 'stop',
      ...result(
        'REVIEW_REQUIRED',
        'Comparison baseline changed between attempts',
      ),
    };
  if (last.status !== 'FAIL' || !c.validation.repair)
    return { action: 'stop', ...result(last.status, last.reason) };
  if (history.length - 1 >= c.validation.maxRepairAttempts)
    return {
      action: 'stop',
      ...result('FAIL', 'Repair limit reached. ' + last.reason),
    };
  if (
    prev &&
    (last.failures > prev.failures ||
      (last.failures === prev.failures &&
        last.differentPixels >= prev.differentPixels))
  )
    return {
      action: 'stop',
      ...result('FAIL', 'No measurable improvement under comparable checks'),
    };
  return {
    action: 'repair',
    ...result(
      'FAIL',
      'Plan one scoped correction from failed component checks',
    ),
  };
}
