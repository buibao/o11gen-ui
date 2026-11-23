import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { id } from './config.ts';

export const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export function save(file: string, data: string | Buffer) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, data, { flag: 'wx' });
  renameSync(temp, file);
}
export function json(file: string, value: unknown) {
  save(file, JSON.stringify(value, null, 2) + '\n');
}
export function runPath(run: string) {
  return join('reports', id.parse(run));
}
export type Status =
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'NOT_RUN'
  | 'NEEDS_APPROVAL'
  | 'REVIEW_REQUIRED';
export type Result = { status: Status; reason: string };
export function result(status: Status, reason: string): Result {
  return { status, reason };
}
