import { describe, expect, it } from 'vitest';
import { ALL_DILEMMAS, TACTICAL_CARDS } from '../data/text/events';
import { createInitialStats, migrateSaveData, readAutoSave, writeAutoSave, SAVE_SCHEMA_VERSION } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { localAdvisorResponse } from '../engine/localAdvisor';
import { canOfferEvent, getEventPlan, getPendingEvent, issueEvent } from '../engine/eventPlans';
import { resolveDilemma } from '../engine/dilemmaResolver';
import { finalizeTurn } from '../engine/turnFinalizer';
import type { GameStats } from '../types';

const fresh = (seed = 1): GameStats => ({ ...createInitialStats(seed), tutorialStep: 3, day: 3, currentTime: '10:00' });
const owned = (id: string, seed = 1): GameStats => {
  const s = fresh(seed), event = ALL_DILEMMAS.find(e => e.id === id)!;
  s.consequenceFlags = event.requiresFlag ? [event.requiresFlag] : [];
  s.enemyOperation!.revealed = true;
  return { ...s, ...issueEvent(s, id) };
};
const lowForce = (s: GameStats) => {
  s.soldiers = 2; s.hmgSquads = []; s.specialistSquads = []; s.roster = []; s.lastStandUsed = true;
  s.soldierDistribution = { '一楼入口': 2, '二楼阵地': 0, '地下室': 0, '屋顶': 0 };
};
const apply = (s: GameStats, input: string) => {
  const result = runGameTurn(s, input);
  return { result, stats: { ...s, ...result.updatedStats, turnCount: s.turnCount + (result.turnAdvanced ? 1 : 0) } };
};
const finish = (s: GameStats, random: () => number = () => 0) => {
  const updates: Partial<GameStats> = {};
  const result = finalizeTurn({ currentStats: s, calculatedStats: updates, actionType: 'audit', attackLocation: null,
    eventTriggered: 'none', visualEffect: 'none', narrativeParts: [], statsLog: [], random, allowRandomEvents: true });
  return { result, stats: { ...s, ...updates, turnCount: s.turnCount + 1 } };
};

