import { describe, expect, it } from 'vitest';
import { createInitialStats, migrateSaveData, writeAutoSave, readAutoSave } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { localAdvisorResponse } from '../engine/localAdvisor';
import { resolveChapterTurn } from '../engine/chapterEngine';
import { missionCombatNarrative } from '../data/text/chapterNarrative';
import type { ChapterId, GameStats } from '../types';

const start = (id: ChapterId) => {
  const stats = createInitialStats(1937, id);
  return { ...stats, ...runGameTurn(stats, 'start_game').updatedStats };
};
const apply = (stats: GameStats, input: string) => {
  const result = runGameTurn(stats, input);
  return { result, stats: { ...stats, ...result.updatedStats, turnCount: stats.turnCount + (result.turnAdvanced ? 1 : 0) } };
};
const world = ({ localDialogue, pendingRetreat, ...stats }: GameStats) => stats;

describe('chapter-specific dialogue and factual speech', () => {
  it('answers ordinary personal questions with the chapter cast while keeping numerical reports factual', () => {
    for (const id of ['street', 'bridge'] as const) {
      const stats = start(id);
      const concern = apply(stats, '你们还好吗？');
      expect(concern.result.narrative).not.toContain('已用0分钟');
      expect(stats.roster.some(person => concern.result.narrative.includes(person.name))).toBe(true);
      expect(concern.stats.localDialogue?.sequence).toBe(1);
      expect(world(concern.stats)).toEqual(world(stats));
      expect(apply(stats, '请报告任务').result.narrative).toContain('已用0分钟');
      expect(apply(stats, '现在伤员多少？').result.narrative).toContain('待治伤员0人');
      expect(apply(stats, '敌军压力多少？').result.narrative).toContain('敌军压力15/100');
      expect(apply(stats, `${stats.roster[0].name}是谁`).result.narrative).toContain(stats.roster[0].trait);
    }
  });

  it('gives the two fictional squads distinct memories rather than shared generic lines', () => {
    const a = start('street'), b = start('bridge');
    const street: string[] = [], bridge: string[] = [];
    let s = a, t = b;
    for (let i = 0; i < 3; i++) {
      const x = apply(s, '我想家了'), y = apply(t, '我想家了');
      street.push(x.result.narrative); bridge.push(y.result.narrative); s = x.stats; t = y.stats;
    }
    expect(new Set(street).size).toBe(3); expect(new Set(bridge).size).toBe(3);
    expect(street.join('')).toMatch(/周存生|陆文清|许守义/);
    expect(bridge.join('')).toMatch(/韩立秋|钱有根|周述平/);
    expect(street.join('')).not.toMatch(/韩立秋|钱有根|周述平/);
    expect(bridge.join('')).not.toMatch(/周存生|陆文清|许守义/);
  });

  it('never assigns deceased or historical characters a fictional private recollection', () => {
    for (const id of ['street', 'bridge'] as const) {
      let stats = start(id);
      stats.roster = stats.roster.map(person => ({ ...person, status: 'dead', deathReason: 'combat' }));
      stats.soldiers -= 3; stats.soldierDistribution['一楼入口'] -= 3;
      for (let i = 0; i < 3; i++) {
        const reply = apply(stats, '我想家了');
        for (const person of stats.roster) expect(reply.result.narrative).not.toContain(person.name);
        expect(reply.result.narrative).not.toMatch(/我娘爱在门口|我家门槛高|我媳妇嫌我/);
        stats = reply.stats;
      }
      const status = apply(stats, `${stats.roster[0].name}呢`).result.narrative;
      expect(status).toContain('本局已阵亡');
      expect(status).not.toContain('：“');
      stats.roster = stats.roster.map(person => ({ ...person, status: 'alive', origin: '历史人物', id: `real-${person.id}` }));
      for (let i = 0; i < 3; i++) {
        const reply = apply(stats, '我想家了');
        for (const person of stats.roster) expect(reply.result.narrative).not.toContain(person.name);
        stats = reply.stats;
      }
    }
  });

  it('uses only recorded ammunition, wounded and medicine facts in contextual replies', () => {
    for (const id of ['street', 'bridge'] as const) {
      const stats = start(id);
      const noAmmo = apply({ ...stats, ammo: 0 }, '我好害怕');
      expect(noAmmo.result.narrative).toMatch(/七九弹|缺弹/);
      const waiting = { ...stats, wounded: 2, medkits: 0 };
      const noMedicine = apply(waiting, '你们还好吗？');
      expect(noMedicine.result.narrative).toMatch(/伤员|人还在/);
      expect(noMedicine.result.narrative).toMatch(/没有|为零|耗尽/);
      expect(world(noMedicine.stats)).toEqual(world(waiting));
      expect(apply({ ...stats, medkits: 0 }, '你们还好吗？').result.narrative).not.toMatch(/还有伤员|仍有伤员|伤员在等/);
    }
  });

  it('keeps found people separate from safely escorted people and bridge progress separate from extraction', () => {
    const street = start('street'); street.mission!.found = 4;
    const waiting = apply(street, '副官').result.narrative;
    expect(waiting).toMatch(/找到|抵达|护送/);
    expect(world(apply(street, '副官').stats)).toEqual(world(street));
    const bridge = start('bridge'); bridge.mission!.crossed = 60;
    const complete = apply(bridge, '副官');
    expect(complete.result.narrative).toMatch(/六十|人数目标/);
    expect(complete.stats.isGameOver).toBe(false);
    bridge.mission!.elapsedMinutes = 150;
    expect(apply(bridge, '快点啊').result.narrative).toMatch(/时间|封锁|分钟/);
  });

  it('preserves rotation across a saved game and keeps the advisor preview read-only', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const reply = apply(start('street'), '我想家了');
    writeAutoSave(storage, reply.stats, []);
    const loaded = readAutoSave(storage)!.stats;
    expect(loaded.localDialogue).toEqual(reply.stats.localDialogue);
    expect(apply(loaded, '我想家了').result.narrative).not.toBe(reply.result.narrative);
    expect(migrateSaveData({ stats: loaded })?.stats.localDialogue).toEqual(loaded.localDialogue);
    const before = structuredClone(loaded);
    localAdvisorResponse('你们还好吗？', loaded);
    getActionPreview(loaded, '我想家了');
    expect(loaded).toEqual(before);
  });

  it('does not let hundreds of chats change the next real contact, resources, roster or battle RNG', () => {
    for (const id of ['street', 'bridge'] as const) {
      const quiet = start(id); quiet.siegeMeter = 68;
      let chatted = structuredClone(quiet);
      const inputs = ['你好', '我想家了', '你们还好吗？', '你怕不怕？', '我饿了', '我好累啊', '谢谢你', '讲个笑话', '对不起', '我投降'];
      for (let i = 0; i < 240; i++) {
        const reply = apply(chatted, inputs[i % inputs.length]);
        expect(reply.result.turnAdvanced).not.toBe(true);
        expect(world(reply.stats)).toEqual(world(quiet));
        chatted = reply.stats;
      }
      const command = id === 'street' ? '搜救街巷' : '压制射击';
      expect(world(apply(chatted, command).stats)).toEqual(world(apply(quiet, command).stats));
    }
  });

  it('describes injuries and deaths only after the corresponding contact losses are settled', () => {
    const protectedSquad = start('bridge');
    protectedSquad.mission!.cover = 3; protectedSquad.siegeMeter = 69;
    const safe = resolveChapterTurn(protectedSquad, '压制射击', () => 0);
    expect(safe.eventTriggered).toBe('attack');
    expect(safe.updatedStats.soldiers).toBe(protectedSquad.soldiers);
    expect(safe.narrative).not.toMatch(/【伤员送下】|【阵亡清点】/);
    const exposed = start('bridge'); exposed.siegeMeter = 69;
    const losses = resolveChapterTurn(exposed, '压制射击', () => 0.999);
    expect(losses.updatedStats.wounded).toBe(3);
    expect(losses.updatedStats.soldiers).toBe(exposed.soldiers - 5);
    expect(losses.narrative).toContain('【伤员送下】');
    expect(losses.narrative).toContain('【阵亡清点】');
    const memories = new Set(Array.from({ length: 3 }, (_, turn) => missionCombatNarrative('bridge', turn, 60, 1, 0)[1]));
    expect(memories.size).toBe(3);
    expect(missionCombatNarrative('street', 1, 20, 1, 0).join('')).not.toContain('【阵亡清点】');
  });
});
