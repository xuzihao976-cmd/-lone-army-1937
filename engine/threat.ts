export const calculateAttackChance = (
  siegeMeter: number,
  turnCount: number,
  lastAttackTurn: number,
): number => {
  const threat = Math.max(0, Math.min(100, siegeMeter));
  if (threat < 30 || turnCount - lastAttackTurn < 1) return 0;
  if (threat >= 100) return 1;
  return Math.min(0.68, 0.06 + (threat - 30) * 0.0085);
};