describe('existing event ownership and real consequences', () => {
  it('preserves the nine legacy IDs and bounds all event deaths by actual dispatched infantry', () => {
    expect(ALL_DILEMMAS.map(e => e.id)).toEqual(['student_run', 'smuggler_boat', 'puppet_defector', 'wrecked_truck',
      'stray_airdrop', 'brit_ceasefire', 'student_thanks', 'smuggler_return', 'british_pressure']);
    for (const id of ['student_run', 'smuggler_boat', 'wrecked_truck', 'stray_airdrop']) for (let seed = 1; seed <= 32; seed++) {
      const s = owned(id, seed); lowForce(s);
      const { result, stats } = apply(s, `evt_resolve:${id}:0`);
      const count = Number(result.narrative.match(/(?:接应阵亡|伏击阵亡|抢运阵亡|意外坠亡): (\d+)人/)?.[1] ?? 0);
      expect(count, `${id}/${seed}`).toBeLessThanOrEqual(2);
      expect(s.soldiers - stats.soldiers).toBe(count);
      expect(Object.values(stats.soldierDistribution).reduce((a,b) => a+b,0)).toBe(stats.soldiers);
      if (stats.soldiers === 0) expect(stats.isGameOver).toBe(true);
    }
  });

  it('fixes the two-infantry ten-death report, morale penalty and missing immediate ending together', () => {
    const s = owned('student_run'); lowForce(s);
    const { result, stats } = apply(s, 'evt_resolve:student_run:0');
    expect(result.narrative).toContain('接应阵亡: 2人');
    expect(stats.morale).toBe(76); expect(stats.soldiers).toBe(0);
    expect(stats.isGameOver).toBe(true); expect(result.eventTriggered).toBe('game_over');
    expect(stats.pendingEvent).toBeNull();
    expect(stats.campaignHistory.find(e => e.title === '学生冲桥')?.detail).toContain('实际阵亡2名');
    expect(result.summary?.durationMinutes).toBe(15);
  });

  it('keeps insufficient-resource choices pending, unspent and retryable through a valid alternative', () => {
    const s = owned('smuggler_return'); s.ammo = 299;
    const before = structuredClone(s);
    const blocked = apply(s, 'evt_resolve:smuggler_return:0');
    expect(blocked.stats).toEqual(before);
    expect(blocked.result.narrative).toContain('当前只有299发');
    expect(blocked.result.dilemma?.options[0].available).toBe(false);
    expect(getActionPreview(s, 'evt_resolve:smuggler_return:0')).toMatchObject({ available: false, durationMinutes: 0, costs: [] });
    const refused = apply(blocked.stats, 'evt_resolve:smuggler_return:1');
    expect(refused.stats.ammo).toBe(299);
    expect(refused.stats.consequenceFlags).toContain('smuggler_network_resolved');
    expect(refused.stats.pendingEvent).toBeNull();
    const material = owned('puppet_defector'); material.sandbags = 29;
    expect(apply(material, 'evt_resolve:puppet_defector:2').stats).toEqual(material);
  });

  it('offers honest isolation and verification choices without fake fortification damage', () => {
    const safe = owned('puppet_defector'); safe.fortificationLevel['一楼入口'] = 0; safe.fortificationBuildCounts['一楼入口'] = 0;
    const before = structuredClone(safe);
    const checked = resolveDilemma(safe, 'puppet_defector', 2, () => 0, () => { throw new Error('No deaths in isolation'); });
    expect(checked.updatedStats.sandbags).toBe(safe.sandbags - 30);
    expect(checked.updatedStats.soldiers).toBeUndefined(); expect(checked.updatedStats.wounded).toBeUndefined();
    expect(checked.updatedStats.fortificationLevel).toBeUndefined(); expect(safe).toEqual(before);
    const blast = resolveDilemma(safe, 'puppet_defector', 0, () => 0, () => { throw new Error('Injuries are not deaths'); });
    expect(blast.updatedStats.wounded).toBe(2); expect(blast.updatedStats.soldiers).toBe(safe.soldiers - 2);
    expect(blast.narrative).toContain('没有报成阵亡');
  });

  it('advances time, enemy contact, fatigue and existing wound timers once for a timed event', () => {
    const s = owned('smuggler_boat', 44); s.location = '地下室'; s.enemyOperation!.turnsRemaining = 1;
    s.wounded = 3; s.woundedTimer = 100;
    const before = structuredClone(s);
    const preview = getActionPreview(s, 'evt_resolve:smuggler_boat:2')!;
    localAdvisorResponse('evt_resolve:smuggler_boat:2', s);
    expect(s).toEqual(before); expect(preview).toMatchObject({ durationMinutes: 30, attackChance: 1, enemyAdvanceSteps: 1 });
    const { result, stats } = apply(s, 'evt_resolve:smuggler_boat:2');
    expect(stats.currentTime).toBe('10:30'); expect(stats.woundedTimer).toBe(130);
    expect(stats.fatigue).toBeGreaterThan(s.fatigue); expect(stats.lastAttackTurn).toBe(s.turnCount + 1);
    expect(result.turnAdvanced).toBe(true); expect(result.dilemma).toBeUndefined();
    expect(result.summary?.durationMinutes).toBe(30);
  });

  it('reveals a lawful attack for free and never redirects it to a lost basement', () => {
    const s = owned('british_pressure'); s.sectorIntegrity['地下室'] = 0;
    s.enemyOperation!.target = '地下室'; s.enemyOperation!.turnsRemaining = 6;
    const { result, stats } = apply(s, 'evt_resolve:british_pressure:0');
    expect(stats.enemyOperation!.target).not.toBe('地下室');
    expect(stats.sectorIntegrity[stats.enemyOperation!.target]).toBeGreaterThan(0);
    expect(stats.enemyOperation).toMatchObject({ revealed: true, turnsRemaining: 6 });
    expect(stats.sandbags).toBe(s.sandbags); expect(stats.soldierDistribution).toEqual(s.soldierDistribution);
    expect(result.turnAdvanced).toBe(false);
    const diplomacy = owned('brit_ceasefire'); diplomacy.sectorIntegrity['地下室'] = 0;
    expect(getActionPreview(diplomacy, 'evt_resolve:brit_ceasefire:1')?.projectedContactTurns).toBe(6);
    const refused = apply(diplomacy, 'evt_resolve:brit_ceasefire:1').stats;
    expect(refused.enemyOperation!.target).not.toBe('地下室'); expect(refused.enemyOperation!.revealed).toBe(false);
  });

  it('delivers qualified follow-ups as one-time notices without another lottery or forced modal', () => {
    for (const [flag,id,reward] of [['students_rescued','student_thanks',8],['british_defied','british_pressure',0]] as const) {
      const s = fresh(); s.consequenceFlags = [flag]; s.activeTacticalCard = TACTICAL_CARDS[0];
      const notice = finish(s, () => 0.9);
      expect(notice.stats.triggeredEvents).toContain(id); expect(notice.result.dilemma).toBeUndefined();
      expect(notice.stats.pendingEvent).toBeNull(); expect(notice.stats.medkits).toBe(s.medkits + reward);
      const replay = apply(notice.stats, `evt_resolve:${id}:0`);
      expect(replay.stats).toEqual(notice.stats);
    }
  });

  it('filters new offers by actual context and spaces them using only real action turns', () => {
    const s = fresh(); s.day = 0;
    expect(ALL_DILEMMAS.some(e => canOfferEvent(s, e))).toBe(false);
    s.day = 3; s.ammo = 12000; s.medkits = 5; s.wounded = 1; s.activeTacticalCard = TACTICAL_CARDS[0];
    const truck = ALL_DILEMMAS.find(e => e.id === 'wrecked_truck')!;
    expect(canOfferEvent(s, truck)).toBe(false);
    s.enemyOperation!.revealed = true; expect(canOfferEvent(s, truck)).toBe(true);
    const noAmmo = { ...s, ammo: 0 };
    expect(canOfferEvent(noAmmo, ALL_DILEMMAS.find(e => e.id === 'student_run')!)).toBe(false);
    const deferred = { ...s, ammo: 299, consequenceFlags: ['smuggler_trusted'] };
    expect(canOfferEvent(deferred, ALL_DILEMMAS.find(e => e.id === 'smuggler_return')!)).toBe(false);
    const first = finish(s); expect(getPendingEvent(first.stats)?.id).toBe('student_run');
    const declined = apply(first.stats, 'evt_resolve:student_run:1').stats;
    expect(finish(declined).result.dilemma).toBeUndefined();
    const spaced = finish({ ...declined, turnCount: declined.turnCount + 1 });
    expect(spaced.result.dilemma).toBeDefined();
  });

  it('round-trips verified pending events, preserves choices and RNG, and safely migrates v12', () => {
    const s = migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:fresh()})!.stats;
    s.turnCount = 7; s.consequenceFlags = ['smuggler_trusted']; s.ammo = 299;
    Object.assign(s, issueEvent(s, 'smuggler_return'));
    const data = new Map<string,string>(); const storage = { getItem:(k:string)=>data.get(k)??null, setItem:(k:string,v:string)=>{data.set(k,v);} };
    writeAutoSave(storage, s, []);
    const loaded = readAutoSave(storage)!.stats;
    expect(loaded).toEqual(s); expect(getPendingEvent(loaded)?.id).toBe('smuggler_return');
    expect(getEventPlan(loaded, 'evt_resolve:smuggler_return:0')?.available).toBe(false);
    const old = migrateSaveData({ schemaVersion:12, stats:s })!.stats;
    expect(old.pendingEvent).toBeNull(); expect(old.pendingDilemmaId).toBeNull();
    expect(old.ammo).toBe(299); expect(old.rngState).toBe(s.rngState);
  });

  it('rejects forged, cross-chapter, stale and replayed tickets without resetting the campaign', () => {
    const s = owned('smuggler_return');
    for (const patch of [{campaignId:'other'},{eventId:'student_run'},{version:2},{turn:1},{day:4},{time:'10:01'}]) {
      expect(migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:{...s,pendingEvent:{...s.pendingEvent,...patch}}})).toBeNull();
    }
    expect(migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:{...s,pendingEvent:null}})).toBeNull();
    const short = createInitialStats(1,'bridge');
    expect(migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:{...short,...issueEvent(short,'student_run')}})).toBeNull();
    const resolved = {...s,triggeredEvents:['smuggler_return']};
    expect(migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:resolved})).toBeNull();
    expect(apply(resolved,'evt_resolve:smuggler_return:0').stats).toEqual(resolved);
  });

  it('keeps other commands, unsafe expressions, previews and the advisor from changing a pending world', () => {
    const s = owned('smuggler_boat'); s.activeTacticalCard = TACTICAL_CARDS[0]; const before = structuredClone(s);
    for (const input of ['侦察敌情','搜寻物资','振作起来','一楼阵地节约弹药','card_resolve:morale_boost','evt_resolve:student_run:0',
      '不要evt_resolve:smuggler_boat:0','“evt_resolve:smuggler_boat:0”','evt_resolve:smuggler_boat:0:extra','start_game']) {
      expect(apply(s,input).stats,input).toEqual(before);
    }
    for (const option of ALL_DILEMMAS.find(e=>e.id==='smuggler_boat')!.options) {
      getActionPreview(s,option.actionCmd); localAdvisorResponse(option.actionCmd,s);
    }
    expect(s).toEqual(before);
    expect(getActionPreview(s,'振作起来')?.durationMinutes).toBe(0);
    const free = fresh(); free.pendingRetreat = null; const original = structuredClone(free);
    for (const question of ['英军通牒怎么选？','偏离的空投有什么风险？','门外的白旗怎么核验？']) {
      expect(localAdvisorResponse(question,free).known).toBe(true);
      expect(apply(free,question).stats).toEqual(original);
      expect(getActionPreview(free,question)?.durationMinutes).toBe(0);
    }
  });

  it('does not punish prudent refusals or silently perform ground recovery when the player abandons it', () => {
    for (const [id,option] of [['student_run',1],['puppet_defector',1],['wrecked_truck',1],['stray_airdrop',2]] as const) {
      const s = owned(id); const {result,stats}=apply(s,`evt_resolve:${id}:${option}`);
      expect(stats.morale).toBe(s.morale); expect(stats.soldiers).toBe(s.soldiers);
      expect(stats.ammo).toBe(s.ammo); expect(stats.sandbags).toBe(s.sandbags);
      expect(stats.currentTime).toBe(s.currentTime); expect(result.turnAdvanced).toBe(false);
    }
  });

  it('does not age newly injured event personnel as if they were already overdue wounded', () => {
    let observed = false;
    for (let seed=1;seed<=32;seed++) {
      const s=owned('puppet_defector',seed);s.fortificationLevel['一楼入口']=0;s.fortificationBuildCounts['一楼入口']=0;
      s.wounded=1;s.woundedTimer=719;
      const {stats,result}=apply(s,'evt_resolve:puppet_defector:0');
      if(result.narrative.includes('【入口爆炸】')) { observed=true;expect(stats.wounded).toBeGreaterThanOrEqual(2); }
    }
    expect(observed).toBe(true);
  });
});
