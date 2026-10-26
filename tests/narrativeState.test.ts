import { issueEvent } from '../engine/eventPlans';
import { describe, expect, it } from 'vitest';
import { createInitialStats } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { resolvePlayerAction } from '../engine/actions/resolvePlayerAction';
import { resolveAttack } from '../engine/combatResolution/resolveAttack';
import { calculateCampaignScore } from '../engine/endings/campaignScore';
import { TACTICAL_CARDS } from '../data/text/events';
import type { GameStats } from '../types';

const fresh = () => ({ ...createInitialStats(1937), tutorialStep: 3, day: 3, currentTime: '10:00' });

const contact = (stats: GameStats) => {
  const updates: Partial<GameStats> = {};
  const narrative: string[] = [];
  const logs: string[] = [];
  resolveAttack({
    currentStats: stats,
    calculatedStats: updates,
    strategicStateAfterAction: stats,
    contactOperation: { ...stats.enemyOperation!, target: '一楼入口' },
    attackScale: 'MEDIUM',
    damageType: 'INFANTRY',
    narrativeParts: narrative,
    statsLog: logs,
    random: () => 0.5,
  });
  return { updates, text: narrative.join(''), logs };
};

describe('narrative follows settled state', () => {
  it.each([[95, 5], [100, 0]])('reports the real card gain at morale %i', (morale, gain) => {
    const stats = fresh();
    stats.morale = morale;
    stats.activeTacticalCard = TACTICAL_CARDS.find(card => card.id === 'morale_boost')!;
    const result = runGameTurn(stats, stats.activeTacticalCard.actionCmd);
    expect(result.updatedStats.morale).toBe(morale + gain);
    expect(result.narrative).toContain(`士气 +${gain}`);
    expect(result.updatedStats.campaignHistory?.at(-1)?.detail).toContain(`${morale}升至${morale + gain}`);
  });

  it('can narrate a successful raid with no loot without inventing a reward', () => {
    const stats = fresh();
    stats.currentTime = '01:00';
    const draws = [0, 0, 0.1, 0.1, 0.1];
    const result = resolvePlayerAction(stats, '夜袭', () => draws.shift() ?? 0.1);
    expect(result.actionType).toBe('raid');
    expect(result.updatedStats.ammo).toBe(stats.ammo);
    expect(result.updatedStats.medkits).toBe(stats.medkits);
    expect(result.updatedStats.soldiers).toBe(stats.soldiers);
    expect(result.logs.join('')).not.toMatch(/缴获|获得/);
    expect(result.narrative.join('')).not.toMatch(/缴获了|抢回了|无一人伤亡|全身而退/);
  });

  it.each(['smuggler_boat', 'puppet_defector'])('refusing %s does not fire or execute people', eventId => {
    const stats = fresh();
    Object.assign(stats, issueEvent(stats, eventId));
    const result = runGameTurn(stats, `EVT_RESOLVE:${eventId}:1`);
    expect(result.updatedStats.ammo).toBeUndefined();
    expect(result.updatedStats.soldiers).toBeUndefined();
    expect(result.updatedStats.roster).toBeUndefined();
    expect(result.narrative).not.toMatch(/朝天鸣枪|下令射击|尸体倒在/);
  });

  it('omits injury and death scenes if the attacked floor has no exposed personnel', () => {
    const stats = fresh();
    stats.location = '地下室';
    stats.hmgSquads = [];
    stats.soldierDistribution['二楼阵地'] += stats.soldierDistribution['一楼入口'];
    stats.soldierDistribution['一楼入口'] = 0;
    const result = contact(stats);
    expect(result.updates.wounded).toBe(0);
    expect(result.updates.soldiers).toBe(stats.soldiers);
    expect(result.text).not.toMatch(/【伤员送下】|【阵亡清点】|【阵亡确认】/);
  });

  it('shows concrete injuries only after this contact adds wounded personnel', () => {
    const stats = fresh();
    stats.location = '地下室';
    const result = contact(stats);
    expect(result.updates.wounded).toBeGreaterThan(0);
    expect(result.text).toContain('【伤员送下】');
    expect(result.text).toContain('血从指缝里往外渗');
  });

  it('does not promise a battle morale gain that is discarded by the cap', () => {
    const stats = fresh();
    stats.location = '地下室';
    stats.morale = 100;
    stats.fortificationLevel['一楼入口'] = 3;
    stats.fortificationBuildCounts['一楼入口'] = 6;
    const result = contact(stats);
    expect(result.updates.enemiesKilled).toBeGreaterThan(0);
    expect(result.updates.morale).toBe(100);
    expect(result.logs).toContain('💪 交战士气 100 → 100');
    expect(result.logs.join('')).not.toMatch(/士气 \+[1-9]/);
  });

  it('keeps surviving wounded visible after combat strength is exhausted', () => {
    const stats = fresh();
    stats.soldiers = 0;
    stats.hmgSquads = [];
    stats.wounded = 12;
    const report = calculateCampaignScore(stats, 'defeat_martyr');
    expect(report.text).toContain('待治伤员12人');
    expect(report.text).toContain('合计12人');
    expect(report.text).not.toContain('你们全员殉国');
  });
});
