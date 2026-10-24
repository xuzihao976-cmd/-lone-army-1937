import type { GameStats } from '../types';
import { isSectorHeld, SECTOR_LOCATIONS } from './strategicDefense';
import { TACTICAL_CARDS } from '../data/text/events';

/** These are story encounters. Only new encounters use these source gates;
 * already offered legacy opportunities remain claimable exactly once. */
export const eligibleBattlefieldEncounters = (stats: GameStats, actionType: string) => TACTICAL_CARDS.filter(card =>
  !stats.usedTacticalCards.includes(card.id) && (card.id === 'morale_boost'
    || (card.id === 'supplies' && actionType === 'scavenge')
    || (card.id === 'reinforce' && stats.day === 1 && actionType === 'recon' && isSectorHeld(stats, '一楼入口'))));

export interface TacticalCardResolution {
  updatedStats: Partial<GameStats>;
  narrative: string;
  historyTitle: string;
  historyDetail: string;
}

export const resolveTacticalCard = (stats: GameStats, cardId: string): TacticalCardResolution | null => {
  if (!stats.activeTacticalCard || stats.activeTacticalCard.actionCmd.toLowerCase() !== `card_resolve:${cardId}`) return null;
  if (cardId === 'morale_boost') return {
    updatedStats: { activeTacticalCard: null, morale: Math.min(100, stats.morale + 15) },
    narrative: `【家书抵万金】读信的人把纸举远，又拿近，最后请旁边的人念。念到“都好，勿念”，他笑了一下，嘴角却没能撑住。信很薄，被他来回折了几次，才收进贴身口袋。\n\n💪 士气 +${Math.min(15, 100 - stats.morale)}`,
    historyTitle: '家书抵万金',
    historyDetail: `家书送达，士气由${stats.morale}升至${Math.min(100, stats.morale + 15)}。`,
  };
  if (cardId === 'reinforce') {
    const target = [stats.location, ...SECTOR_LOCATIONS].find(location => isSectorHeld(stats, location));
    if (!target) return {
      updatedStats: { activeTacticalCard: null }, narrative: '接应点已经失去控制，本次无法补入人员。散兵的去向未定，没有被记为阵亡。',
      historyTitle: '接应未成', historyDetail: '没有可控接应点，未增加人员。',
    };
    return {
      updatedStats: {
        activeTacticalCard: null,
        soldiers: stats.soldiers + 5,
        soldierDistribution: {
          ...stats.soldierDistribution,
          [target]: (stats.soldierDistribution[target] || 0) + 5,
        },
      },
      narrative: `【接纳散兵】五名散兵核过身份，编入${target}。问起还能不能走，带头的人点了点头；真正迈步时，却先扶了墙一下。\n\n↗ 士兵 +5`,
      historyTitle: '散兵接应',
      historyDetail: `5名散兵加入${target}守军。`,
    };
  }
  if (cardId === 'supplies') return {
    updatedStats: { activeTacticalCard: null, ammo: stats.ammo + 500 },
    narrative: '【废墟里的弹药】箱子撬开，七九弹一排排露出来。清点的人怕弄错，数完又验了一遍：五百发。旁边的兵一直看着，等到入库才把肩膀松下来。\n\n📦 七九弹 +500',
    historyTitle: '意外物资',
    historyDetail: '废墟军火箱中找回500发七九弹。',
  };
  return null;
};
