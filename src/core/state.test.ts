import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeBackup, encodeBackup, initialState, parseState, SaveQueue, type AppState } from './state';
import { initialCircuit } from '../games/circuit';

const savedState: AppState = {
  ...initialState(),
  schemaVersion: 6,
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
  it('round trips current fishing inventory bait and a paid cast with the shared native fixture', () => {
    const text = readFileSync(new URL('../../tests/fixtures/phase-six.cornerbits', import.meta.url), 'utf8');
    const state = decodeBackup(text);
    expect(state).toEqual(JSON.parse(text).state);
    expect(state.games.fishing.inventory.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(state.games.fishing.baitStock).toEqual([3, 0]);
    expect(decodeBackup(encodeBackup(state))).toEqual(state);
  });
  it('keeps v5 paid catches out of the new sale inventory while retaining records and money', () => {
    const old = JSON.parse(readFileSync(new URL('../../tests/fixtures/phase-five.cornerbits', import.meta.url), 'utf8')).state;
    old.games.fishing.coins = 321;
    old.games.fishing.caught[0] = 800;
    old.games.fishing.totalCaught = 800;
    old.games.fishing.casts = 800;
    old.games.fishing.location = 4;
    const state = parseState(JSON.stringify(old));
    expect(state.games.fishing).toMatchObject(old.games.fishing);
    expect(state.games.fishing.inventory).toEqual(Array(36).fill(0));
    expect(state.games.fishing.inventoryBonus).toBe(0);
    expect(state.games.fishing.baitStock).toEqual([0, 0]);
    expect(state.games.fishing.unlockedLocations).toBe(5);
  });
  it('adds fishing and sword while preserving all four-version games', () => {
    const old = JSON.parse(readFileSync(new URL('../../tests/fixtures/phase-four.cornerbits', import.meta.url), 'utf8')).state;
    const migrated = parseState(JSON.stringify(old));
    expect(migrated.schemaVersion).toBe(6);
    for (const game of ['mine', 'garden', 'circuit'] as const) expect(migrated.games[game]).toEqual(old.games[game]);
    expect(migrated.games).toHaveProperty('fishing', expect.objectContaining({ casts: 0, totalCaught: 0, cast: null }));
    expect(migrated.games).toHaveProperty('sword', expect.objectContaining({ level: 0, pity: 0, attempts: 0 }));
  });
  it('preserves old unlocked seeds and every existing game field during v3 migration', () => {
    const legacy = JSON.parse(readFileSync(new URL('../../tests/fixtures/phase-three.cornerbits', import.meta.url), 'utf8')).state;
    legacy.games.garden.harvested[2] = 5;
    legacy.games.garden.harvested[7] = 1;
    legacy.games.garden.totalHarvests += 6;
    legacy.games.garden.pots[0].species = 9;
    const migrated = parseState(JSON.stringify(legacy));
    expect(migrated.games.mine).toEqual(legacy.games.mine);
    expect(migrated.games.circuit).toEqual(legacy.games.circuit);
    expect(migrated.games.garden).toEqual({ ...legacy.games.garden, unlockedSpecies: 10 });
    expect(migrated.revision).toBe(legacy.revision);
    expect(migrated.updatedAt).toBe(legacy.updatedAt);
    expect(migrated.settings).toEqual(legacy.settings);
  });
  it('migrates the shared v4 fixture without altering its previous games', () => {
    const text = readFileSync(new URL('../../tests/fixtures/phase-four.cornerbits', import.meta.url), 'utf8');
    const state = decodeBackup(text);
    expect(state).toMatchObject({ ...JSON.parse(text).state, schemaVersion: 6 });
    expect(decodeBackup(encodeBackup(state))).toEqual(state);
  });
  it('upgrades version two while retaining both games and adding an independent circuit', () => {
    const legacy = JSON.parse(readFileSync(new URL('../../tests/fixtures/phase-two.cornerbits', import.meta.url), 'utf8')).state;
    const upgraded = parseState(JSON.stringify(legacy));
    expect(upgraded).toMatchObject({ schemaVersion: 6, revision: legacy.revision, updatedAt: legacy.updatedAt, settings: legacy.settings });
    expect(upgraded.games.mine).toEqual(legacy.games.mine);
    expect(upgraded.games.garden).toEqual({ ...legacy.games.garden, unlockedSpecies: 1 });
    expect(upgraded.games).toHaveProperty('circuit', expect.objectContaining({ stage: 1, turns: 0, totalClears: 0, records: Array(300).fill(0) }));
  });
  it('roundtrips the same populated game fixture used by the native store', () => {
    const text = readFileSync(new URL('../../tests/fixtures/phase-two.cornerbits', import.meta.url), 'utf8');
    const state = decodeBackup(text);
    const original = JSON.parse(text).state;
    expect(state).toMatchObject({ ...original, schemaVersion: 6, games: { ...original.games, garden: { ...original.games.garden, unlockedSpecies: 1 }, circuit: initialCircuit() } });
    expect(decodeBackup(encodeBackup(state))).toEqual(state);
  });
  it('migrates legacy settings and backups to independent empty games', () => {
    const legacy = { schemaVersion: 1, revision: 7, updatedAt: '2026-10-28T01:00:00Z', settings: { alwaysOnTop: true, compact: false } };
    const migrated = parseState(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ schemaVersion: 6, revision: 7, settings: legacy.settings, games: { mine: { depth: 1, totalMined: 0 }, garden: { pots: [null, null, null], totalHarvests: 0, unlockedSpecies: 1 } } });
    expect(decodeBackup(JSON.stringify({ ...backup, state: legacy }))).toEqual(migrated);
  });

  it('creates version four game progress for a new installation', () => {
    expect(initialState()).toMatchObject({ schemaVersion: 6, games: { mine: { tiles: Array(25).fill(2) }, garden: { harvested: Array(40).fill(0), unlockedSpecies: 1 } } });
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
    source.games.circuit.rotations[0] = 0;
    source.games.circuit.records[0] = 12;
    await saving;
    expect(writes[0]).toMatchObject({ games: { mine: { tiles: Array(25).fill(2), inventory: Array(30).fill(0) }, garden: { pots: [{ species: 0, plantedAt: 1, watered: false }, null, null] } } });
    expect(writes[0]).toMatchObject({ games: { circuit: initialCircuit() } });
  });
  it('rejects mixed-version game keys instead of dropping progress', () => {
    const current = initialState();
    expect(() => parseState(JSON.stringify({ ...current, schemaVersion: 2 }))).toThrow();
    expect(() => parseState(JSON.stringify({ ...current, games: { mine: current.games.mine, garden: current.games.garden } }))).toThrow();
  });
  it('roundtrips the populated version three fixture also read by Rust', () => {
    const text = readFileSync(new URL('../../tests/fixtures/phase-three.cornerbits', import.meta.url), 'utf8');
    const state = decodeBackup(text);
    const legacy = JSON.parse(text).state;
    expect(state).toMatchObject({ ...legacy, schemaVersion: 6, games: { ...legacy.games, garden: { ...legacy.games.garden, unlockedSpecies: 1 } } });
    expect(state.games.circuit.rotations).toHaveLength(25);
    expect(decodeBackup(encodeBackup(state))).toEqual(state);
  });
});

describe('initialState', () => {
  it('starts with a current timestamp, zero revision, and independent disabled settings', () => {
    const before = Date.now();
    const state = initialState();
    expect(state).toEqual({
      schemaVersion: 6,
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
    { label: 'future schema', value: { ...savedState, schemaVersion: 7 } },
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
    { label: 'future state schema', value: { ...backup, state: { ...savedState, schemaVersion: 7 } } },
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
