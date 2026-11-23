import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile, spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  begin,
  checkedGate,
  paths,
  validatePublished,
} from '../../harness/run.ts';
import { bindingPath } from '../../harness/guard.ts';
import { importDesign } from '../../harness/design.ts';
import { capture } from '../../harness/browser.ts';
import { json, runPath } from '../../harness/io.ts';
import {
  config,
  design,
  evidence,
  fixtureHtml,
  inventory,
  plan,
  reference,
} from '../fixtures/data.ts';

let server: Server, url: string;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url !== '/screen') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fixtureHtml);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw Error();
  url = 'http://127.0.0.1:' + addr.port + '/screen';
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function prepared() {
  const c = config();
  c.outsystems.testAppUrl = url;
  const run = begin(c, 'fixture'),
    dir = runPath(run),
    v = c.playwright.viewports[0],
    e = evidence(c);
  json(join(dir, 'fixture-config.json'), c);
  json(join(dir, 'inventory.json'), inventory(c));
  json(join(dir, 'attempt-0', 'evidence.json'), e);
  json(join(dir, 'plans', 'desktop.json'), plan);
  importDesign(
    c,
    v,
    join(dir, 'design', 'desktop'),
    design(),
    reference(),
    null,
  );
  return { c, run, dir, v, e };
}
test('normal CLI runs Playwright Test, captures fresh screen and writes complete report', async () => {
  const { dir, run } = prepared();
  await promisify(execFile)(
    process.execPath,
    [
      '--import',
      'tsx',
      'harness/cli.ts',
      'validate',
      join(dir, 'fixture-config.json'),
      run,
    ],
    { timeout: 45000 },
  );
  const data = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  expect(data.status).toBe('PASS');
  expect(data.completedValidations).toBe(1);
  expect(data.performance.tokens).toBeNull();
  for (const n of [
    'reference.png',
    'actual.png',
    'overlay.png',
    'difference.png',
    'metrics.json',
    'index.html',
  ])
    expect(existsSync(join(dir, 'attempt-0', 'desktop', n))).toBe(true);
});
test('responsive variants run independently and incomplete MCP inspection stops validation', async ({
  browser,
}) => {
  const c = config();
  c.outsystems.testAppUrl = url;
  c.playwright.viewports.push({
    name: 'mobile',
    width: 80,
    height: 120,
    frameUrl: 'https://www.figma.com/design/ExampleKey/Mobile?node-id=2-1',
  });
  const run = begin(c, 'fixture'),
    dir = runPath(run),
    ev = evidence(c);
  json(join(dir, 'inventory.json'), inventory(c));
  for (const v of c.playwright.viewports) {
    const raw = design(v.width, v.height);
    if (v.name === 'mobile') raw.id = '2:1';
    importDesign(
      c,
      v,
      join(dir, 'design', v.name),
      raw,
      reference(v.width, v.height),
      null,
    );
    json(join(dir, 'plans', v.name + '.json'), plan);
  }
  const evidencePath = join(dir, 'attempt-0', 'evidence.json');
  json(evidencePath, { ...ev, browserInspection: undefined });
  expect((await validatePublished(c, run, browser)).status).toBe(
    'REVIEW_REQUIRED',
  );
  json(evidencePath, ev);
  expect((await validatePublished(c, run, browser)).status).toBe('PASS');
  for (const v of c.playwright.viewports) {
    const metrics = JSON.parse(
      readFileSync(join(dir, 'attempt-0', v.name, 'metrics.json'), 'utf8'),
    );
    expect(metrics.pixels.comparedPixels).toBe(v.width * v.height);
    expect(metrics.pixels.differentPixels).toBe(0);
  }
});
test('changed component is repaired only after a new publish and full regression', async ({
  browser,
}) => {
  const c = config(),
    v = c.playwright.viewports[0];
  const expectedImage = reference();
  const changed = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(fixtureHtml.replace('left:10px', 'left:18px'));
  });
  await new Promise<void>((resolve) => changed.listen(0, '127.0.0.1', resolve));
  try {
    const addr = changed.address();
    if (!addr || typeof addr === 'string') throw Error();
    // Keep one URL through both deployments.
    c.outsystems.testAppUrl = 'http://127.0.0.1:' + addr.port + '/screen';
    const run2 = begin(c, 'fixture'),
      d = runPath(run2),
      ev = evidence(c);
    json(join(d, 'inventory.json'), inventory(c));
    json(join(d, 'plans', 'desktop.json'), plan);
    importDesign(
      c,
      v,
      join(d, 'design', 'desktop'),
      design(),
      expectedImage,
      null,
    );
    json(join(d, 'attempt-0', 'evidence.json'), ev);
    expect((await validatePublished(c, run2, browser)).status).toBe('FAIL');
    const attempt = paths(c, run2).attempt;
    mkdirSync(attempt, { recursive: true });
    expect(checkedGate(c, run2, 'generate').status).toBe('BLOCKED');
    json(join(attempt, 'repair.json'), {
      viewport: 'desktop',
      failedId: '1:3',
      nodeId: '1:3',
      o11Element: 'Button',
      cause: 'left offset',
      correction: 'restore spacing',
    });
    json(join(attempt, 'evidence.json'), ev);
    expect(checkedGate(c, run2, 'browser').status).toBe('REVIEW_REQUIRED');
    ev.freshness = { ...ev.freshness, previous: 'new', expected: 'repaired' };
    ev.mutation.mutatedOmlPath = ev.merge.mutatedOmlPath = 'repair.oml';
    ev.browserInspection.observedMarker = 'repaired';
    json(join(attempt, 'evidence.json'), ev);
    changed.removeAllListeners('request');
    changed.on('request', (_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(fixtureHtml.replace('data-build="new"', 'data-build="repaired"'));
    });
    expect((await validatePublished(c, run2, browser)).status).toBe('PASS');
    expect(paths(c, run2).history.length).toBe(2);
  } finally {
    changed.closeAllConnections();
    await new Promise<void>((resolve) => changed.close(() => resolve()));
  }
});
test('missing design, unavailable URL, stale deployment and responsive evidence gaps', async ({
  browser,
}) => {
  const { c, dir, v, e } = prepared();
  const run = begin(c, 'fixture');
  expect(checkedGate(c, run, 'generate').status).toBe('BLOCKED');
  const noRef = await capture(
    browser,
    c,
    v,
    plan,
    e.freshness,
    undefined,
    join(dir, 'missing-ref'),
  );
  expect(noRef.status).toBe('REVIEW_REQUIRED');
  const stale = await capture(
    browser,
    c,
    v,
    plan,
    { ...e.freshness, expected: 'future' },
    reference(),
    join(dir, 'stale'),
  );
  expect(stale.status).toBe('BLOCKED');
  c.outsystems.testAppUrl += '/missing';
  expect(
    (
      await capture(
        browser,
        c,
        v,
        plan,
        e.freshness,
        reference(),
        join(dir, 'missing-url'),
      )
    ).status,
  ).toBe('BLOCKED');
});
test('Claude hook denies wrong module, missing evidence and replay; valid calls preserve Studio approval', () => {
  const { c, dir, run, e } = prepared(),
    session = crypto.randomUUID();
  json(bindingPath(session), { file: join(dir, 'fixture-config.json'), run });
  function invoke(tool: string, input: unknown) {
    return spawnSync(process.execPath, ['harness/claude-hook.mjs'], {
      input: JSON.stringify({
        session_id: session,
        tool_name: 'mcp__servicestudio__' + tool,
        tool_input: { input },
      }),
    }).status;
  }
  const args = { eSpaceName: e.identity.address };
  expect(invoke('startOmlEditSession', { eSpaceName: 'unrelated' })).toBe(2);
  expect(invoke('startOmlEditSession', args)).toBe(2); // fixture already published
  const active = {
    ...e,
    merge: undefined,
    publish: undefined,
    sessionOwned: false,
  };
  json(join(dir, 'attempt-0', 'evidence.json'), active);
  expect(invoke('startOmlEditSession', args)).toBe(0);
  expect(invoke('applyModelApiCode', { ...args, code: 'eSpace => {}' })).toBe(
    2,
  );
  json(join(dir, 'attempt-0', 'evidence.json'), {
    ...active,
    sessionOwned: true,
  });
  expect(
    invoke('omlMerge', { ...args, mutatedOmlPath: 'unverified.oml' }),
  ).toBe(2);
  expect(
    invoke('omlMerge', { ...args, mutatedOmlPath: e.merge.mutatedOmlPath }),
  ).toBe(0);
  expect(invoke('omlPublish', args)).toBe(2);
  json(join(dir, 'attempt-0', 'evidence.json'), {
    ...active, sessionOwned: true, merge: { merged: true },
  });
  expect(invoke('endOmlEditSession', args)).toBe(0);
  json(join(dir, 'attempt-0', 'evidence.json'), {
    ...active, sessionOwned: false, merge: { merged: true },
  });
  expect(invoke('endOmlEditSession', args)).toBe(2);
});

