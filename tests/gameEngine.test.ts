import { describe, expect, it } from 'vitest';
import { runGameTurn } from '../engine/gameEngine';
import { createInitialStats } from '../storage/saveStore';
import type { GameStats } from '../types';

const applyTurnUpdate = (stats: GameStats, update: Partial<GameStats>): GameStats => ({
  ...stats,
  ...update,
  fortificationLevel: { ...stats.fortificationLevel, ...(update.fortificationLevel ?? {}) },
  fortificationBuildCounts: { ...stats.fortificationBuildCounts, ...(update.fortificationBuildCounts ?? {}) },
  sectorIntegrity: { ...stats.sectorIntegrity, ...(update.sectorIntegrity ?? {}) },
});

describe('local game engine endings', () => {
  it('keeps the tutorial fortification after the real battle begins', () => {
    const initial = createInitialStats(1937);
    const started = applyTurnUpdate(initial, runGameTurn(initial, 'start_game').updatedStats);
    const fortified = applyTurnUpdate(started, runGameTurn(started, '加固一楼').updatedStats);

    expect(fortified.tutorialStep).toBe(2);
    expect(fortified.fortificationLevel['一楼入口']).toBe(2);
    expect(fortified.fortificationBuildCounts['一楼入口']).toBe(4);

    const formal = applyTurnUpdate(fortified, runGameTurn(fortified, '休息整顿').updatedStats);
    expect(formal.tutorialStep).toBe(3);
    expect(formal.day).toBe(1);
    expect(formal.fortificationLevel['一楼入口']).toBe(2);
    expect(formal.fortificationBuildCounts['一楼入口']).toBe(4);

    formal.siegeMeter = 0;
    const nextBuild = applyTurnUpdate(formal, runGameTurn(formal, '加固一楼').updatedStats);
    expect(nextBuild.fortificationLevel['一楼入口']).toBe(2);
    expect(nextBuild.fortificationBuildCounts['一楼入口']).toBe(5);
  });

  it('only accepts fortifying the first floor for tutorial step one', () => {
    const initial = createInitialStats(1937);
    const started = applyTurnUpdate(initial, runGameTurn(initial, 'start_game').updatedStats);
    const wrongFloor = runGameTurn(started, '加固屋顶');

    expect(wrongFloor.updatedStats.tutorialStep).toBeUndefined();
    expect(wrongFloor.narrative).toContain('加固');
    expect(wrongFloor.narrative).toContain('1/2');
  });

  it('skips the tutorial without putting returning players at a disadvantage', () => {
    const initial = createInitialStats(1937);
    const started = applyTurnUpdate(initial, runGameTurn(initial, 'start_game').updatedStats);
    const skipped = applyTurnUpdate(started, runGameTurn(started, 'skip_tutorial').updatedStats);

    expect(skipped.tutorialStep).toBe(3);
    expect(skipped.day).toBe(1);
    expect(skipped.currentTime).toBe('08:00');
    expect(skipped.fortificationLevel['一楼入口']).toBe(2);
    expect(skipped.fortificationBuildCounts['一楼入口']).toBe(4);
    expect(skipped.morale).toBe(95);
  });

  it('requires confirmation before an early retreat ending', () => {
    const stats = createInitialStats();
    stats.tutorialStep = 3;
    stats.day = 1;

    const warning = runGameTurn(stats, '全军撤退');
    expect(warning.updatedStats.isGameOver).not.toBe(true);
    expect(warning.dilemma?.id).toBe('confirm_desertion');

    const ending = runGameTurn(stats, 'confirm_desertion');
    expect(ending.updatedStats.isGameOver).toBe(true);
    expect(ending.updatedStats.gameResult).toBe('defeat_deserter');
  });

  it('allows the historical retreat only from day four', () => {
    const early = createInitialStats();
    early.tutorialStep = 3;
    early.day = 2;
    expect(runGameTurn(early, 'confirm_historical_retreat').updatedStats.isGameOver).not.toBe(true);

    const late = createInitialStats();
    late.tutorialStep = 3;
    late.day = 4;
    const warning = runGameTurn(late, '撤入租界');
    expect(warning.dilemma?.id).toBe('confirm_historical_retreat');
    const ending = runGameTurn(late, 'confirm_historical_retreat');
    expect(ending.updatedStats.gameResult).toBe('victory_retreat');
  });

  it('treats walking to the roof as movement, not desertion', () => {
    const stats = createInitialStats();
    stats.tutorialStep = 3;
    stats.day = 1;
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '走到屋顶');
    expect(result.updatedStats.location).toBe('屋顶');
    expect(result.updatedStats.gameResult).not.toBe('defeat_deserter');
    expect(result.dilemma?.id).not.toBe('confirm_desertion');
  });

  it('repeats the same outcome from the same saved random state', () => {
    const stats = createInitialStats(20260719);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '19:00';
    stats.siegeMeter = 0;

    const first = runGameTurn(stats, '搜寻物资');
    const replay = runGameTurn(structuredClone(stats), '搜寻物资');
    expect(replay).toEqual(first);
    expect(first.updatedStats.rngState).not.toBe(stats.rngState);
  });

  it('creates a separate settlement summary after an attack', () => {
    const stats = createInitialStats(1937);
    stats.tutorialStep = 3;
    stats.day = 3;
    stats.currentTime = '19:00';
    stats.siegeMeter = 100;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.eventTriggered).toBe('attack');
    expect(result.summary?.kind).toBe('battle');
    expect(result.summary?.title).toBe('敌军进攻结算');
    expect(result.summary?.notes.some((note) => note.includes('工事等级'))).toBe(true);
  });

  it('does not spend time or count aggression for a blocked daytime raid', () => {
    const stats = createInitialStats(2026);
    stats.tutorialStep = 3;
    stats.currentTime = '14:00';
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '火力突袭');
    expect(result.updatedStats.currentTime).toBe('14:00');
    expect(result.updatedStats.aggressiveCount).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it('counts active HMG crews in the collapse check', () => {
    const stats = createInitialStats(88);
    stats.tutorialStep = 3;
    stats.soldiers = 10;
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '询问当前情况');
    expect(result.updatedStats.isGameOver).not.toBe(true);
    expect(result.updatedStats.lastStandUsed).not.toBe(true);
  });

  it('gives one explicit last-stand recovery chance before defeat', () => {
    const stats = createInitialStats(99);
    stats.tutorialStep = 3;
    stats.soldiers = 10;
    stats.siegeMeter = 0;
    stats.hmgSquads = stats.hmgSquads.map((squad) => ({ ...squad, status: 'destroyed', count: 0 }));

    const warning = runGameTurn(stats, '询问当前情况');
    expect(warning.updatedStats.isGameOver).not.toBe(true);
    expect(warning.updatedStats.lastStandUsed).toBe(true);
    expect(warning.narrative).toContain('最后防线');

    const doomed = { ...stats, ...warning.updatedStats };
    const ending = runGameTurn(doomed, '询问当前情况');
    expect(ending.updatedStats.isGameOver).toBe(true);
    expect(ending.updatedStats.gameOverReason).toBe('combat_force_collapsed');
  });

  it('turns the first structure collapse into a repairable last stand', () => {
    const stats = createInitialStats(100);
    stats.tutorialStep = 3;
    stats.health = 0;
    stats.siegeMeter = 0;

    const warning = runGameTurn(stats, '询问当前情况');
    expect(warning.updatedStats.isGameOver).not.toBe(true);
    expect(warning.updatedStats.lastStandUsed).toBe(true);
    expect(warning.updatedStats.health).toBe(1);
    expect(warning.narrative).toContain('最后防线');
  });

  it('does not call surviving flag defenders fully martyred when only the position collapses', () => {
    const stats = createInitialStats(101);
    stats.tutorialStep = 3;
    stats.health = 0;
    stats.lastStandUsed = true;
    stats.hasFlagRaised = true;
    stats.siegeMeter = 0;

    const ending = runGameTurn(stats, '询问当前情况');
    expect(ending.updatedStats.isGameOver).toBe(true);
    expect(ending.updatedStats.gameResult).toBe('defeat_generic');
    expect(ending.updatedStats.gameOverReason).toBe('position_collapsed');
    expect(ending.narrative).not.toContain('壮烈殉国');
    expect(ending.narrative).toContain('幸存者');
  });

  it('keeps attack settlement when combat crosses midnight', () => {
    const stats = createInitialStats(1937);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '23:45';
    stats.siegeMeter = 100;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.updatedStats.day).toBe(3);
    expect(result.updatedStats.currentTime).toBe('00:00');
    expect(result.eventTriggered).toBe('attack');
    expect(result.summary?.kind).toBe('battle');
  });

  it('moves infantry and HMG squads through strategic-map commands', () => {
    const stats = createInitialStats(7);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '10:00';
    stats.siegeMeter = 0;

    const infantry = runGameTurn(stats, '调派30人从二楼阵地至屋顶');
    expect(infantry.updatedStats.currentTime).toBe('10:30');
    expect(infantry.updatedStats.soldierDistribution?.['二楼阵地']).toBe(150);
    expect(infantry.updatedStats.soldierDistribution?.['屋顶']).toBeGreaterThan(10);
    expect(Object.values(infantry.updatedStats.soldierDistribution ?? {}).reduce((sum, value) => sum + value, 0))
      .toBe(infantry.updatedStats.soldiers);

    const movedStats = { ...stats, ...infantry.updatedStats };
    const hmg = runGameTurn(movedStats, '部署机枪一连至屋顶');
    expect(hmg.updatedStats.currentTime).toBe('10:50');
    expect(hmg.updatedStats.hmgSquads?.find((squad) => squad.name === '机枪一连')?.location).toBe('屋顶');
  });

  it('can kill the commander only when the attacked sector contains the command post', () => {
    const exposed = createInitialStats(25);
    exposed.tutorialStep = 3;
    exposed.day = 3;
    exposed.currentTime = '10:00';
    exposed.siegeMeter = 100;
    exposed.location = '一楼入口';
    exposed.fortificationLevel['一楼入口'] = 0;
    exposed.sectorIntegrity['一楼入口'] = 20;
    exposed.soldierDistribution['一楼入口'] = 15;
    exposed.soldierDistribution['二楼阵地'] += 125;

    const fatal = runGameTurn(exposed, '侦察敌情');
    expect(fatal.attackLocation).toBe('一楼入口');
    expect(fatal.updatedStats.gameResult).toBe('defeat_commander');
    expect(fatal.updatedStats.gameOverReason).toBe('commander_killed');
    expect(fatal.narrative).toContain('将星陨落');

    const sheltered = structuredClone(exposed);
    sheltered.location = '地下室';
    const survived = runGameTurn(sheltered, '侦察敌情');
    expect(survived.attackLocation).toBe('一楼入口');
    expect(survived.updatedStats.gameOverReason).not.toBe('commander_killed');
  });

  it('loses a breached floor, withdraws its garrison and redirects later attacks', () => {
    const stats = createInitialStats(1);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '10:00';
    stats.siegeMeter = 100;
    stats.location = '地下室';
    stats.sectorIntegrity['一楼入口'] = 1;

    const breach = runGameTurn(stats, '侦察敌情');
    expect(breach.attackLocation).toBe('一楼入口');
    expect(breach.updatedStats.sectorIntegrity?.['一楼入口']).toBe(0);
    expect(breach.updatedStats.soldierDistribution?.['一楼入口']).toBe(0);
    expect(breach.updatedStats.hmgSquads?.some((squad) => squad.status === 'active' && squad.location === '一楼入口')).toBe(false);
    expect(breach.narrative).toContain('防区失守：一楼入口');

    const afterBreach = { ...stats, ...breach.updatedStats, siegeMeter: 100 };
    const nextAttack = runGameTurn(afterBreach, '侦察敌情');
    expect(['二楼阵地', '地下室']).toContain(nextAttack.attackLocation);
    expect(nextAttack.attackLocation).not.toBe('一楼入口');
  });

  it('withdraws the command post automatically when its floor falls and the commander survives', () => {
    const stats = createInitialStats(1);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '10:00';
    stats.siegeMeter = 100;
    stats.location = '一楼入口';
    stats.sectorIntegrity['一楼入口'] = 1;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.updatedStats.gameOverReason).not.toBe('commander_killed');
    expect(result.updatedStats.sectorIntegrity?.['一楼入口']).toBe(0);
    expect(result.updatedStats.location).toBe('二楼阵地');
    expect(result.narrative).toContain('残余守军沿内部通道撤往二楼阵地');
  });

  it('blocks organized treatment after the basement hospital is lost', () => {
    const stats = createInitialStats(12);
    stats.tutorialStep = 3;
    stats.wounded = 20;
    stats.sectorIntegrity['地下室'] = 0;

    const result = runGameTurn(stats, '治疗伤员');
    expect(result.updatedStats.soldiers).toBeUndefined();
    expect(result.updatedStats.wounded).toBeUndefined();
    expect(result.narrative).toContain('地下室医院已经失守');
  });

  it('can seal an exposed stairwell and consume the barrier on the next advance', () => {
    const stats = createInitialStats(9);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '10:00';
    stats.siegeMeter = 0;
    stats.location = '屋顶';
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.sectorIntegrity['地下室'] = 0;

    const sealed = runGameTurn(stats, '封锁通往二楼阵地的楼梯');
    expect(sealed.updatedStats.sealedApproaches).toContain('二楼阵地');
    expect(sealed.updatedStats.sandbags).toBe(stats.sandbags - 150);
    expect(sealed.updatedStats.grenades).toBe(stats.grenades - 20);

    const prepared = { ...stats, ...sealed.updatedStats, siegeMeter: 100 };
    const attack = runGameTurn(prepared, '侦察敌情');
    expect(attack.attackLocation).toBe('二楼阵地');
    expect(attack.updatedStats.sealedApproaches).not.toContain('二楼阵地');
    expect(attack.narrative).toContain('楼梯封锁触发');
  });

  it('can counterattack to recover a lost sector', () => {
    const stats = createInitialStats(1);
    stats.tutorialStep = 3;
    stats.day = 1;
    stats.currentTime = '10:00';
    stats.siegeMeter = 0;
    stats.morale = 100;
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.soldierDistribution['一楼入口'] = 0;
    stats.soldierDistribution['二楼阵地'] += 140;

    const result = runGameTurn(stats, '反冲锋夺回一楼入口');
    expect(result.updatedStats.sectorIntegrity?.['一楼入口']).toBe(30);
    expect(result.updatedStats.soldierDistribution?.['一楼入口']).toBeGreaterThan(0);
    expect(result.narrative).toContain('反冲锋成功');
  });
});
