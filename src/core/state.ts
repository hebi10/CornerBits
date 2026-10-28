export interface AppState {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  settings: { alwaysOnTop: boolean; compact: boolean };
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return false;
  if (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return false;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function readJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    throw new Error('파일 크기가 2 MiB를 초과합니다. 더 작은 백업 파일을 선택해 주세요.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('파일을 읽을 수 없습니다. 완전한 JSON 파일인지 확인해 주세요.');
  }
}

function validateState(value: unknown): AppState {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'revision', 'updatedAt', 'settings'])) {
    throw new Error('설정 파일 형식이 올바르지 않습니다.');
  }
  if (value.schemaVersion !== 1) {
    throw new Error('지원하지 않는 설정 버전입니다. CornerBits 버전을 확인해 주세요.');
  }
  if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error('설정 파일의 저장 번호가 올바르지 않습니다.');
  }
  if (!isIsoTimestamp(value.updatedAt)) {
    throw new Error('설정 파일의 저장 날짜가 올바르지 않습니다.');
  }
  const settings = value.settings;
  if (!isRecord(settings) || !hasExactKeys(settings, ['alwaysOnTop', 'compact'])
    || typeof settings.alwaysOnTop !== 'boolean' || typeof settings.compact !== 'boolean') {
    throw new Error('설정 값이 올바르지 않습니다. 백업 파일을 확인해 주세요.');
  }
  return {
    schemaVersion: 1,
    revision: value.revision,
    updatedAt: value.updatedAt,
    settings: { alwaysOnTop: settings.alwaysOnTop, compact: settings.compact },
  };
}

export function initialState(): AppState {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    settings: { alwaysOnTop: false, compact: false },
  };
}

export function parseState(text: string): AppState {
  return validateState(readJson(text));
}

export function encodeBackup(state: AppState, exportedAt = new Date().toISOString()): string {
  const validatedState = validateState(state);
  if (!isIsoTimestamp(exportedAt)) {
    throw new Error('백업 파일의 내보낸 날짜가 올바르지 않습니다.');
  }
  return JSON.stringify({ format: 'CornerBits', backupVersion: 1, exportedAt, state: validatedState }, null, 2);
}

export function decodeBackup(text: string): AppState {
  const value = readJson(text);
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'backupVersion', 'exportedAt', 'state'])
    || value.format !== 'CornerBits') {
    throw new Error('CornerBits 백업 파일이 아닙니다. 올바른 파일을 선택해 주세요.');
  }
  if (value.backupVersion !== 1) {
    throw new Error('지원하지 않는 백업 버전입니다. CornerBits 버전을 확인해 주세요.');
  }
  if (!isIsoTimestamp(value.exportedAt)) {
    throw new Error('백업 파일의 내보낸 날짜가 올바르지 않습니다.');
  }
  return validateState(value.state);
}

export class SaveQueue {
  private tail: Promise<void> = Promise.resolve();
  private latestFailure: Error | null = null;

  constructor(private write: (state: AppState) => Promise<void>) {}

  enqueue(state: AppState): Promise<void> {
    const snapshot = { ...state, settings: { ...state.settings } };
    const saving = this.tail.then(async () => {
      try {
        await this.write(snapshot);
        this.latestFailure = null;
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('설정을 저장하지 못했습니다. 다시 시도해 주세요.');
        this.latestFailure = failure;
        throw failure;
      }
    });
    // The queue keeps progressing after rejection; callers still receive the failed save.
    this.tail = saving.catch(() => {});
    return saving;
  }

  async flush(): Promise<void> {
    // Include writes added while an earlier write was still in progress.
    let pending: Promise<void>;
    do {
      pending = this.tail;
      await pending;
    } while (pending !== this.tail);
    if (this.latestFailure) throw this.latestFailure;
  }
}
