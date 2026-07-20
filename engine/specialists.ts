import type { GameStats, Location, SpecialistRole, SpecialistSquad } from '../types';

export type SpecialistReadiness = 'full' | 'reduced' | 'critical' | 'inactive';

export interface SpecialistReadinessProfile {
  readiness: SpecialistReadiness;
  effectFactor: number;
  availableMembers: number;
  requiredMembers: number;
}

const activeDemandAt = (stats: GameStats, location: Location): number =>
  (stats.specialistSquads || [])
    .filter((squad) => squad.status === 'active' && squad.location === location)
    .reduce((sum, squad) => sum + Math.max(0, squad.count), 0);

/**
 * Specialist squads are part of the displayed rifle garrison, not bonus men.
 * If a floor cannot support every squad assigned there, its available members
 * and effects are reduced proportionally across those squads.
 */
export const getSpecialistReadiness = (
  stats: GameStats,
  squad: SpecialistSquad,
): SpecialistReadinessProfile => {
  const sectorHeld = (stats.sectorIntegrity[squad.location] ?? 100) > 0;
  const garrison = Math.max(0, stats.soldierDistribution[squad.location] || 0);
  const demand = activeDemandAt(stats, squad.location);
  if (squad.status !== 'active' || !sectorHeld || garrison <= 0 || demand <= 0) {
    return { readiness: 'inactive', effectFactor: 0, availableMembers: 0, requiredMembers: squad.count };
  }

  const manpowerRatio = Math.min(1, garrison / demand);
  const availableMembers = Math.min(squad.count, Math.floor(squad.count * manpowerRatio));
  if (availableMembers <= 0) {
    return { readiness: 'inactive', effectFactor: 0, availableMembers: 0, requiredMembers: squad.count };
  }
  if (manpowerRatio >= 1) {
    return { readiness: 'full', effectFactor: 1, availableMembers, requiredMembers: squad.count };
  }
  if (manpowerRatio >= 0.5) {
    return { readiness: 'reduced', effectFactor: 0.75, availableMembers, requiredMembers: squad.count };
  }
  return { readiness: 'critical', effectFactor: 0.5, availableMembers, requiredMembers: squad.count };
};

export const getSpecialistEffectFactor = (
  stats: GameStats,
  role: SpecialistRole,
  location?: Location,
): number => Math.max(
  0,
  ...(stats.specialistSquads || [])
    .filter((squad) => squad.role === role && (!location || squad.location === location))
    .map((squad) => getSpecialistReadiness(stats, squad).effectFactor),
);

export const hasSpecialist = (stats: GameStats, role: SpecialistRole, location?: Location): boolean =>
  getSpecialistEffectFactor(stats, role, location) > 0;

export const SPECIALIST_EFFECTS: Record<SpecialistRole, string> = {
  veteran: '本层战斗伤亡降低15%',
  engineer: '加固少用30工事材料，并多修复6%',
  medic: '地下室每次救治额外恢复2人上限',
  assault: '反冲锋成功率提高12%，伤亡降低2人',
};

export const SPECIALIST_READINESS_LABELS: Record<SpecialistReadiness, string> = {
  full: '满员',
  reduced: '减员',
  critical: '残部',
  inactive: '失效',
};

export const getSpecialistEffectDescription = (
  stats: GameStats,
  squad: SpecialistSquad,
): string => {
  const factor = getSpecialistReadiness(stats, squad).effectFactor;
  if (factor <= 0) return '本层无足够驻军，专长暂时失效';
  if (squad.role === 'veteran') return `本层战斗伤亡降低${Math.round(15 * factor)}%`;
  if (squad.role === 'engineer') return `加固少用${Math.round(30 * factor)}工事材料，并多修复${Math.round(6 * factor)}%`;
  if (squad.role === 'medic') return `地下室每次救治额外恢复${Math.round(2 * factor)}人上限`;
  return `反冲锋成功率提高${Math.round(12 * factor)}%，伤亡降低${Math.round(2 * factor)}人`;
};
