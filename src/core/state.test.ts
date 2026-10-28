import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeBackup, encodeBackup, initialState, parseState, SaveQueue, type AppState } from './state';

const savedState: AppState = {
  ...initialState(),
  schemaVersion: 2,
  revision: 12,
  updatedAt: '2026-10-28T02:30:00.000Z',
  settings: { alwaysOnTop: true, compact: false },
};

const backup = {
  format: 'CornerBits',
  backupVersion: 1,
  exportedAt: '2026-10-28T03:00:00.000Z',
  state: savedState,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function revision(value: number): AppState {
  return { ...savedState, revision: value, settings: { ...savedState.settings } };
}

describe('phase two compatibility', () => {
  it('roundtrips the same populated game fixture used by the native store', () => {
    const text = readFileSync(new URL('../../tests/fixtures/phase-two.cornerbits', import.meta.url), 'utf8');
    const state = decodeBackup(text);
    expect(state).toEqual(JSON.parse(text).state);
    expect(decodeBackup(encodeBackup(state))).toEqual(state);
  });
  it('migrates legacy settings and backups to independent empty games', () => {
    const legacy = { schemaVersion: 1, revision: 7, updatedAt: '2026-10-28T01:00:00Z', settings: { alwaysOnTop: true, compact: false } };
    const migrated = parseState(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ schemaVersion: 2, revision: 7, settings: legacy.settings, games: { mine: { depth: 1, totalMined: 0 }, garden: { pots: [null, null, null], totalHarvests: 0 } } });
    expect(decodeBackup(JSON.stringify({ ...backup, state: legacy }))).toEqual(migrated);
  });

  it('creates version two game progress for a new installation', () => {
    expect(initialState()).toMatchObject({ schemaVersion: 2, games: { mine: { tiles: Array(25).fill(2) }, garden: { harvested: Array(40).fill(0) } } });
  });

  it('captures nested game arrays and planted pots before queued writes', async () => {
    const source = initialState();
    source.games.garden.pots[0] = { species: 0, plantedAt: 1, watered: false };
    source.games.garden.lastObservedAt = 1;
    const writes: unknown[] = [];
    const queue = new SaveQueue(async (value) => { writes.push(value); });
    const saving = queue.enqueue(source);
    source.games.mine.tiles[0] = 0;
    source.games.mine.inventory[0] = 9;
    source.games.garden.pots[0].watered = true;
    await saving;
    expect(writes[0]).toMatchObject({ games: { mine: { tiles: Array(25).fill(2), inventory: Array(30).fill(0) }, garden: { pots: [{ species: 0, plantedAt: 1, watered: false }, null, null] } } });
  });
});

