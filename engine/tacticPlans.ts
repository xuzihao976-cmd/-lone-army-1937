import { getTactic, tacticCommand, type TacticDefinition } from '../data/tactics';
import type { GameStats, Location, TacticId } from '../types';
import { canonicalCommand, getLanguageGuard, isQuestion } from './commandLanguage';
import { isSectorHeld, SECTOR_LOCATIONS } from './strategicDefense';

export interface TacticPlan {
  tactic: TacticDefinition;
  command: string;
  target?: Location;
  available: boolean;
  reason: string;
  minutes: number;
  pressure: number;
  ammo: number;
  materials: number;
  medkits: number;
  count: number;
  costs: string[];
  baseCommand: string;
}

/** Parse the whole input. Discussion, negation and quoted codes never arm a card. */
export function getTacticPlan(stats: GameStats, raw: string): TacticPlan | null {
  const input = canonicalCommand(raw);
  if (raw.length > 500) return null;
  const match = /^tactic_use:([a-z_]+)(?::(屋顶|二楼阵地|一楼入口|地下室))?$/.exec(input);
  let definition: TacticDefinition | undefined;
  let target: Location | undefined;
  if (match) { definition = getTactic(match[1]); target = match[2] as Location | undefined; }
  else if (!getLanguageGuard(raw) && !isQuestion(raw)) {
    definition = getTactic(stats.equippedTactic?.id);
    if (!definition || input !== `使用${definition.title}`) return null;
  }
  if (!definition) return null;
  if (definition.id === 'emergency_shoring') target ??= stats.location;
  else if (target) return null;
  const plan: TacticPlan = { tactic: definition, command: tacticCommand(definition.id, target), target,
    available: true, reason: definition.effect + definition.tradeoff, minutes: 0, pressure: 0,
    ammo: 0, materials: 0, medkits: 0, count: 0, costs: [], baseCommand: '' };
  const m = stats.mission;
  switch (definition.id) {
    case 'group_escort': case 'wall_hug': {
      const grouped = definition.id === 'group_escort';
      plan.baseCommand = '护送民众';
      plan.minutes = (m?.route === 'river' ? 15 : 25) + (grouped ? 0 : 10);
      plan.pressure = (m?.route === 'river' ? 28 : 18) + (grouped ? 8 : -10);
      plan.ammo = grouped ? 20 : 0;
      plan.count = Math.min(grouped ? 8 : 6, (m?.found ?? 0) - (m?.evacuated ?? 0));
      if (!m?.recon || !m.route) plan.reason = '先侦察并选择撤收线。';
      else if (plan.count <= 0) plan.reason = '没有已找到、仍待护送的民众。';
      else if (grouped && m.found - m.evacuated <= 6) plan.reason = '至少7人待护送时，分组接应才有额外收益。';
      else if (stats.ammo < plan.ammo) plan.reason = '分组接应需要额外20发七九弹。';
      else break;
      plan.available = false; break;
    }
    case 'rapid_crossing':
      Object.assign(plan, { baseCommand: '压制射击', minutes: 20, pressure: 16, ammo: 60,
        count: Math.min(20, 60 - (m?.crossed ?? 60)) });
      if (!m || 60 - m.crossed <= 10) { plan.available = false; plan.reason = '至少11名友军尚未过桥时，加速渡桥才有额外收益。'; }
      else if (stats.ammo < 60) { plan.available = false; plan.reason = '本次掩护共需60发七九弹。'; }
      break;
    case 'covered_withdrawal':
      Object.assign(plan, { baseCommand: '组织撤离', minutes: 30, pressure: 18 }); break;
    case 'emergency_shoring':
      Object.assign(plan, { baseCommand: '应急支撑', minutes: 30, pressure: 10, materials: 100,
        count: Math.min(10, 100 - (stats.sectorIntegrity[target!] ?? 100)) });
      if (!SECTOR_LOCATIONS.includes(target!) || !isSectorHeld(stats, target!)) { plan.available = false; plan.reason = '目标楼层已失守，必须先夺回。'; }
      else if (plan.count <= 0) { plan.available = false; plan.reason = '目标楼层完整度已满。'; }
      else if (stats.sandbags < 100) { plan.available = false; plan.reason = '应急支撑需要100份工事材料。'; }
      break;
    case 'urgent_aid':
      Object.assign(plan, { baseCommand: '紧急救治', minutes: 30, pressure: 10,
        count: Math.min(2, stats.wounded, Math.floor(stats.medkits / 2)) });
      plan.medkits = plan.count * 2;
      if (!isSectorHeld(stats, '地下室')) { plan.available = false; plan.reason = '地下室医院已失守。'; }
      else if (stats.wounded <= 0) { plan.available = false; plan.reason = '目前没有待治伤员。'; }
      else if (plan.count <= 0) { plan.available = false; plan.reason = '每人需要2份急救包，库存不足。'; }
      break;
  }
  if (stats.equippedTactic?.id !== definition.id || stats.equippedTactic.spent) {
    plan.available = false; plan.reason = stats.equippedTactic?.id === definition.id ? '本章战术牌已使用。' : '本章没有携带这张战术牌。';
  } else if (definition.chapterId !== stats.chapterId) {
    plan.available = false; plan.reason = '这张战术牌不适用于本章。';
  } else if (stats.isGameOver || (stats.chapterId !== 'sihang' ? !m?.started : stats.tutorialStep < 3)) {
    plan.available = false; plan.reason = stats.isGameOver ? '本章已结束。' : '接防完成后才能使用战术牌。';
  }
  plan.costs = [plan.ammo ? `七九弹${plan.ammo}发` : '', plan.materials ? `工事材料${plan.materials}份` : '',
    plan.medkits ? `急救包${plan.medkits}份` : '', definition.id === 'rapid_crossing' ? '额外疲劳最多+8' : '', '消耗本章唯一战术牌'].filter(Boolean);
  return plan;
}

export const spendTactic = (id: TacticId) => ({ id, spent: true } as const);
