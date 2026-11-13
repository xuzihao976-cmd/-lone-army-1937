import type { GameStats, Location } from '../types';
import { LOCATIONS, pickWith, type RandomSource } from './commandUtils';

export const reconcileSoldierDistribution = (
  distribution: Record<string, number>,
  totalSoldiers: number,
  preferredLocation?: Location | null,
): Record<string, number> => {
  const next = Object.fromEntries(LOCATIONS.map((location) => [location, Math.max(0, Math.floor(distribution[location] || 0))]));
  let difference = LOCATIONS.reduce((sum, location) => sum + next[location], 0) - Math.max(0, Math.floor(totalSoldiers));

  while (difference > 0) {
    const candidates = preferredLocation && next[preferredLocation] > 0
      ? [preferredLocation, ...LOCATIONS.filter((location) => location !== preferredLocation)]
      : [...LOCATIONS].sort((a, b) => next[b] - next[a]);
    const target = candidates.find((location) => next[location] > 0);
    if (!target) break;
    const removed = Math.min(difference, next[target]);
    next[target] -= removed;
    difference -= removed;
  }

  if (difference < 0) next['地下室'] += Math.abs(difference);
  return next;
};

export const applyNamedSoldierDeaths = (
  stats: GameStats,
  updates: Partial<GameStats>,
  deaths: number,
  narrative: string[],
  random: RandomSource,
): void => {
  if (deaths <= 0) return;
  const currentRoster = updates.roster || stats.roster || [];
  const livingNamed = currentRoster.filter((soldier) => soldier.status === 'alive');
  const namedDeathChance = Math.min(1, deaths * 0.1);
  let newRoster = [...currentRoster];

  if (random() < namedDeathChance && livingNamed.length > 0) {
    const victim = livingNamed[Math.floor(random() * livingNamed.length)];
    newRoster = newRoster.map((soldier) => soldier.id === victim.id
      ? { ...soldier, status: 'dead', deathReason: 'combat' }
      : soldier);
    narrative.push('\n' + pickWith([
      `【阵亡确认】${victim.name}（${victim.origin}）的死讯送到指挥处。副官抬头确认名字，然后把名册翻到那一行。纸页轻轻响了一下。`,
      `【阵亡确认】点到${victim.name}（${victim.origin}）时，传令兵停下来报了阵亡。有人让他再说一遍；不是没有听见。`,
      `【阵亡确认】${victim.name}（${victim.origin}）已阵亡。上一回点名时还能有人回答的位置，如今只剩一行要核实的记录。`,
    ], random));
  }

  updates.roster = newRoster;
};
