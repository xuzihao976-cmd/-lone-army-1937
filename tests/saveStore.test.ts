import { describe, expect, it } from 'vitest';
import { createInitialStats, migrateSaveData, readSaveSlot, SAVE_SCHEMA_VERSION, writeSaveSlot } from '../storage/saveStore';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('versioned saves', () => {
  it('migrates a v1 save and restores newly added defaults', () => {
    const oldStats = createInitialStats();
    const { usedTacticalCards: _removed, rngState: _oldRandomState, ...legacyStats } = oldStats;
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
    expect(migrated?.logs[0].isTyping).toBe(false);
  });

  it('round-trips a current save slot', () => {
    const storage = new MemoryStorage();
    const stats = createInitialStats();
    stats.day = 2;
    writeSaveSlot(storage, 4, stats, [{ id: 'log', sender: 'system', text: '战报' }]);

    const loaded = readSaveSlot(storage, 4);
    expect(loaded?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded?.stats.day).toBe(2);
    expect(loaded?.logs[0].text).toBe('战报');
  });

  it('rejects malformed save data', () => {
    expect(migrateSaveData({ nope: true })).toBeNull();
    expect(migrateSaveData(null)).toBeNull();
  });
});
