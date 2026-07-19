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
      `【噩耗】混战中，${victim.name}被流弹击中。这个${victim.origin}汉子死前手里还紧紧攥着那封没写完的家书。`,
      `【牺牲】一声巨响，${victim.name}所在的掩体被炸平。我们再也听不到他${victim.trait === '暴躁' ? '骂娘' : '吹牛'}的声音了。`,
      `【悲歌】为了掩护新兵，${victim.name}冲出了掩体，瞬间被机枪扫倒。`,
    ], random));
  }

  updates.roster = newRoster;
};
