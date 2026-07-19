import type { GameStats, Location } from '../types';

export const SECTOR_LOCATIONS: Location[] = ['屋顶', '二楼阵地', '一楼入口', '地下室'];

export type SectorCondition = 'secure' | 'strained' | 'critical' | 'lost';

export const getSectorIntegrity = (stats: GameStats, location: Location): number =>
  Math.max(0, Math.min(100, Math.floor(stats.sectorIntegrity[location] ?? 100)));

export const isSectorHeld = (stats: GameStats, location: Location): boolean =>
  getSectorIntegrity(stats, location) > 0;

export const getSectorCondition = (integrity: number): SectorCondition => {
  if (integrity <= 0) return 'lost';
  if (integrity < 25) return 'critical';
  if (integrity < 60) return 'strained';
  return 'secure';
};

// Ground attacks begin at the main entrance. Once it falls, the Japanese can
// split upward toward 2F or downward toward the hospital and supply rooms.
export const getGroundAttackTargets = (stats: GameStats): Location[] => {
  if (isSectorHeld(stats, '一楼入口')) return ['一楼入口'];

  const breachTargets: Location[] = [];
  if (isSectorHeld(stats, '二楼阵地')) breachTargets.push('二楼阵地');
  if (isSectorHeld(stats, '地下室')) breachTargets.push('地下室');
  if (breachTargets.length > 0) return breachTargets;
  if (isSectorHeld(stats, '屋顶')) return ['屋顶'];
  return [];
};

export const getRetreatDestination = (stats: GameStats, lostLocation: Location): Location | null => {
  const routes: Record<Location, Location[]> = {
    '一楼入口': ['二楼阵地', '地下室', '屋顶'],
    '二楼阵地': ['屋顶', '地下室', '一楼入口'],
    '屋顶': ['二楼阵地', '地下室', '一楼入口'],
    '地下室': ['二楼阵地', '一楼入口', '屋顶'],
  };
  return routes[lostLocation].find((location) => isSectorHeld(stats, location)) ?? null;
};

export const isApproachExposed = (stats: GameStats, target: Location): boolean => {
  if (!isSectorHeld(stats, target)) return false;
  if (target === '二楼阵地' || target === '地下室') return !isSectorHeld(stats, '一楼入口');
  if (target === '屋顶') return !isSectorHeld(stats, '二楼阵地');
  return false;
};

const RECAPTURE_ROUTES: Record<Location, Location[]> = {
    '一楼入口': ['二楼阵地', '地下室'],
    '二楼阵地': ['屋顶', '地下室', '一楼入口'],
    '屋顶': ['二楼阵地'],
    '地下室': ['一楼入口', '二楼阵地'],
};

export const getRecaptureStagingSectors = (stats: GameStats, target: Location): Location[] =>
  RECAPTURE_ROUTES[target].filter((location) => isSectorHeld(stats, location));

export const canRecaptureSector = (stats: GameStats, target: Location): boolean => {
  if (isSectorHeld(stats, target)) return false;
  return getRecaptureStagingSectors(stats, target).length > 0;
};

export const calculateCommanderDeathRisk = (stats: GameStats, location: Location): number => {
  const fort = Math.max(0, Math.min(3, stats.fortificationLevel[location] ?? 0));
  const garrison = Math.max(0, stats.soldierDistribution[location] ?? 0);
  const integrity = getSectorIntegrity(stats, location);
  const localHmg = stats.hmgSquads.filter((squad) => squad.status === 'active' && squad.location === location).length;

  const fortFactor = [1.6, 1, 0.65, 0.35][fort];
  const garrisonFactor = garrison < 20 ? 1.6 : garrison < 60 ? 1.25 : garrison < 120 ? 1 : 0.75;
  const integrityFactor = integrity < 25 ? 1.5 : integrity < 50 ? 1.2 : 1;
  const hmgFactor = Math.max(0.7, 1 - localHmg * 0.15);

  // 2% is the neutral baseline. Strong fortifications can push the risk down
  // to 0.3%; an exposed, collapsing command post can raise it to at most 5%.
  return Math.max(0.003, Math.min(0.05, 0.02 * fortFactor * garrisonFactor * integrityFactor * hmgFactor));
};

export const formatCommanderRisk = (risk: number): string => `${(risk * 100).toFixed(1)}%`;
