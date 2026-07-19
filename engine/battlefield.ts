import { getDayProfile } from '../data/dayProfiles';
import type { EnemyOperation, GameStats, Location } from '../types';
import { getGroundAttackTargets, isSectorHeld } from './strategicDefense';

type RandomSource = () => number;

const ROUTE_NAMES: Record<Location, string> = {
  '一楼入口': '北侧废墟 → 一楼正门',
  '二楼阵地': '一楼突破口 → 二楼楼梯',
  '屋顶': '炮兵观测 → 屋顶旗台',
  '地下室': '苏州河岸 → 地下室侧墙',
};

const pick = <T>(items: T[], random: RandomSource): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export const createEnemyOperation = (
  stats: GameStats,
  random: RandomSource,
  id = (stats.enemyOperation?.id ?? 0) + 1,
): EnemyOperation => {
  const profile = getDayProfile(stats.day);
  const groundTargets = getGroundAttackTargets(stats);
  const held = (['屋顶', '二楼阵地', '一楼入口', '地下室'] as Location[])
    .filter((location) => isSectorHeld(stats, location));
  const flagBeacon = stats.hasFlagRaised && held.includes('屋顶');
  const britishPressure = stats.consequenceFlags.includes('british_defied');
  const ceasefireAccepted = stats.consequenceFlags.includes('british_ceasefire_accepted');

  let attackType: EnemyOperation['attackType'] = 'INFANTRY';
  const typeRoll = random();
  if (flagBeacon && typeRoll < profile.bombingChance) attackType = 'BOMBING';
  else if (typeRoll < Math.max(0.12, profile.artilleryChance - (ceasefireAccepted ? 0.12 : 0))) attackType = 'ARTILLERY';

  let candidates = attackType === 'INFANTRY' ? groundTargets : held;
  if (attackType === 'ARTILLERY') {
    const artilleryTargets = candidates.filter((target) => target === '一楼入口' || target === '二楼阵地');
    if (artilleryTargets.length) candidates = artilleryTargets;
  }
  if (britishPressure && held.includes('地下室') && random() < 0.45) candidates = ['地下室'];
  if (flagBeacon && attackType === 'BOMBING') candidates = ['屋顶'];
  const target = pick(candidates.length ? candidates : [stats.location], random);

  const pressure = Math.max(stats.siegeMeter, 15 + stats.day * 13);
  const scale: EnemyOperation['scale'] = pressure >= 85 || random() < profile.largeAttackBonus
    ? 'LARGE'
    : pressure >= 52
      ? 'MEDIUM'
      : 'SMALL';
  const dayTempo = stats.day >= 5 ? 5 : stats.day === 4 ? 7 : stats.day === 3 ? 8 : stats.day === 2 ? 9 : 10;
  const pressureTempo = stats.siegeMeter >= 85 ? -2 : stats.siegeMeter >= 55 ? -1 : 0;
  const turnsRemaining = Math.max(3, Math.min(11, dayTempo + pressureTempo + (random() < 0.45 ? 0 : 1)));

  return {
    id,
    target,
    routeName: ROUTE_NAMES[target],
    attackType,
    scale,
    turnsRemaining,
    revealed: false,
    confidence: 25,
  };
};

export const revealEnemyOperation = (operation: EnemyOperation): EnemyOperation => ({
  ...operation,
  revealed: true,
  confidence: 100,
});

export const progressEnemyOperation = (operation: EnemyOperation): EnemyOperation => ({
  ...operation,
  turnsRemaining: Math.max(0, operation.turnsRemaining - 1),
});

export const getOperationIntel = (operation: EnemyOperation | null): string => {
  if (!operation) return '敌军正在重新集结，尚未形成明确攻势。';
  if (!operation.revealed) return `观察哨发现敌军正在调动，预计 ${operation.turnsRemaining} 个行动后接触；目标尚未查明。`;
  const type = operation.attackType === 'BOMBING' ? '航空轰炸' : operation.attackType === 'ARTILLERY' ? '炮击' : '步兵突击';
  const scale = operation.scale === 'LARGE' ? '大规模' : operation.scale === 'MEDIUM' ? '中等规模' : '小规模';
  return `确证：${scale}${type}将沿“${operation.routeName}”进攻${operation.target}，预计 ${operation.turnsRemaining} 个行动后接触。`;
};
