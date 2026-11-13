import { getTactic, tacticCommand, chapterTactics, TACTICS, TACTIC_RULES as R, type TacticDefinition } from '../data/tactics';
import type { GameStats, Location, TacticId } from '../types';
import { canonicalCommand, getLanguageGuard, isQuestion } from './commandLanguage';
import { isSectorHeld, SECTOR_LOCATIONS } from './strategicDefense';
import { innerRoadBlocked } from './eventContext';

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
  extraFatigue: number;
  casualtyReduction: number;
  costs: string[];
  baseCommand: string;
}

/** Parse the whole input. Discussion, negation and quoted codes never arm a card. */
export function getTacticPlan(stats: GameStats, raw: string): TacticPlan | null {
  if (raw.length > 500) return null;
  const input = canonicalCommand(raw);
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
    ammo: 0, materials: 0, medkits: 0, count: 0, extraFatigue: 0, casualtyReduction: 0, costs: [], baseCommand: '' };
  const m = stats.mission;
  switch (definition.id) {
    case 'group_escort': case 'wall_hug': {
      const grouped = definition.id === 'group_escort';
      plan.baseCommand = '护送民众';
      plan.minutes = (m?.route === 'river' ? 15 : 25) + (grouped ? 0 : R.wallHug.minutesExtra);
      plan.pressure = (m?.route === 'river' ? 28 : 18) + (grouped ? R.groupEscort.pressureExtra : -R.wallHug.pressureReduction);
      plan.ammo = grouped ? R.groupEscort.ammo : 0;
      plan.count = Math.min(grouped ? R.groupEscort.capacity : 6, (m?.found ?? 0) - (m?.evacuated ?? 0));
      if (!m?.recon || !m.route) plan.reason = '先侦察并选择撤收线。';
      else if (plan.count <= 0) plan.reason = '没有已找到、仍待护送的民众。';
      else if (grouped && m.found - m.evacuated <= 6) plan.reason = '至少7人待护送时，分组接应才有额外收益。';
      else if (stats.ammo < plan.ammo) plan.reason = `分组接应需要额外${plan.ammo}发七九弹。`;
      else break;
      plan.available = false; break;
    }
    case 'rapid_crossing':
      Object.assign(plan, { baseCommand: '压制射击', ...R.rapidCrossing,
        count: Math.min(R.rapidCrossing.capacity, 60 - (m?.crossed ?? 60)) });
      if (!m || 60 - m.crossed <= 10) { plan.available = false; plan.reason = '至少11名友军尚未过桥时，加速渡桥才有额外收益。'; }
      else if (stats.ammo < plan.ammo) { plan.available = false; plan.reason = `本次掩护共需${plan.ammo}发七九弹。`; }
      break;
    case 'covered_withdrawal':
      Object.assign(plan, { baseCommand: '组织撤离', ...R.coveredWithdrawal }); break;
    case 'emergency_shoring':
      Object.assign(plan, { baseCommand: '应急支撑', ...R.emergencyShoring,
        count: Math.min(R.emergencyShoring.integrity, 100 - (stats.sectorIntegrity[target!] ?? 100)) });
      if (!SECTOR_LOCATIONS.includes(target!) || !isSectorHeld(stats, target!)) { plan.available = false; plan.reason = '目标楼层已失守，必须先夺回。'; }
      else if (plan.count <= 0) { plan.available = false; plan.reason = '目标楼层完整度已满。'; }
      else if (stats.sandbags < plan.materials) { plan.available = false; plan.reason = `应急支撑需要${plan.materials}份工事材料。`; }
      break;
    case 'urgent_aid':
      Object.assign(plan, { baseCommand: '紧急救治', ...R.urgentAid,
        count: Math.min(R.urgentAid.capacity, stats.wounded, Math.floor(stats.medkits / R.urgentAid.medkitsPerPerson)) });
      plan.medkits = plan.count * R.urgentAid.medkitsPerPerson;
      if (!isSectorHeld(stats, '地下室')) { plan.available = false; plan.reason = '地下室医院已失守。'; }
      else if (stats.wounded <= 0) { plan.available = false; plan.reason = '目前没有待治伤员。'; }
      else if (plan.count <= 0) { plan.available = false; plan.reason = `每人需要${R.urgentAid.medkitsPerPerson}份急救包，库存不足。`; }
      break;
  }
  if (stats.equippedTactic?.id !== definition.id || stats.equippedTactic.spent) {
    plan.available = false; plan.reason = stats.equippedTactic?.id === definition.id ? '本章战术牌已使用。' : '本章没有携带这张战术牌。';
  } else if (definition.chapterId !== stats.chapterId) {
    plan.available = false; plan.reason = '这张战术牌不适用于本章。';
  } else if (stats.isGameOver || (stats.chapterId !== 'sihang' ? !m?.started : stats.tutorialStep < 3)) {
    plan.available = false; plan.reason = stats.isGameOver ? '本章已结束。' : '接防完成后才能使用战术牌。';
  }
  if (stats.pendingDilemmaId) {plan.available=false;plan.reason='先处置当前待决事件。';}
  if (definition.chapterId==='street' && m?.route==='inner' && innerRoadBlocked(stats)) {
    plan.available=false;plan.reason='内巷转角仍被堵住，先清理内巷障碍，或改走已侦明的沿河线。';
  }
  plan.costs = [plan.ammo ? `七九弹${plan.ammo}发` : '', plan.materials ? `工事材料${plan.materials}份` : '',
    plan.medkits ? `急救包${plan.medkits}份` : '', plan.extraFatigue ? `额外疲劳最多+${plan.extraFatigue}` : '', '消耗本章唯一战术牌'].filter(Boolean);
  return plan;
}

export const spendTactic = (id: TacticId) => ({ id, spent: true } as const);

/** Card-specific rules take precedence over ordinary treatment/building help. */
export function getTacticRuleHelp(stats: GameStats, input: string): string | null {
  if (getLanguageGuard(input) || (!isQuestion(input) && !/规则|教程|作用|消耗|耗时/.test(input))) return null;
  if (/战地际遇|家书|散兵接应|意外物资/.test(input)) return '家书、散兵接应、意外物资属于四行章的战地际遇，与携带的战术牌分别记录。新物资际遇来自搜寻；新散兵际遇限首日侦察且入口受控，并非必然出现。可以接受、放弃或稍后查看；未接受不领取效果，不耗行动时间，也不消耗战术牌。家书即使士气已满也可收下，不能突破100。';
  const named = TACTICS.filter(card => input.includes(card.title));
  if (!named.length && !/战术|携带|用牌/.test(input)) return null;
  const cards = named.length ? named : chapterTactics(stats.chapterId);
  const selected = getTactic(stats.equippedTactic?.id);
  return `新开本章可从两张战术牌中选一张，也可不携带；每章最多使用一次，不跨关。普通军令始终可用。\n当前${selected ? `携带${selected.title}，${stats.equippedTactic?.spent ? '已经使用' : '尚未使用'}` : '未携带战术牌'}。\n\n`
    + cards.map(card => `${card.title}${card.chapterId !== stats.chapterId ? '（属于其他章节，本章不可用）' : ''}：${card.effect}\n代价与条件：${card.tradeoff}`).join('\n\n')
    + '\n\n在主界面点“查看战术”预览；只有实际执行才耗牌。交替撤离还需二次确认。这里仅说明规则，没有执行。';
}
