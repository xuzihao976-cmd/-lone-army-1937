import { describe, expect, it } from 'vitest';
import { createInitialStats } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { localAdvisorResponse } from '../engine/localAdvisor';
import { formatMissionTiming, getMissionWithdrawalNotice, missionGoalMet } from '../engine/chapterGuidance';
import { tacticCommand } from '../data/tactics';
import type { GameStats, TacticId } from '../types';

const apply = (stats: GameStats, command: string) => {
  const result = runGameTurn(stats, command);
  return { ...stats, ...result.updatedStats, turnCount: stats.turnCount + (result.turnAdvanced ? 1 : 0) };
};
const start = (id: 'street'|'bridge', tactic: TacticId|null = null) => apply(createInitialStats(1937, id, tactic), 'start_game');

describe('short chapter advice, time and withdrawal warnings', () => {
  it('reports unavailable actions without presenting a future clock or resource charge', () => {
    for (const id of ['street', 'bridge'] as const) {
      const stats = start(id); stats.wounded = 2; stats.medkits = 0;
      const before = structuredClone(stats);
      const preview = getActionPreview(stats, '救治伤员')!;
      expect(preview).toMatchObject({ available: false, durationMinutes: 0, costs: [], missionTiming: undefined });
      expect(preview.reason).toContain('急救包已经耗尽');
      const answer = localAdvisorResponse('救治伤员', stats).text;
      expect(answer).toContain('当前不可执行'); expect(answer).toContain('急救包已经耗尽');
      expect(answer).not.toContain('20分钟'); expect(answer).not.toContain('行动后已用');
      expect(stats).toEqual(before);
    }
    const bridge = start('bridge'); bridge.sandbags = 39;
    expect(localAdvisorResponse('加固桥头', bridge).text).toContain('工事材料不足40份');
    const unstarted = createInitialStats(1937, 'street');
    expect(localAdvisorResponse('搜救街巷', unstarted).text).toContain('尚未接防');
    expect(localAdvisorResponse('搜救街巷', { ...start('street'), isGameOver: true }).text).toContain('本关已经结束');
  });

  it('shows the medicine that can actually be used, and matches the resulting treatment', () => {
    const stats = start('street'); stats.wounded = 5; stats.medkits = 1;
    stats.soldiers -= 5; stats.soldierDistribution['一楼入口'] -= 5;
    const before = structuredClone(stats);
    expect(getActionPreview(stats, '救治伤员')?.costs).toEqual(['急救包1份']);
    expect(localAdvisorResponse('救治伤员', stats).text).toContain('消耗：急救包1份');
    expect(stats).toEqual(before);
    const after = apply(stats, '救治伤员');
    expect(after.medkits).toBe(0); expect(after.wounded).toBe(4);
    expect(after.mission!.elapsedMinutes).toBe(20);
  });

  it('warns before an action uses the last ordinary withdrawal window, including the exact boundary', () => {
    for (const id of ['street', 'bridge'] as const) for (const remainingAfter of [21, 20, 19]) {
      const stats = start(id);
      const minutes = id === 'street' ? 25 : 20;
      Object.assign(stats.mission!, { recon: true, route: id === 'street' ? 'inner' : null,
        found: id === 'street' ? 8 : 0, evacuated: id === 'street' ? 6 : 0, crossed: id === 'bridge' ? 60 : 0,
        elapsedMinutes: 180 - remainingAfter - minutes });
      const command = id === 'street' ? '护送民众' : '轮换掩护';
      const before = structuredClone(stats);
      const preview = getActionPreview(stats, command)!;
      expect(preview.missionTiming).toMatchObject({ remainingAfter, reachesDeadline: false, canWithdrawAfter: remainingAfter > 20 });
      if (remainingAfter <= 20) {
        expect(preview.risk).toBe('critical');
        expect(localAdvisorResponse(command, stats).text).toContain('已来不及在封锁前完成');
      } else expect(preview.risk).not.toBe('critical');
      expect(stats).toEqual(before);
      const acted = apply(stats, command);
      expect(acted.mission!.elapsedMinutes).toBe(preview.missionTiming!.elapsedAfter);
      expect(acted.isGameOver).toBe(false);
      const extracted = apply(apply(acted, '组织撤离'), 'confirm_chapter_retreat');
      expect(extracted.gameResult.startsWith('victory_')).toBe(remainingAfter > 20);
    }
  });

  it('uses card-specific action times and keeps ordinary withdrawal as a separate allowance', () => {
    const street = start('street', 'wall_hug');
    Object.assign(street.mission!, { recon: true, route: 'inner', found: 8, elapsedMinutes: 125 });
    const slow = getActionPreview(street, tacticCommand('wall_hug'))!;
    expect(slow.durationMinutes).toBe(35);
    expect(slow.missionTiming).toMatchObject({ elapsedAfter: 160, remainingAfter: 20, canWithdrawAfter: false });
    expect(slow.risk).toBe('critical');
    const bridge = start('bridge', 'rapid_crossing'); bridge.mission!.elapsedMinutes = 140;
    const fast = getActionPreview(bridge, tacticCommand('rapid_crossing'))!;
    expect(fast.durationMinutes).toBe(20);
    expect(fast.missionTiming?.canWithdrawAfter).toBe(false);
    expect(formatMissionTiming(fast.missionTiming!)).toContain('普通撤离另需20分钟');
  });

  it('forecasts both extraction lengths without executing or arming the pending confirmation', () => {
    for (const tactical of [false, true]) for (const elapsedAfter of [179, 180]) {
      const stats = start('bridge', tactical ? 'covered_withdrawal' : null);
      const minutes = tactical ? 30 : 20;
      stats.mission!.crossed = 60; stats.mission!.elapsedMinutes = elapsedAfter - minutes;
      const command = tactical ? tacticCommand('covered_withdrawal') : '组织撤离';
      const before = structuredClone(stats);
      const preview = getActionPreview(stats, command)!;
      expect(preview.durationMinutes).toBe(0);
      expect(preview.threatIncrease).toBe(0);
      expect(preview.missionTiming).toMatchObject({ elapsedAfter, extracting: true, confirmationRequired: true, reachesDeadline: elapsedAfter === 180 });
      const answer = localAdvisorResponse(command, stats).text;
      expect(answer).toContain(`二次确认后${minutes}分钟`);
      expect(answer).toContain(`二次确认撤离后已用${elapsedAfter}/180分钟`);
      if (elapsedAfter === 180) expect(answer).toContain('任务会失败');
      expect(stats).toEqual(before);
      const pending = apply(stats, command);
      const confirmation = tactical ? 'confirm_tactic_retreat' : 'confirm_chapter_retreat';
      expect(getActionPreview(pending, confirmation)?.durationMinutes).toBe(minutes);
      expect(apply(pending, confirmation).gameResult).toBe(elapsedAfter === 179 ? 'victory_cover' : 'defeat_mission');
    }
  });

  it('does not treat discovery or the bridge quota as completed extraction', () => {
    const street = start('street'); street.mission!.found = 8;
    expect(missionGoalMet(street)).toBe(false);
    expect(localAdvisorResponse('组织撤离', street).text).toContain('人数目标尚未达成，此时撤离将判定失败');
    street.mission!.evacuated = 8;
    expect(getMissionWithdrawalNotice(street)?.text).toContain('小队仍须组织撤离');
    const bridge = start('bridge'); bridge.mission!.crossed = 60;
    expect(getMissionWithdrawalNotice(bridge)?.text).toContain('人数目标已达成');
    expect(bridge.isGameOver).toBe(false);
    bridge.mission!.elapsedMinutes = 160;
    expect(getMissionWithdrawalNotice(bridge)).toMatchObject({ urgent: true });
    expect(getMissionWithdrawalNotice(bridge)?.text).toContain('已来不及在封锁前完成');
    expect(getMissionWithdrawalNotice({ ...bridge, isGameOver: true })).toBeNull();
  });

  it('keeps zero-time choices, queries and unsafe discussion free of fictitious action projections', () => {
    const stats = start('street'); stats.mission!.recon = true; stats.mission!.elapsedMinutes = 170;
    const before = structuredClone(stats);
    for (const input of ['选择内巷', '你们还好吗？', '报告任务', '不要组织撤离', '“护送民众”', '如果安全就搜救街巷']) {
      const preview = getActionPreview(stats, input)!;
      expect(preview.durationMinutes).toBe(0);
      expect(preview.missionTiming).toBeUndefined();
      localAdvisorResponse(input, stats);
    }
    expect(stats).toEqual(before);
    const contact = { ...start('bridge'), siegeMeter: 69 };
    expect(localAdvisorResponse('压制射击', contact).text).toContain('本次行动将接敌');
    contact.mission!.elapsedMinutes = 140;
    expect(localAdvisorResponse('压制射击', contact).text).toContain('本次行动将接敌');
    expect(localAdvisorResponse('压制射击', contact).text).toContain('行动后余时不足以撤离');
  });
});
