import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { activeViews, readConfig, readJson, str } from './config.ts';
import { importDesign, reuseDesign, restDesign } from './design.ts';
import { mappings, registry } from './mapping.ts';
import { readiness } from './readiness.ts';
import { begin, checkedGate, paths, report } from './run.ts';
import { phases, repairDecision } from './gates.ts';
import { json, result } from './io.ts';
import { bindingPath, clients } from './guard.ts';
import { resolveModule } from './module.ts';
import { inspectTheme } from './theme.ts';
import { checkDesignPlan } from './conformance.ts';
import { planSchema } from './visual.ts';

const emit = (v: unknown) => console.log(JSON.stringify(v, null, 2));
async function main() {
  const [cmd, file, run, ...args] = process.argv.slice(2);
  const c = readConfig(str.parse(file));
  if (cmd === 'config') {
    registry.parse(readJson('config/osui-registry.json'));
    emit(result('PASS', 'Configuration and registry valid'));
    return;
  }
  if (cmd === 'resolve-module') {
    const target = resolveModule(c, readJson(str.parse(run)));
    c.outsystems.moduleKey = target.key;
    json(file, c);
    emit({ status: 'PASS', module: target.name, moduleKey: target.key,
      address: target.tabId ?? target.name, moduleType: target.moduleType });
    return;
  }
  if (cmd === 'doctor') {
    const services = await readiness(c);
    const compact = services.map(({ name, status, reason, ...info }) => ({
      name,
      status,
      reason,
      ...('toolCount' in info
        ? { toolCount: info.toolCount, contract: info.contract }
        : {}),
    }));
    json('reports/readiness.json', services);
    emit(compact);
    if (services.some((s) => s.status !== 'PASS')) process.exitCode = 2;
    return;
  }
  if (cmd === 'begin') {
    const client = z.enum(clients).parse(args[0] ?? 'claude');
    if (client === 'codex' && !run) throw Error('Codex hook session ID required');
    const newRun = begin(c);
    if (run) json(bindingPath(run, client), { file: resolve(file), run: newRun });
    emit({ run: newRun });
    return;
  }
  const { dir, attempt, history } = paths(c, run);
  if (cmd === 'stop') {
    const status = z
      .enum(['NOT_RUN', 'BLOCKED', 'FAIL', 'REVIEW_REQUIRED', 'NEEDS_APPROVAL'])
      .parse(args[0]);
    // Codes only. Avoid persisting arbitrary server replies or credentials.
    const reason = z
      .enum([
        'reference',
        'capability',
        'dependency',
        'scope',
        'model',
        'merge',
        'publish',
        'deployment',
        'user-decision',
        'browser',
        'configuration',
      ])
      .parse(args[1]);
    const outcome = result(status, reason);
    if (status !== 'NEEDS_APPROVAL') json(join(dir, 'terminal.json'), outcome);
    report(c, run, outcome, 'stopped');
    emit(outcome);
    return;
  }
  if (cmd === 'decision') {
    if (existsSync(join(dir, 'report.json'))) {
      const saved = z
        .object({ phase: str, status: str, reason: str })
        .parse(readJson(join(dir, 'report.json')));
      if (
        saved.phase !== 'validation' &&
        ['stopped', 'browser', 'browser-inspection'].includes(saved.phase)
      ) {
        emit({ action: 'stop', status: saved.status, reason: saved.reason });
        return;
      }
    }
    emit(repairDecision(c, history));
    return;
  }
  const decision = repairDecision(c, history);
  if (history.length && decision.action !== 'repair')
    throw Error('Run stopped');
  mkdirSync(attempt, { recursive: true });
  if (cmd === 'gate') {
    const phase = z.enum(phases).parse(args[0]);
    const g = checkedGate(c, run, phase);
    json(join(attempt, phase + '-gate.json'), g);
    report(c, run, g, phase + '-gate');
    emit(g);
    if (g.status !== 'PASS') process.exitCode = 2;
    return;
  }
  if (cmd === 'validate') {
    const g = checkedGate(c, run, 'browser');
    if (g.status !== 'PASS') {
      report(c, run, g, 'browser');
      emit(g);
      process.exitCode = 2;
      return;
    }
    report(c, run, result('NOT_RUN', 'Starting browser runner'), 'launch');
    const child = spawnSync(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve('@playwright/test/cli')),
        'test',
        '--config',
        'harness/published.config.ts',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, O11_RUN_CONFIG: resolve(file), O11_RUN_ID: run },
      },
    );
    if (
      !existsSync(join(attempt, 'outcome.json')) &&
      z.object({ phase: str }).parse(readJson(join(dir, 'report.json')))
        .phase === 'launch'
    )
      report(
        c,
        run,
        result('BLOCKED', 'Runner failed before completing validation'),
        'browser',
      );
    process.exitCode = child.status ?? 1;
    return;
  }
  const view = activeViews(c).find((v) => v.name === args[0]);
  if (!view) throw Error('Unknown viewport');
  const base = join(dir, 'design', view.name);
  switch (cmd) {
    case 'import':
      emit({
        nodeCount: importDesign(
          c,
          view,
          base,
          readJson(args[1]),
          readFileSync(args[2]),
          args[3] ?? null,
        ),
      });
      break;
    case 'reuse': {
      const hit = reuseDesign(c, view, base, str.parse(args[1]));
      emit({ hit });
      break;
    }
    case 'rest':
      emit({ source: await restDesign(c, view, base) });
      break;
    case 'map': {
      const path = join(base, 'mapping.json');
      try {
        const m = mappings(
          readJson(join(base, 'manifest.json')),
          readJson(join(dir, 'inventory.json')),
          c.outsystems.moduleKey,
        ) as { status: string };
        const resolved = m.status === 'PASS' ? checkDesignPlan(
          planSchema.parse(readJson(join(dir, 'plans', view.name + '.json'))), m,
          inspectTheme(z.object({ theme: z.unknown() }).parse(readJson(join(attempt, 'evidence.json'))).theme,
            c.outsystems.moduleKey),
        ) : m;
        json(path, resolved);
        emit({ status: m.status, path });
        if (m.status !== 'PASS') process.exitCode = 2;
      } catch (error) {
        const reason = error instanceof z.ZodError ? 'Invalid or missing mapping evidence' :
          error instanceof Error ? error.message : 'Invalid mapping evidence';
        json(path, result('BLOCKED', reason));
        emit({ status: 'BLOCKED', reason, path });
        process.exitCode = 2;
      }
      break;
    }
    default:
      throw Error('Unknown harness command');
  }
}
main().catch((error) => {
  if (error instanceof z.ZodError)
    emit({
      status: 'BLOCKED',
      reason: 'Invalid input',
      fields: error.issues.map((i) => i.path.join('.')),
    });
  else
    emit({
      status: 'BLOCKED',
      reason:
        'Check command arguments, artifact files, configuration and current run state',
    });
  process.exitCode = 2;
});
