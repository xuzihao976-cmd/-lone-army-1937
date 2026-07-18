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
});