describe('initialState', () => {
  it('starts with a current timestamp, zero revision, and independent disabled settings', () => {
    const before = Date.now();
    const state = initialState();
    expect(state).toEqual({
      schemaVersion: 2,
      games: initialState().games,
      revision: 0,
      updatedAt: expect.any(String),
      settings: { alwaysOnTop: false, compact: false },
    });
    expect(Date.parse(state.updatedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(state.updatedAt)).toBeLessThanOrEqual(Date.now());
    state.settings.compact = true;
    expect(initialState().settings.compact).toBe(false);
  });
});

describe('state validation', () => {
  it('reads the supported state without changing its values', () => {
    expect(parseState(JSON.stringify(savedState))).toEqual(savedState);
  });

  it.each([
    { label: 'future schema', value: { ...savedState, schemaVersion: 3 } },
    { label: 'string schema', value: { ...savedState, schemaVersion: '1' } },
    { label: 'negative revision', value: { ...savedState, revision: -1 } },
    { label: 'fractional revision', value: { ...savedState, revision: 1.5 } },
    { label: 'unsafe revision', value: { ...savedState, revision: Number.MAX_SAFE_INTEGER + 1 } },
    { label: 'missing revision', value: { schemaVersion: 1, updatedAt: savedState.updatedAt, settings: savedState.settings } },
    { label: 'string toggle', value: { ...savedState, settings: { alwaysOnTop: 'true', compact: false } } },
    { label: 'missing toggle', value: { ...savedState, settings: { compact: false } } },
    { label: 'unknown setting', value: { ...savedState, settings: { ...savedState.settings, theme: 'dark' } } },
    { label: 'unknown field', value: { ...savedState, games: [] } },
    { label: 'null settings', value: { ...savedState, settings: null } },
    { label: 'array state', value: [] },
    { label: 'null state', value: null },
  ])('rejects $label with a readable error', ({ value }) => {
    expect(() => parseState(JSON.stringify(value))).toThrow(/[가-힣]/);
  });

  it.each([
    'not a timestamp',
    '2026-02-30T02:30:00.000Z',
    '2026-13-28T02:30:00.000Z',
    '2026-10-28',
    '2026-10-28T02:30:00',
    '2026-10-28T25:30:00Z',
    '2026-10-28T02:30:00+25:00',
  ])('rejects an invalid ISO timestamp: %s', (updatedAt) => {
    expect(() => parseState(JSON.stringify({ ...savedState, updatedAt }))).toThrow(/[가-힣]/);
  });

  it('accepts leap days and explicit timezone offsets', () => {
    const state = { ...savedState, updatedAt: '2024-02-29T23:59:59+09:00' };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  it('rejects truncated JSON with a readable error', () => {
    expect(() => parseState('{"schemaVersion":1,')).toThrow(/[가-힣]/);
  });

  it('accepts exactly 2 MiB and rejects one additional UTF-8 byte', () => {
    const text = JSON.stringify(savedState);
    const atLimit = text.padEnd(2 * 1024 * 1024, ' ');
    expect(parseState(atLimit)).toEqual(savedState);
    expect(() => parseState(`${atLimit} `)).toThrow(/2\s*MiB/);
  });

  it('counts multibyte text as UTF-8 bytes when enforcing the limit', () => {
    const text = JSON.stringify('한'.repeat(700_000));
    expect(text.length).toBeLessThan(2 * 1024 * 1024);
    expect(() => parseState(text)).toThrow(/2\s*MiB/);
  });
});

describe('backup format', () => {
  it('roundtrips a backup with the app identifier and an explicit export timestamp', () => {
    const encoded = encodeBackup(savedState, backup.exportedAt);
    expect(JSON.parse(encoded)).toEqual(backup);
    expect(decodeBackup(encoded)).toEqual(savedState);
  });

  it('sets the export timestamp to the current time when omitted', () => {
    const before = Date.now();
    const encoded = JSON.parse(encodeBackup(savedState));
    expect(Date.parse(encoded.exportedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(encoded.exportedAt)).toBeLessThanOrEqual(Date.now());
  });

  it.each([
    { label: 'another app', value: { ...backup, format: 'OtherApp' } },
    { label: 'future backup version', value: { ...backup, backupVersion: 2 } },
    { label: 'future state schema', value: { ...backup, state: { ...savedState, schemaVersion: 3 } } },
    { label: 'invalid export timestamp', value: { ...backup, exportedAt: '2026-02-30T00:00:00Z' } },
    { label: 'missing app identifier', value: { backupVersion: 1, exportedAt: backup.exportedAt, state: savedState } },
    { label: 'unknown backup field', value: { ...backup, extra: true } },
  ])('rejects $label', ({ value }) => {
    expect(() => decodeBackup(JSON.stringify(value))).toThrow(/[가-힣]/);
  });

  it('rejects a truncated backup and oversized backup', () => {
    expect(() => decodeBackup('{"format":"CornerBits"')).toThrow(/[가-힣]/);
    expect(() => decodeBackup(JSON.stringify(backup).padEnd(2 * 1024 * 1024 + 1, ' '))).toThrow(/2\s*MiB/);
  });

  it('refuses to export invalid state or an invalid timestamp', () => {
    expect(() => encodeBackup({ ...savedState, revision: -1 })).toThrow(/[가-힣]/);
    expect(() => encodeBackup(savedState, 'yesterday')).toThrow(/[가-힣]/);
  });
});

describe('SaveQueue', () => {
  it('writes in enqueue order with only one active write and flush waits for completion', async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const secondStarted = deferred();
    const releaseSecond = deferred();
    const persisted: number[] = [];
    let activeWrites = 0;
    const queue = new SaveQueue(async (state) => {
      activeWrites += 1;
      if (state.revision === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      } else {
        secondStarted.resolve();
        await releaseSecond.promise;
      }
      persisted.push(state.revision);
      activeWrites -= 1;
    });

    const first = queue.enqueue(revision(1));
    const second = queue.enqueue(revision(2));
    await firstStarted.promise;
    expect(persisted).toEqual([]);
    expect(activeWrites).toBe(1);
    let flushed = false;
    const flushing = queue.flush().then(() => { flushed = true; });
    releaseFirst.resolve();
    await secondStarted.promise;
    expect(persisted).toEqual([1]);
    expect(flushed).toBe(false);
    releaseSecond.resolve();
    await Promise.all([first, second, flushing]);
    expect(persisted).toEqual([1, 2]);
    expect(flushed).toBe(true);
  });

  it('captures an independent snapshot at enqueue time', async () => {
    const firstStarted = deferred();
    const release = deferred();
    const persisted: AppState[] = [];
    const queue = new SaveQueue(async (state) => {
      if (state.revision === 1) {
        firstStarted.resolve();
        await release.promise;
      }
      persisted.push(state);
    });
    const first = queue.enqueue(revision(1));
    await firstStarted.promise;
    const source = revision(2);
    const second = queue.enqueue(source);
    source.revision = 99;
    source.settings.compact = true;
    release.resolve();
    await Promise.all([first, second]);
    expect(persisted[1]).toEqual({ ...savedState, revision: 2 });
    persisted[1].settings.alwaysOnTop = false;
    expect(source.settings.alwaysOnTop).toBe(true);
  });

  it('keeps an unsaved failure visible to flush until a later save succeeds', async () => {
    const failure = new Error('파일을 저장할 수 없습니다.');
    const persisted: number[] = [];
    const queue = new SaveQueue(async (state) => {
      if (state.revision === 1) throw failure;
      persisted.push(state.revision);
    });
    await expect(queue.enqueue(revision(1))).rejects.toBe(failure);
    await expect(queue.flush()).rejects.toBe(failure);
    await expect(queue.flush()).rejects.toBe(failure);
    await queue.enqueue(revision(2));
    await expect(queue.flush()).resolves.toBeUndefined();
    expect(persisted).toEqual([2]);
  });

  it('continues an already queued write after a prior write rejects', async () => {
    const persisted: number[] = [];
    const queue = new SaveQueue(async (state) => {
      if (state.revision === 1) throw new Error('저장 실패');
      persisted.push(state.revision);
    });
    const results = await Promise.allSettled([queue.enqueue(revision(1)), queue.enqueue(revision(2))]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    await expect(queue.flush()).resolves.toBeUndefined();
    expect(persisted).toEqual([2]);
  });

  it('flush rejects when a write in progress fails and an empty queue can flush', async () => {
    const emptyQueue = new SaveQueue(async () => {});
    await expect(emptyQueue.flush()).resolves.toBeUndefined();
    const started = deferred();
    const release = deferred();
    const failure = new Error('저장 권한이 없습니다.');
    const queue = new SaveQueue(async () => {
      started.resolve();
      await release.promise;
      throw failure;
    });
    const saving = queue.enqueue(revision(1));
    await started.promise;
    const flushed = queue.flush();
    const result = Promise.allSettled([saving, flushed]);
    release.resolve();
    expect(await result).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);
  });
});
