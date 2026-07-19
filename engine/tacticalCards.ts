import type { GameStats } from '../types';
import { isSectorHeld } from './strategicDefense';

export interface TacticalCardResolution {
  updatedStats: Partial<GameStats>;
  narrative: string;
  historyTitle: string;
  historyDetail: string;
}

export const resolveTacticalCard = (stats: GameStats, cardId: string): TacticalCardResolution | null => {
  if (cardId === 'morale_boost') return {
    updatedStats: { activeTacticalCard: null, morale: Math.min(100, stats.morale + 15) },
    narrative: '【家书抵万金】信纸在一双双沾满灰尘的手里传递。有人抹去眼泪，重新抓紧了步枪。\n\n💪 士气 +15',
    historyTitle: '家书抵万金',
    historyDetail: '家书送达，守军士气提升15点。',
  };
  if (cardId === 'reinforce') {
    const target = isSectorHeld(stats, stats.location) ? stats.location : '二楼阵地';
    return {
      updatedStats: {
        activeTacticalCard: null,
        soldiers: stats.soldiers + 5,
        soldierDistribution: {
          ...stats.soldierDistribution,
          [target]: (stats.soldierDistribution[target] || 0) + 5,
        },
      },
      narrative: `【孤胆英雄】五名从火线撤下的老兵穿过封锁，主动加入${target}。\n\n↗ 士兵 +5`,
      historyTitle: '孤胆英雄',
      historyDetail: `5名散兵加入${target}守军。`,
    };
  }
  if (cardId === 'supplies') return {
    updatedStats: { activeTacticalCard: null, ammo: stats.ammo + 500 },
    narrative: '【意外物资】清理废墟时，工兵从断梁下拖出一个完整的军火箱。\n\n📦 七九弹 +500',
    historyTitle: '意外物资',
    historyDetail: '废墟军火箱中找回500发七九弹。',
  };
  return null;
};
