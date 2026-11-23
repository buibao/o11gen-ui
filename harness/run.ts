import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { z } from 'zod';
import {
  activeViews,
  configSchema,
  designFrame,
  frameAddress,
  readJson,
  str,
  type Config,
} from './config.ts';
import { hash, json, result, runPath, save, type Result } from './io.ts';
import {
  gate,
  repairDecision,
  freshness,
  type Attempt,
  type Phase,
} from './gates.ts';
import { mappings } from './mapping.ts';
import { capture } from './browser.ts';
import { check, classify, planSchema, type Plan } from './visual.ts';
import { inspectTheme } from './theme.ts';
import { checkDesignPlan, modelReadback } from './conformance.ts';

const configHash = (c: Config) => hash(JSON.stringify(configSchema.parse(c)));
export function begin(c: Config, evidenceMode: 'fixture' | 'live' = 'live') {
  const run = randomUUID(),
    dir = runPath(run);
  mkdirSync(join(dir, 'attempt-0'), { recursive: true });
  json(join(dir, 'run.json'), {
    evidenceMode,
    configHash: configHash(c),
    startedAt: new Date().toISOString(),
    module: c.outsystems.testModule,
    screen: c.outsystems.testScreen,
    validation: c.validation,
    viewports: activeViews(c).map(({ name, width, height }) => ({
      name,
      width,
      height,
    })),
  });
  return run;
}
export function paths(c: Config, run: string) {
  const dir = runPath(run);
  if (
    z.object({ configHash: str }).parse(readJson(join(dir, 'run.json')))
      .configHash !== configHash(c)
  )
    throw Error('Configuration changed; begin a new run');
  const history: Attempt[] = [];
  while (existsSync(join(dir, 'attempt-' + history.length, 'outcome.json')))
    history.push(
      readJson(
        join(dir, 'attempt-' + history.length, 'outcome.json'),
      ) as Attempt,
    );
  const n = history.length,
    attempt = join(dir, 'attempt-' + n);
  return { dir, attempt, n, history };
}
function designArtifacts(
  c: Config,
  dir: string,
  v: ReturnType<typeof activeViews>[number],
) {
  const url = designFrame(c, v);
  if (!url) return null;
  const base = join(dir, 'design', v.name);
  const manifest = z
    .object({
      fileKey: str,
      frameId: str,
      scale: z.number(),
      nodes: z.array(z.unknown()),
    })
    .passthrough()
    .parse(readJson(join(base, 'manifest.json')));
  const ref = readFileSync(join(base, 'reference.png'));
  const integrity = z
    .object({ image: str, manifest: str })
    .parse(readJson(join(base, 'integrity.json')));
  const address = frameAddress(url);
  if (
    manifest.frameId !== address.node ||
    manifest.fileKey !== address.key ||
    manifest.scale !== c.figma.referenceExportScale ||
    hash(ref) !== integrity.image ||
    hash(JSON.stringify(readJson(join(base, 'manifest.json')))) !==
      integrity.manifest
  )
    throw Error('Design integrity mismatch');
  return { manifest, ref };
}
function comparisonBaseline(name: string, plan: Plan, design: ReturnType<typeof designArtifacts>) {
  const { model, ...visual } = plan;
  const requirements = Object.entries(model).map(([id, w]) => [id, w.visualExemption,
    Object.entries(w.bindings).map(([k, b]) => [k, b.source, b.mode, b.cssValue])]);
  return [name, hash(JSON.stringify([visual, requirements])),
    design ? hash(JSON.stringify(design.manifest)) : null, design ? hash(design.ref) : null];
}
export function checkedGate(c: Config, run: string, phase: Phase) {
  const { dir, attempt, history } = paths(c, run);
  if (existsSync(join(dir, 'terminal.json')))
    return result('BLOCKED', 'Run was explicitly stopped');
  if (history.length && repairDecision(c, history).action !== 'repair')
    return result('BLOCKED', 'Run has reached its stopping condition');
  if (history.length) {
    const prior = join(dir, 'attempt-' + (history.length - 1));
    try {
      const fix = z
        .object({
          viewport: str,
          failedId: str,
          nodeId: str,
          o11Element: str,
          cause: str,
          correction: str,
        })
        .parse(readJson(join(attempt, 'repair.json')));
      const view = activeViews(c).find((v) => v.name === fix.viewport);
      if (!view) throw Error();
      const failures = z
        .object({ checks: z.array(z.object({ id: str, status: str })) })
        .parse(readJson(join(prior, view.name, 'metrics.json')));
      const mapping = z
        .object({ mapped: z.array(z.object({ node: str, status: str })) })
        .parse(readJson(join(dir, 'design', view.name, 'mapping.json')));
      if (
        !failures.checks.some(
          (x) => x.status === 'FAIL' && x.id === fix.failedId,
        ) ||
        !mapping.mapped.some(
          (x) => x.node === fix.nodeId && x.status === 'PASS',
        )
      )
        throw Error();
    } catch {
      return result(
        'BLOCKED',
        'Supply a targeted repair tied to a prior failed check and mapped node',
      );
    }
  }
  try {
    const inventory = readJson(join(dir, 'inventory.json'));
    const evidence = z.object({ theme: z.unknown(),
      mutation: z.object({ styleReadback: z.unknown().optional() }).optional(),
      merge: z.object({ styleReadback: z.unknown().optional() }).optional(),
    }).parse(readJson(join(attempt, 'evidence.json')));
    const theme = inspectTheme(evidence.theme, c.outsystems.moduleKey);
    const pending = phase === 'generate' ? undefined : modelReadback(evidence.mutation?.styleReadback, theme);
    const accepted = phase === 'browser' || phase === 'publish'
      ? modelReadback(evidence.merge?.styleReadback, theme) : undefined;
    const baseline = [];
    let primaryMap: unknown;
    for (const v of activeViews(c)) {
      const a = designArtifacts(c, dir, v);
      const plan = planSchema.parse(readJson(join(dir, 'plans', v.name + '.json')));
      if (history.length) {
        baseline.push(comparisonBaseline(v.name, plan, a));
      }
      const map = (a ? mappings(a.manifest, inventory, c.outsystems.moduleKey) : primaryMap) as {
        status: string;
      };
      primaryMap ??= map;
      if (map.status !== 'PASS') {
        if (a) json(join(dir, 'design', v.name, 'mapping.json'), map);
        return result('BLOCKED', 'Resolve unsupported mappings for ' + v.name);
      }
      const verified = checkDesignPlan(plan, map, theme, pending);
      if (accepted) checkDesignPlan(plan, map, theme, accepted);
      if (a) json(join(dir, 'design', v.name, 'mapping.json'), verified);
    }
    if (
      history.length &&
      hash(JSON.stringify(baseline)) !== history[0].comparable
    )
      return result(
        'REVIEW_REQUIRED',
        'Design reference or requirements changed since initial validation',
      );
  } catch (err) {
    const reason = err instanceof z.ZodError ? 'Invalid or missing evidence: ' +
      err.issues.map(i => i.path.join('.')).join(', ') :
      err instanceof Error ? err.message : 'Missing design evidence';
    return result('BLOCKED', reason);
  }
  if (!existsSync(join(attempt, 'evidence.json')))
    return result('BLOCKED', 'Missing evidence for this attempt');
  const evidence = readJson(join(attempt, 'evidence.json'));
  const g = gate(c, phase, evidence);
  if (g.status === 'PASS' && history.length && phase === 'browser') {
    const current = z.object({ freshness }).parse(evidence).freshness;
    const prior = z
      .object({ freshness })
      .parse(
        readJson(join(dir, 'attempt-' + (history.length - 1), 'evidence.json')),
      ).freshness;
    if (
      current.expected === prior.expected ||
      current.previous !== prior.expected
    )
      return result(
        'REVIEW_REQUIRED',
        'Repair deployment marker does not follow the prior attempt',
      );
  }
  return g;
}
const counter = z.number().int().nonnegative().nullable();
const performanceSchema = z.strictObject({
  figmaMcpCalls: counter,
  o11McpCalls: counter,
  playwrightMcpCalls: counter,
  generationMs: counter,
  publishMs: counter,
  tokens: counter,
});
export function report(c: Config, run: string, outcome: Result, phase: string) {
  const { dir, history } = paths(c, run);
  const perf = join(dir, 'performance.json');
  const performance = existsSync(perf)
    ? performanceSchema.parse(readJson(perf))
    : Object.fromEntries(
        Object.keys(performanceSchema.shape).map((k) => [k, null]),
      );
  const status =
    phase.endsWith('-gate') && outcome.status === 'PASS'
      ? 'NOT_RUN'
      : outcome.status;
  const designs = activeViews(c).map((v) => {
    const path = join(dir, 'design', v.name, 'manifest.json');
    const m = existsSync(path)
      ? z
          .object({ frameId: str, revision: str.nullable(), scale: z.number() })
          .safeParse(readJson(path))
      : null;
    return {
      view: v.name,
      ...(m?.success ? m.data : { frameId: null, revision: null, scale: null }),
    };
  });
  const { evidenceMode } = z
    .object({ evidenceMode: z.enum(['live', 'fixture']) })
    .parse(readJson(join(dir, 'run.json')));
  json(join(dir, 'report.json'), {
    evidenceMode,
    run,
    phase,
    ...outcome,
    status,
    phaseStatus: outcome.status,
    module: c.outsystems.testModule,
    screen: c.outsystems.testScreen,
    designs,
    performance,
    completedValidations: history.length,
    completedRepairs: Math.max(0, history.length - 1),
    attempts: history,
  });
  const links = history.flatMap((_, i) =>
    activeViews(c).map(
      (v) =>
        '<li><a href="attempt-' +
        i +
        '/' +
        v.name +
        '/index.html">Attempt ' +
        i +
        ' / ' +
        v.name +
        '</a></li>',
    ),
  );
  save(
    join(dir, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>Figma to O11</title><h1>' +
      evidenceMode +
      ' / ' +
      status +
      '</h1><p>' +
      c.outsystems.testModule +
      ' / ' +
      c.outsystems.testScreen +
      '</p><a href="report.json">Execution evidence and metrics</a><ul>' +
      links.join('') +
      '</ul>',
  );
}
export async function validatePublished(
  c: Config,
  run: string,
  browser: Browser,
) {
  const lock = join(runPath(run), 'validation.lock');
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      return result('BLOCKED', 'Another validation owns this run');
    throw error;
  }
  try {
    return await validateAttempt(c, run, browser);
  } finally {
    unlinkSync(lock);
  }
}

