import { fileURLToPath } from 'node:url';

try {
  const { tsImport } = await import('tsx/esm/api');
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  let input = '';
  for await (const part of process.stdin) input += part;
  const { guard } = await tsImport('./guard.ts', import.meta.url);
  if (!guard(JSON.parse(input))) throw Error();
} catch {
  process.stderr.write(
    'Test Module guard blocked this call. Check the current attempt, target address, scoped evidence and authorization.',
  );
  process.exitCode = 2;
}
