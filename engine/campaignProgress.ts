import type { GameStats } from '../types';

export const addConsequenceFlag = (flags: string[], flag: string): string[] =>
  flags.includes(flag) ? flags : [...flags, flag];

export const appendCampaignHistory = (
  stats: GameStats,
  updates: Partial<GameStats>,
  title: string,
  detail: string,
  tone: 'good' | 'bad' | 'neutral' = 'neutral',
): void => {
  const history = updates.campaignHistory || stats.campaignHistory || [];
  updates.campaignHistory = [...history, {
    id: `${stats.day}-${stats.currentTime}-${stats.turnCount}-${history.length}`,
    day: stats.day,
    time: stats.currentTime,
    title,
    detail,
    tone,
  }].slice(-30);
};
