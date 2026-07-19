import type { GameStats } from '../types';

export const getSearchYieldFactor = (searchExhaustion: number): number =>
  Math.max(0.25, 1 - Math.max(0, searchExhaustion) * 0.14);

export const getRaidSuccessChance = (stats: GameStats): number => {
  const reconBonus = Math.max(0, stats.reconBonus || 0);
  const assaultBonus = stats.specialistSquads.some((squad) => squad.status === 'active' && squad.role === 'assault') ? 0.08 : 0;
  const fatiguePenalty = Math.max(0, (stats.fatigue - 55) / 250);
  return Math.max(0.2, Math.min(0.78, 0.35 + reconBonus / 100 + assaultBonus + stats.morale / 500 - fatiguePenalty));
};

export const getSpeechMoraleGain = (stats: GameStats): number => {
  const recentBattle = stats.turnCount - stats.lastAttackTurn <= 2;
  return Math.max(3, (recentBattle ? 12 : 9) - (stats.speechStreak || 0) * 3);
};

export const getFatigueCasualtyFactor = (fatigue: number): number =>
  fatigue >= 75 ? 1.15 : fatigue >= 55 ? 1.07 : 1;