async function validateAttempt(c: Config, run: string, browser: Browser) {
  const { dir, attempt, n } = paths(c, run);
  const guard = checkedGate(c, run, 'browser');
  if (guard.status !== 'PASS') {
    report(c, run, guard, 'browser');
    return guard;
  }
  const evidence = z
    .object({ freshness })
    .parse(readJson(join(attempt, 'evidence.json')));
  const inspection = z
    .object({
      browserInspection: z.object({
        screenUrl: str,
        observedMarker: str,
        status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'REVIEW_REQUIRED']),
        checks: z.array(str).min(1),
      }),
    })
    .safeParse(readJson(join(attempt, 'evidence.json')));
  if (
    !inspection.success ||
    inspection.data.browserInspection.screenUrl !== c.outsystems.testAppUrl ||
    inspection.data.browserInspection.observedMarker !==
      evidence.freshness.expected ||
    ['BLOCKED', 'REVIEW_REQUIRED'].includes(
      inspection.data.browserInspection.status,
    )
  ) {
    const status =
      inspection.success &&
      inspection.data.browserInspection.status === 'BLOCKED'
        ? 'BLOCKED'
        : 'REVIEW_REQUIRED';
    const outcome = result(
      status,
      'Complete MCP inspection for this deployment and translate observed defects into repeatable checks',
    );
    report(c, run, outcome, 'browser-inspection');
    return outcome;
  }
  const observations = [],
    comparable = [];
  const start = performance.now();
  for (const v of activeViews(c)) {
    const path = join(dir, 'plans', v.name + '.json');
    const plan = planSchema.parse(readJson(path));
    const design = designArtifacts(c, dir, v);
    const reference = design?.ref;
    comparable.push(comparisonBaseline(v.name, plan, design));
    const priorPath = join(dir, 'attempt-' + (n - 1), v.name, 'metrics.json');
    const prior = n
      ? z
          .object({ checks: z.array(z.object({ id: str, status: str })) })
          .parse(readJson(priorPath)).checks
      : [];
    const focus = prior.filter((x) => x.status === 'FAIL').map((x) => x.id);
    observations.push(
      await capture(
        browser,
        c,
        v,
        plan,
        evidence.freshness,
        reference,
        join(attempt, v.name),
        focus,
      ),
    );
  }
  let outcome = classify(
    observations.map((o, i) =>
      check('viewport', activeViews(c)[i].name, o.status, o.reason),
    ),
  );
  if (
    outcome.status === 'PASS' &&
    inspection.data.browserInspection.status === 'FAIL'
  )
    outcome = result(
      'REVIEW_REQUIRED',
      'MCP inspection found a mismatch absent from repeatable assertions',
    );
  const summary = {
    ...outcome,
    failures: observations
      .flatMap((o) => o.checks)
      .filter((x) => x.status === 'FAIL' && !x.area.startsWith('repair-'))
      .length,
    differentPixels: observations.reduce((a, o) => a + o.differentPixels, 0),
    comparable: hash(JSON.stringify(comparable)),
    validationMs: Math.round(performance.now() - start),
  };
  json(join(attempt, 'outcome.json'), summary);
  const decision = repairDecision(c, paths(c, run).history);
  report(c, run, decision, 'validation');
  return decision;
}
