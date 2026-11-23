import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Codex requires an explicit JSON denial; do not rely on uncaught errors.
const deny = () => process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason:
      'Figma-to-O11 guard blocked this call. Check the bound run, target, owned session, evidence and authorization.',
  },
}));

try {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  let input = '';
  for await (const part of process.stdin) input += part;
  const event = JSON.parse(input);
  if (typeof event.session_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(event.session_id))
    throw Error();
  if (event.hook_event_name === 'SessionStart') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `Figma-to-O11 Codex hook loaded. Workflow session ID: ${event.session_id}. ` +
          `For a Figma-to-O11 task, load .agents/skills/figma-to-o11/SKILL.md and bind the run with ` +
          `npm run harness -- begin <config> ${event.session_id} codex before any workflow write. ` +
          'This hook checks O11 writes only for sessions bound to a workflow run; it does not authorize a write.',
      },
    }));
  } else if (event.hook_event_name === 'PreToolUse') {
    const { tsImport } = await import('tsx/esm/api');
    const { bindingPath, guard } = await tsImport('./guard.ts', import.meta.url);
    // Match Claude's skill-scoped behavior: unrelated sessions are unaffected.
    if (existsSync(bindingPath(event.session_id, 'codex')) && !guard(event, 'codex')) deny();
  } else {
    throw Error();
  }
} catch {
  deny();
}