test('Codex hook binds its own run, denies invalid writes and leaves native approval intact', async () => {
  const { dir, run, e } = prepared();
  const session = crypto.randomUUID();
  const hookConfig = JSON.parse(readFileSync('.codex/hooks.json', 'utf8'));
  const matcher = new RegExp(hookConfig.hooks.PreToolUse[0].matcher);
  function invoke(event: unknown, shell: 'configured' | 'powershell' | null = null, cwd?: string) {
    const command = hookConfig.hooks.PreToolUse[0].hooks[0].command;
    const r = shell === 'powershell'
      ? spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand',
        Buffer.from(command, 'utf16le').toString('base64')], {
        input: JSON.stringify(event), encoding: 'utf8', cwd })
      : shell === 'configured' ? spawnSync(command, {
        shell: true, input: JSON.stringify(event), encoding: 'utf8', cwd })
      : spawnSync(process.execPath, ['harness/codex-hook.mjs'], {
        input: JSON.stringify(event), encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim() ? JSON.parse(r.stdout) : null;
  }
  const event = (tool: string, input: unknown) => ({
    hook_event_name: 'PreToolUse', session_id: session,
    tool_name: 'mcp__servicestudio__' + tool, tool_input: { input },
  });
  const args = { eSpaceName: e.identity.address };
  const start = invoke({ hook_event_name: 'SessionStart', session_id: session });
  expect(start.hookSpecificOutput.hookEventName).toBe('SessionStart');
  expect(start.hookSpecificOutput.additionalContext).toContain(session);
  // Outside the workflow this project hook is deliberately inactive.
  expect(invoke(event('startOmlEditSession', args))).toBeNull();
  // A Claude binding cannot activate or authorize a Codex session.
  json(bindingPath(session), { file: join(dir, 'fixture-config.json'), run });
  expect(invoke(event('startOmlEditSession', args))).toBeNull();
  const binding = { file: join(dir, 'fixture-config.json'), run };
  json(bindingPath(session, 'codex'), binding);
  const active = { ...e, merge: undefined, publish: undefined, sessionOwned: false };
  json(join(dir, 'attempt-0', 'evidence.json'), active);
  expect(invoke(event('startOmlEditSession', args))).toBeNull();
  function denied(tool: string, input: unknown) {
    expect(matcher.test('mcp__servicestudio__' + tool)).toBe(true);
    const r = invoke(event(tool, input));
    expect(r.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(r.hookSpecificOutput.updatedInput).toBeUndefined();
  }
  denied('startOmlEditSession', { eSpaceName: 'Other' });
  denied('applyModelApiCode', { ...args, code: 'eSpace => {}' });
  json(join(dir, 'attempt-0', 'evidence.json'), { ...active, sessionOwned: true });
  expect(invoke(event('applyModelApiCode', { ...args, code: 'eSpace => {}' }))).toBeNull();
  denied('applyModelApiCode', { ...args, code: 'eSpace => {}\n' });
  denied('applyModelApiCode', { ...args, code: 'eSpace => { eSpace.Save("x"); }' });
  denied('omlMerge', { ...args, mutatedOmlPath: 'stale.oml' });
  expect(invoke(event('omlMerge', { ...args, mutatedOmlPath: e.merge.mutatedOmlPath }))).toBeNull();
  denied('omlPublish', args);
  denied('omlReset', args);
  {
    // Execute the configured shell command from a subdirectory with stdin.
    const r = invoke(event('omlMerge', { ...args, mutatedOmlPath: 'stale.oml' }),
      'configured', join(process.cwd(), 'harness'));
    expect(r.hookSpecificOutput.permissionDecision).toBe('deny');
    const s = invoke({ hook_event_name: 'SessionStart', session_id: session },
      'configured', join(process.cwd(), 'harness'));
    expect(s.hookSpecificOutput.hookEventName).toBe('SessionStart');
  }
  if (process.platform === 'win32') {
    const r = invoke(event('omlMerge', { ...args, mutatedOmlPath: 'stale.oml' }),
      'powershell', join(process.cwd(), 'harness'));
    expect(r.hookSpecificOutput.permissionDecision).toBe('deny');
  }
  json(bindingPath(session, 'codex'), { invalid: true });
  denied('startOmlEditSession', args);
});

test('CLI resolves the module key and creates a Codex binding without changing authorization', async () => {
  const { dir, e } = prepared();
  const file = join(dir, 'fixture-config.json');
  const discovery = join(dir, 'modules.json');
  const session = crypto.randomUUID();
  json(discovery, { apps: e.identity.tabs });
  async function cli(...args: string[]) {
    const r = await promisify(execFile)(process.execPath,
      ['--import', 'tsx', 'harness/cli.ts', ...args]);
    return JSON.parse(r.stdout);
  }
  const before = JSON.parse(readFileSync(file, 'utf8'));
  const resolved = await cli('resolve-module', file, discovery);
  expect(resolved.moduleKey).toBe(e.identity.tabs[0].key);
  const after = JSON.parse(readFileSync(file, 'utf8'));
  expect(after.execution).toEqual(before.execution);
  expect(after.figma).toEqual(before.figma);
  const begun = await cli('begin', file, session, 'codex');
  const binding = JSON.parse(readFileSync(bindingPath(session, 'codex'), 'utf8'));
  expect(binding.run).toBe(begun.run);
  expect(existsSync(bindingPath(session))).toBe(false);
  await expect(cli('begin', file, session, 'unsupported')).rejects.toThrow();
  await expect(cli('begin', file, '', 'codex')).rejects.toThrow();
});

test('official Playwright MCP advertises tools and navigates a disposable HTTP fixture', async () => {
  const cli = JSON.parse(readFileSync('.mcp.json', 'utf8')).mcpServers
    .playwright;
  const client = new Client({ name: 'local-fixture', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({ ...cli, stderr: 'ignore' }),
    );
    const { tools } = await client.listTools();
    expect(tools.some((t) => t.name === 'browser_navigate')).toBe(true);
    const res = await client.callTool({
      name: 'browser_navigate',
      arguments: { url },
    });
    expect(res.isError).toBeFalsy();
    const reply = (res.content as { text: string }[])[0].text;
    expect(reply).toContain(url);
    const path = reply.match(
      /\[Snapshot\]\((\.playwright-mcp[\\/]page-[\w.-]+\.yml)\)/,
    )?.[1];
    expect(path ? readFileSync(path, 'utf8') : reply).toContain(
      'button "Open"',
    );
  } finally {
    await client.close();
  }
});
