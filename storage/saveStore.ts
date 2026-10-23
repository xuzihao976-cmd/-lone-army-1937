import { sanitizeDialogueMemory } from '../engine/localConversation';
import { INITIAL_STATS } from '../constants';
import { applyChapterSetup, isChapterId, sanitizeMission } from '../data/chapters';
import type { ChapterId, GameLog, GameStats, SaveData, SaveSlotMeta, TurnSummary } from '../types';

export const SAVE_SCHEMA_VERSION = 11;
export const SAVE_INDEX_KEY = 'lone_army_save_index';
export const SAVE_SLOT_PREFIX = 'lone_army_slot_';
export const AUTO_SAVE_KEY = 'lone_army_autosave';
export const CHAPTER_SAVE_PREFIX = 'lone_army_chapter_autosave_';
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

export const createInitialStats = (seed = createRandomSeed(), chapterId: ChapterId = 'sihang'): GameStats => {
  if (!isChapterId(chapterId)) throw new Error('Unknown chapter');
  const stats = typeof structuredClone === 'function'
    ? structuredClone(INITIAL_STATS)
    : JSON.parse(JSON.stringify(INITIAL_STATS)) as GameStats;
  stats.rngState = seed >>> 0 || INITIAL_STATS.rngState;
  stats.campaignId = `${chapterId}-${stats.rngState}`;
  return applyChapterSetup(stats, chapterId);
};

export const migrateSaveData = (value: unknown): SaveData | null => {
  if (!isRecord(value) || !isRecord(value.stats)) return null;
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > SAVE_SCHEMA_VERSION) return null;

  const incoming = value.stats as Partial<GameStats>;
  if (incoming.chapterId !== undefined && !isChapterId(incoming.chapterId)) return null;
  const chapterId = incoming.chapterId ?? 'sihang';
  const base = createInitialStats(incoming.rngState, chapterId);
  const mission = chapterId === 'sihang' ? undefined : sanitizeMission(incoming.mission, chapterId);
  if (chapterId !== 'sihang' && !mission) return null;
  const stats: GameStats = {
    ...base,
    ...incoming,
    chapterId,
    campaignId: typeof incoming.campaignId === 'string' && /^[a-z0-9-]{1,80}$/.test(incoming.campaignId)
      ? incoming.campaignId : `legacy-${chapterId}-${base.rngState}`,
    mission: mission ?? undefined,
    localDialogue: sanitizeDialogueMemory(incoming.localDialogue),
    pendingDilemmaId: null,
    preparedOrders: Object.fromEntries(Object.entries(incoming.preparedOrders || {}).filter(([location, order]) => ['屋顶', '二楼阵地', '一楼入口', '地下室'].includes(location) && ['rapid', 'conserve', 'close', 'bayonet', 'hold'].includes(String(order)))),
    lastEncourageTurn: typeof incoming.lastEncourageTurn === 'number' && Number.isFinite(incoming.lastEncourageTurn) ? incoming.lastEncourageTurn : -999,
    pendingRetreat: null,
    roster: Array.isArray(incoming.roster) ? incoming.roster : base.roster,
    hmgSquads: Array.isArray(incoming.hmgSquads) ? incoming.hmgSquads : base.hmgSquads,
    specialistSquads: Array.isArray(incoming.specialistSquads) ? incoming.specialistSquads : base.specialistSquads,
    triggeredEvents: Array.isArray(incoming.triggeredEvents) ? incoming.triggeredEvents : [],
    usedTacticalCards: Array.isArray(incoming.usedTacticalCards) ? incoming.usedTacticalCards : [],
    consequenceFlags: Array.isArray(incoming.consequenceFlags) ? incoming.consequenceFlags : [],
    campaignHistory: Array.isArray(incoming.campaignHistory) ? incoming.campaignHistory : [],
    enemyOperation: isRecord(incoming.enemyOperation) ? incoming.enemyOperation as unknown as GameStats['enemyOperation'] : base.enemyOperation,
    soldierDistribution: { ...base.soldierDistribution, ...(incoming.soldierDistribution ?? {}) },
    sectorIntegrity: { ...base.sectorIntegrity, ...(incoming.sectorIntegrity ?? {}) },
    sealedApproaches: Array.isArray(incoming.sealedApproaches)
      ? incoming.sealedApproaches.filter((location): location is GameStats['location'] =>
          ['屋顶', '二楼阵地', '一楼入口', '地下室'].includes(String(location)))
      : [],
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
      chapterId: isChapterId(existing.chapterId) ? existing.chapterId : 'sihang',
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
    chapterId: stats.chapterId,
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
  chapterId: save.stats.chapterId,
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
  // Preserve a pre-chapter legacy autosave before changing the most-recent slot.
  const previous = readAutoSave(storage);
  if (previous && previous.stats.chapterId !== stats.chapterId) {
    storage.setItem(`${CHAPTER_SAVE_PREFIX}${previous.stats.chapterId}`, JSON.stringify(previous));
  }
  storage.setItem(`${CHAPTER_SAVE_PREFIX}${stats.chapterId}`, JSON.stringify(saveData));
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

export const readChapterAutoSave = (storage: StorageLike, chapterId: ChapterId): SaveData | null => {
  const own = migrateSaveData(parseJson(storage.getItem(`${CHAPTER_SAVE_PREFIX}${chapterId}`)));
  if (own?.stats.chapterId === chapterId) return own;
  const recent = readAutoSave(storage);
  return recent?.stats.chapterId === chapterId ? recent : null;
};

export const getChapterSaveMetas = (storage: StorageLike): Partial<Record<ChapterId, SaveSlotMeta>> => {
  const result: Partial<Record<ChapterId, SaveSlotMeta>> = {};
  for (const id of ['street', 'bridge', 'sihang'] as const) {
    const save = readChapterAutoSave(storage, id);
    if (save) result[id] = metaFromSave(save);
  }
  return result;
};
