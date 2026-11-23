import { test, expect } from '@playwright/test';
import { readConfig } from './config.ts';
import { validatePublished } from './run.ts';

test('published Test Module matches its selected Figma frames', async ({
  browser,
}) => {
  const outcome = await validatePublished(
    readConfig(process.env.O11_RUN_CONFIG!),
    process.env.O11_RUN_ID!,
    browser,
  );
  expect(outcome.status, outcome.reason).toBe('PASS');
});
