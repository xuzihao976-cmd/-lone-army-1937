import { describe, expect, it } from 'vitest';
import { createInitialStats } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { localAdvisorResponse } from '../engine/localAdvisor';
import type { ChapterId, GameStats } from '../types';

const apply = (stats: GameStats, input: string) => {
  const result = runGameTurn(stats, input);
  return { result, stats: { ...stats, ...result.updatedStats, turnCount: stats.turnCount + (result.turnAdvanced ? 1 : 0) } };
};
// Ordinary mission rules in isolation; interruptive encounters have dedicated integration coverage.
const start = (id: ChapterId) => {
  const s=apply(createInitialStats(1937,id),'start_game').stats;
  if(id==='street')s.triggeredEvents=['wall_knocking']; // Already declined, with no resource or objective change.
  return s;
};
const world = ({ localDialogue, pendingRetreat, ...state }: GameStats) => state;

describe('distinct, local chapter objectives', () => {
  it('finds people separately from escorting them and requires a scouted route', () => {
    const first = start('street');
    const found = apply(first, '搜救街巷').stats;
    expect(found.mission!.found).toBeGreaterThan(0);
    expect(found.mission!.evacuated).toBe(0);
    const blocked = apply(found, '护送民众');
    expect(blocked.result.turnAdvanced).not.toBe(true);
    expect(world(blocked.stats)).toEqual(world(found));
    let stats = apply(found, '侦察路线').stats;
    stats = apply(stats, '选择内巷').stats;
    const preview = getActionPreview(stats, '护送民众');
    const escorted = apply(stats, '护送民众');
    expect(preview?.durationMinutes).toBe(25);
    expect(escorted.stats.mission!.elapsedMinutes - stats.mission!.elapsedMinutes).toBe(25);
    expect(escorted.stats.mission!.evacuated).toBe(found.mission!.found);
    expect(escorted.stats.soldiers).toBeLessThanOrEqual(first.soldiers); // Civilians never become free troops.
  });

  it('makes river escorts faster, with the pressure shown in the preview', () => {
    let stats = start('street');
    for (const command of ['侦察路线', '选择沿河', '搜救街巷']) stats = apply(stats, command).stats;
    const preview = getActionPreview(stats, '护送民众')!;
    const next = apply(stats, '护送民众');
    expect(preview.durationMinutes).toBe(15);
    expect(preview.threatIncrease).toBe(28);
    expect(next.stats.mission!.elapsedMinutes - stats.mission!.elapsedMinutes).toBe(15);
  });

  it('completes evacuation only after safely escorting the target and confirming extraction', () => {
    let stats = start('street');
    for (const command of ['侦察路线', '选择内巷']) stats = apply(stats, command).stats;
    while (stats.mission!.found < 8) stats = apply(stats, '搜救街巷').stats;
    while (stats.mission!.evacuated < 8) stats = apply(stats, '护送民众').stats;
    expect(stats.isGameOver).toBe(false);
    const pending = apply(stats, '组织撤离');
    expect(pending.result.turnAdvanced).not.toBe(true);
    expect(pending.stats.isGameOver).toBe(false);
    expect(pending.result.dilemma?.id).toBe('confirm_chapter_retreat');
    const end = apply(pending.stats, '确认撤出小队').stats;
    expect(end.gameResult).toBe('victory_evacuation');
    expect(end.mission!.elapsedMinutes).toBeLessThan(180);
  });

  it('requires the bridge squad to withdraw after sixty others have crossed', () => {
    let stats = start('bridge');
    for (let i = 0; i < 6; i++) {
      const next = apply(stats, '压制射击');
      const reportedKills = [...next.result.narrative.matchAll(/确认毙敌(\d+)人/g)]
        .reduce((sum, match) => sum + Number(match[1]), 0);
      expect(next.stats.enemiesKilled - stats.enemiesKilled).toBe(reportedKills);
      stats = next.stats;
    }
    expect(stats.mission!.crossed).toBe(60);
    expect(stats.mission!.elapsedMinutes).toBe(120);
    expect(stats.isGameOver).toBe(false);
    stats = apply(stats, '组织撤离').stats;
    const end = apply(stats, 'confirm_chapter_retreat');
    expect(end.stats.gameResult).toBe('victory_cover');
    expect(end.stats.mission!.crossed).toBe(60);
  });

  it('does not reward early extraction or endless waiting after the bridge goal', () => {
    let early = apply(start('bridge'), '组织撤离').stats;
    early = apply(early, 'confirm_chapter_retreat').stats;
    expect(early.gameResult).toBe('defeat_mission');
    expect(early.mission!.crossed).toBe(0);
    let late = start('bridge');
    for (let i = 0; i < 9; i++) late = apply(late, '轮换掩护').stats;
    expect(late.mission!.crossed).toBe(60);
    expect(late.gameResult).toBe('defeat_mission');
    expect(late.finalRank).toBe('通路封锁');
  });

  it('keeps chat, questions, negation, quotations, compound and forged codes read-only', () => {
    for (const id of ['street', 'bridge'] as const) {
      const stats = start(id);
      for (const input of ['你好', '我想家了', '报告任务', '怎么护送民众', '不要搜救街巷', '不要压制射击',
        '“护送民众”', '如果安全就组织撤离', '先搜救街巷再护送民众', '侦察路线然后护送民众',
        '刚才我说组织撤离', 'EVT_RESOLVE:student_run:0', 'CARD_RESOLVE:supplies', 'confirm_chapter_retreat',
        '搜救街巷' + '啊'.repeat(600)]) {
        const next = apply(stats, input);
        expect(next.result.turnAdvanced, input).not.toBe(true);
        expect(world(next.stats), input).toEqual(world(stats));
      }
      const before = structuredClone(stats);
      expect(localAdvisorResponse('组织撤离', stats).text).toContain('尚未执行');
      expect(stats).toEqual(before);
    }
  });

  it('cannot replay a start, confirmation or zero-cost order to obtain supplies', () => {
    const stats = start('street');
    expect(apply(stats, 'start_game').stats).toEqual(stats);
    const pending = apply(stats, '组织撤离').stats;
    const canceled = apply(pending, 'cancel_retreat').stats;
    expect(canceled.pendingRetreat).toBeNull();
    expect(apply(canceled, 'confirm_chapter_retreat').stats.isGameOver).toBe(false);
    expect(apply(stats, '选择内巷').stats.mission!.route).toBeNull();
  });
});
