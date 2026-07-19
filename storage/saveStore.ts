import { INITIAL_STATS } from '../constants';
import type { GameLog, GameStats, SaveData, SaveSlotMeta, TurnSummary } from '../types';

export const SAVE_SCHEMA_VERSION = 5;
export const SAVE_INDEX_KEY = 'lone_army_save_index';
export const SAVE_SLOT_PREFIX = 'lone_army_slot_';
export const AUTO_SAVE_KEY = 'lone_army_autosave';
export const MAX_SAVE_SLOTS = 5;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createRandomSeed = (): number => {
  try {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || INITIAL_STATS.rngState;
  } catch {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
};

const migrateSummary = (value: unknown): TurnSummary | undefined => {
  if (!isRecord(value) || !Array.isArray(value.deltas) || !Array.isArray(value.notes)) return undefined;
  if (!['action', 'battle', 'new_day', 'ending'].includes(String(value.kind))) return undefined;
  if (typeof value.title !== 'string') return undefined;

  const durationMinutes = typeof value.durationMinutes === 'number' ? value.durationMinutes : 0;
  const threatBefore = typeof value.threatBefore === 'number' ? value.threatBefore : 0;
  const threatAfter = typeof value.threatAfter === 'number' ? value.threatAfter : 0;
  const deltas = value.deltas
    .filter(isRecord)
    .filter((delta) => typeof delta.metric === 'string' && typeof delta.label === 'string' && typeof delta.value === 'number')
    .map((delta) => ({
      metric: delta.metric as TurnSummary['deltas'][number]['metric'],
      label: delta.label as string,
      value: delta.value as number,
    }));

  return {
    kind: value.kind as TurnSummary['kind'],
    title: value.title,
    durationMinutes,
    threatBefore,
    threatAfter,
    deltas,
    notes: value.notes.filter((note): note is string => typeof note === 'string'),
  };
};

export const createInitialStats = (seed = createRandomSeed()): GameStats => {
  const stats = typeof structuredClone === 'function'
    ? structuredClone(INITIAL_STATS)
    : JSON.parse(JSON.stringify(INITIAL_STATS)) as GameStats;
  stats.rngState = seed >>> 0 || INITIAL_STATS.rngState;
  return stats;
};

export const migrateSaveData = (value: unknown): SaveData | null => {
  if (!isRecord(value) || !isRecord(value.stats)) return null;

  const base = createInitialStats();
  const incoming = value.stats as Partial<GameStats>;
  const stats: GameStats = {
    ...base,
    ...incoming,
    roster: Array.isArray(incoming.roster) ? incoming.roster : base.roster,
    hmgSquads: Array.isArray(incoming.hmgSquads) ? incoming.hmgSquads : base.hmgSquads,
    triggeredEvents: Array.isArray(incoming.triggeredEvents) ? incoming.triggeredEvents : [],
    usedTacticalCards: Array.isArray(incoming.usedTacticalCards) ? incoming.usedTacticalCards : [],
    soldierDistribution: { ...base.soldierDistribution, ...(incoming.soldierDistribution ?? {}) },
    fortificationLevel: { ...base.fortificationLevel, ...(incoming.fortificationLevel ?? {}) },
    fortificationBuildCounts: { ...base.fortificationBuildCounts, ...(incoming.fortificationBuildCounts ?? {}) },
  };

  const rawLogs = Array.isArray(value.logs) ? value.logs : [];
  const logs: GameLog[] = rawLogs
    .filter(isRecord)
    .filter((log) => (log.sender === 'system' || log.sender === 'user') && typeof log.text === 'string')
    .map((log, index) => ({
      id: typeof log.id === 'string' ? log.id : `migrated-${index}`,
      sender: log.sender as GameLog['sender'],
      text: log.text as string,
      isTyping: false,
      summary: migrateSummary(log.summary),
      day: typeof log.day === 'number' ? log.day : undefined,
      time: typeof log.time === 'string' ? log.time : undefined,
    }));

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    stats,
    logs,
    savedAt: typeof value.savedAt === 'number' ? value.savedAt : Date.now(),
  };
};

const parseJson = (json: string | null): unknown => {
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
};

export const listSaveSlots = (storage: StorageLike): SaveSlotMeta[] => {
  const rawIndex = parseJson(storage.getItem(SAVE_INDEX_KEY));
  const index = Array.isArray(rawIndex) ? rawIndex.filter(isRecord) : [];

  return Array.from({ length: MAX_SAVE_SLOTS }, (_, id) => {
    const existing = index.find((entry) => entry.id === id);
    if (!existing) return { id, isEmpty: true, savedAt: 0 };

    return {
      id,
      isEmpty: false,
      savedAt: typeof existing.savedAt === 'number' ? existing.savedAt : 0,
      day: typeof existing.day === 'number' ? existing.day : undefined,
      soldiers: typeof existing.soldiers === 'number' ? existing.soldiers : undefined,
      location: typeof existing.location === 'string' ? existing.location : undefined,
    };
  });
};

export const writeSaveSlot = (
  storage: StorageLike,
  slotId: number,
  stats: GameStats,
  logs: GameLog[],
): SaveSlotMeta[] => {
  if (!Number.isInteger(slotId) || slotId < 0 || slotId >= MAX_SAVE_SLOTS) {
    throw new Error('Invalid save slot');
  }

  const saveData: SaveData = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    stats,
    logs: logs.map((log) => ({ ...log, isTyping: false })),
    savedAt: Date.now(),
  };
  storage.setItem(`${SAVE_SLOT_PREFIX}${slotId}`, JSON.stringify(saveData));

  const slots = listSaveSlots(storage);
  slots[slotId] = {
    id: slotId,
    isEmpty: false,
    savedAt: saveData.savedAt,
    day: stats.day,
    soldiers: stats.soldiers,
    location: stats.location,
  };
  storage.setItem(SAVE_INDEX_KEY, JSON.stringify(slots.filter((slot) => !slot.isEmpty)));
  return slots;
};

export const readSaveSlot = (storage: StorageLike, slotId: number): SaveData | null => {
  const parsed = parseJson(storage.getItem(`${SAVE_SLOT_PREFIX}${slotId}`));
  const migrated = migrateSaveData(parsed);
  if (migrated && isRecord(parsed) && parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    storage.setItem(`${SAVE_SLOT_PREFIX}${slotId}`, JSON.stringify(migrated));
  }
  return migrated;
};

const metaFromSave = (save: SaveData, id = -1): SaveSlotMeta => ({
  id,
  isEmpty: false,
  savedAt: save.savedAt,
  day: save.stats.day,
  soldiers: save.stats.soldiers,
  location: save.stats.location,
});

export const writeAutoSave = (
  storage: StorageLike,
  stats: GameStats,
  logs: GameLog[],
): SaveSlotMeta => {
  const saveData: SaveData = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    stats,
    logs: logs.map((log) => ({ ...log, isTyping: false })),
    savedAt: Date.now(),
  };
  storage.setItem(AUTO_SAVE_KEY, JSON.stringify(saveData));
  return metaFromSave(saveData);
};

export const readAutoSave = (storage: StorageLike): SaveData | null => {
  const parsed = parseJson(storage.getItem(AUTO_SAVE_KEY));
  const migrated = migrateSaveData(parsed);
  if (migrated && isRecord(parsed) && parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    storage.setItem(AUTO_SAVE_KEY, JSON.stringify(migrated));
  }
  return migrated;
};

export const getAutoSaveMeta = (storage: StorageLike): SaveSlotMeta | null => {
  const save = readAutoSave(storage);
  return save ? metaFromSave(save) : null;
};
