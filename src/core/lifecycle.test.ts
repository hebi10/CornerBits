import { expect, test } from 'vitest';
import { nextRevision, PendingOperations } from './lifecycle';

test('closing waits for a window change before its save has been enqueued', async () => {
  const operations = new PendingOperations();
  const events: string[] = [];
  let release!: () => void;
  const windowChange = new Promise<void>((resolve) => { release = resolve; });
  const mutation = operations.run(async () => { await windowChange; events.push('saved'); });
  const close = operations.idle().then(() => events.push('closed'));
  await Promise.resolve();
  expect(events).toEqual([]);
  release();
  await Promise.all([mutation, close]);
  expect(events).toEqual(['saved', 'closed']);
});

test('failed operations do not leave the application waiting forever', async () => {
  const operations = new PendingOperations();
  await expect(operations.run(async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
  await expect(operations.idle()).resolves.toBeUndefined();
});

test('revision rollover stays valid for imported maximum revision', () => {
  expect(nextRevision(8, 10)).toBe(11);
  expect(nextRevision(Number.MAX_SAFE_INTEGER)).toBe(0);
  expect(nextRevision(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
});
