import type { GameStats } from '../types';
import type { PlayerActionResolution } from './actions/resolvePlayerAction';
import { getTacticPlan, spendTactic } from './tacticPlans';

/** Warehouse tactics enter the same time, fatigue, enemy and casualty pipeline as ordinary actions. */
export function resolveWarehouseTactic(stats: GameStats, raw: string): PlayerActionResolution | null {
  const plan = getTacticPlan(stats, raw);
  if (!plan) return null;
  const result: PlayerActionResolution = { updatedStats: {}, logs: [], narrative: [], timeCost: 0, siegeIncrease: 0, actionType: 'idle' };
  if (!plan.available || plan.tactic.chapterId !== 'sihang') {
    result.narrative.push(`未执行：${plan.reason}`); return result;
  }
  result.timeCost = plan.minutes; result.siegeIncrease = plan.pressure; result.actionType = 'tactic';
  result.updatedStats.equippedTactic = spendTactic(plan.tactic.id);
  result.narrative.push(`【${plan.tactic.title}】${plan.tactic.description}`);
  result.logs.push('本章战术牌已使用');
  if (plan.tactic.id === 'emergency_shoring') {
    const target = plan.target!;
    result.updatedStats.sandbags = stats.sandbags - plan.materials;
    result.updatedStats.sectorIntegrity = { ...stats.sectorIntegrity, [target]: stats.sectorIntegrity[target] + plan.count };
    result.logs.push(`工事材料 -${plan.materials}`, `${target}完整度 ${stats.sectorIntegrity[target]} → ${stats.sectorIntegrity[target] + plan.count}`,
      '工事等级未提升，仍须后续施工');
  } else if (plan.tactic.id === 'urgent_aid') {
    result.updatedStats.medkits = stats.medkits - plan.medkits;
    result.updatedStats.wounded = stats.wounded - plan.count;
    result.updatedStats.soldiers = stats.soldiers + plan.count;
    result.updatedStats.woundedTimer = Math.max(0, stats.woundedTimer - plan.count * 90);
    result.logs.push(`急救包 -${plan.medkits}`, `救回战斗力${plan.count}人，其余伤员仍待救治`);
  }
  return result;
}
