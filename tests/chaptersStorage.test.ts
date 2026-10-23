import { describe, expect, it } from 'vitest';
import { createInitialStats, migrateSaveData, writeAutoSave, readAutoSave, readChapterAutoSave,
  writeSaveSlot, readSaveSlot, listSaveSlots, AUTO_SAVE_KEY, SAVE_SCHEMA_VERSION } from '../storage/saveStore';
import { CHAPTERS } from '../data/chapters';
import { recordChapterResult, readChapterArchive } from '../storage/chapterArchive';
const storage = () => { const data = new Map<string, string>(); return {
  getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
}; };

describe('chapter save and archive isolation', () => {
  it('migrates a v10 warehouse save without resetting resources or dialogue', () => {
    const old = createInitialStats(88);
    const { chapterId, campaignId, ...legacy } = old;
    legacy.ammo = 123;
    legacy.wounded = 7;
    const migrated = migrateSaveData({ schemaVersion: 10, stats: legacy, logs: [] })!;
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.stats).toMatchObject({ chapterId: 'sihang', ammo: 123, wounded: 7, rngState: 88 });
  });
  it('preserves the legacy recent save before opening a different chapter', () => {
    const s = storage();
    s.setItem(AUTO_SAVE_KEY, JSON.stringify({ schemaVersion: 10, stats: { ...createInitialStats(12), chapterId: undefined }, logs: [] }));
    writeAutoSave(s, createInitialStats(24, 'street'), []);
    expect(readAutoSave(s)?.stats.chapterId).toBe('street');
    expect(readChapterAutoSave(s, 'sihang')?.stats.rngState).toBe(12);
    expect(readChapterAutoSave(s, 'street')?.stats.rngState).toBe(24);
  });
  it('keeps all three chapter autosaves and a manual slot independent', () => {
    const s = storage();
    CHAPTERS.forEach((chapter, i) => writeAutoSave(s, createInitialStats(70 + i, chapter.id), []));
    writeSaveSlot(s, 2, createInitialStats(99, 'bridge'), []);
    CHAPTERS.forEach((chapter, i) => expect(readChapterAutoSave(s, chapter.id)?.stats.rngState).toBe(70 + i));
    expect(readSaveSlot(s, 2)?.stats.chapterId).toBe('bridge');
    expect(listSaveSlots(s)[2].chapterId).toBe('bridge');
  });
  it('rejects unknown chapters and damaged progress instead of silently restarting', () => {
    expect(migrateSaveData({ stats: { ...createInitialStats(), chapterId: 'unknown' } })).toBeNull();
    const stats = createInitialStats(1, 'street');
    stats.mission!.evacuated = 9;
    expect(migrateSaveData({ stats })).toBeNull();
    expect(migrateSaveData({ stats: { ...stats, mission: undefined } })).toBeNull();
  });
  it('records a chapter result once and never restores troops or clears other chapters', () => {
    const s = storage();
    const stats = createInitialStats(1, 'street');
    stats.isGameOver = true; stats.gameResult = 'victory_evacuation'; stats.mission!.evacuated = 8;
    const before = structuredClone(stats);
    const first = recordChapterResult(s, stats);
    expect(recordChapterResult(s, stats)).toEqual(first);
    expect(stats).toEqual(before);
    const other = createInitialStats(2, 'bridge');
    other.isGameOver = true; other.gameResult = 'defeat_mission';
    recordChapterResult(s, other);
    expect(readChapterArchive(s).street?.cleared).toBe(true);
    expect(readChapterArchive(s).bridge?.cleared).toBe(false);
  });
});
