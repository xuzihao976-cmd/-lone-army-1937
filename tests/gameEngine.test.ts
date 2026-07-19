import { describe, expect, it } from 'vitest';
import { runGameTurn } from '../engine/gameEngine';
import { createInitialStats } from '../storage/saveStore';

describe('local game engine endings', () => {
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
});
