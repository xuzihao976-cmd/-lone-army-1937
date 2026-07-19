import { describe, expect, it } from 'vitest';
import {
  createInitialStats,
  getAutoSaveMeta,
  listSaveSlots,
  MAX_SAVE_SLOTS,
  migrateSaveData,
  readAutoSave,
  readSaveSlot,
  SAVE_SCHEMA_VERSION,
  writeAutoSave,
  writeSaveSlot,
} from '../storage/saveStore';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('versioned saves', () => {
  it('migrates a v1 save and restores newly added defaults', () => {
    const oldStats = createInitialStats();
    const {
      usedTacticalCards: _removed,
      rngState: _oldRandomState,
      lastStandUsed: _oldLastStand,
      sectorIntegrity: _oldSectorIntegrity,
      sealedApproaches: _oldSealedApproaches,
      ...legacyStats
    } = oldStats;
    const migrated = migrateSaveData({
      stats: { ...legacyStats, day: 3, soldiers: 233 },
      logs: [{ id: '1', sender: 'system', text: '旧战报', isTyping: true }],
      savedAt: 100,
    });

    expect(migrated?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated?.stats.day).toBe(3);
    expect(migrated?.stats.soldiers).toBe(233);
    expect(migrated?.stats.usedTacticalCards).toEqual([]);
    expect(migrated?.stats.rngState).toEqual(expect.any(Number));
    expect(migrated?.stats.lastStandUsed).toBe(false);
    expect(migrated?.stats.sectorIntegrity).toEqual({
      '一楼入口': 100,
      '二楼阵地': 100,
      '屋顶': 100,
      '地下室': 100,
    });
    expect(migrated?.stats.sealedApproaches).toEqual([]);
    expect(migrated?.logs[0].isTyping).toBe(false);
  });

  it('round-trips a current save slot', () => {
    const storage = new MemoryStorage();
    const stats = createInitialStats();
    stats.day = 2;
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.sealedApproaches = ['二楼阵地'];
    writeSaveSlot(storage, 4, stats, [{ id: 'log', sender: 'system', text: '战报', day: 2, time: '13:30' }]);

    const loaded = readSaveSlot(storage, 4);
    expect(loaded?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded?.stats.day).toBe(2);
    expect(loaded?.stats.sectorIntegrity['一楼入口']).toBe(0);
    expect(loaded?.stats.sealedApproaches).toEqual(['二楼阵地']);
    expect(loaded?.logs[0].text).toBe('战报');
    expect(loaded?.logs[0]).toMatchObject({ day: 2, time: '13:30' });
  });

  it('rejects malformed save data', () => {
    expect(migrateSaveData({ nope: true })).toBeNull();
    expect(migrateSaveData(null)).toBeNull();
  });

  it('exposes exactly five manual slots', () => {
    const storage = new MemoryStorage();
    expect(MAX_SAVE_SLOTS).toBe(5);
    expect(listSaveSlots(storage)).toHaveLength(5);
    expect(() => writeSaveSlot(storage, 5, createInitialStats(), [])).toThrow('Invalid save slot');
  });

  it('round-trips the independent auto-save', () => {
    const storage = new MemoryStorage();
    const stats = createInitialStats();
    stats.day = 4;
    stats.location = '屋顶';
    writeAutoSave(storage, stats, [{ id: 'auto', sender: 'system', text: '自动战报', isTyping: true }]);

    expect(getAutoSaveMeta(storage)).toMatchObject({ id: -1, day: 4, location: '屋顶' });
    expect(readAutoSave(storage)?.logs[0]).toMatchObject({ text: '自动战报', isTyping: false });
    expect(listSaveSlots(storage).every((slot) => slot.isEmpty)).toBe(true);
  });
});
