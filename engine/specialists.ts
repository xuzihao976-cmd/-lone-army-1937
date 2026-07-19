import type { GameStats, Location, SpecialistRole } from '../types';

export const hasSpecialist = (stats: GameStats, role: SpecialistRole, location?: Location): boolean =>
  (stats.specialistSquads || []).some((squad) =>
    squad.status === 'active' && squad.role === role && (!location || squad.location === location));

export const SPECIALIST_EFFECTS: Record<SpecialistRole, string> = {
  veteran: '本层战斗伤亡降低15%',
  engineer: '加固少用30工事材料，并多修复6%',
  medic: '地下室每次救治额外恢复2人上限',
  assault: '反冲锋成功率提高12%，伤亡降低2人',
};
