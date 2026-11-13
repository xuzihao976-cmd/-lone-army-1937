export interface DayProfile {
  day: number;
  title: string;
  description: string;
  intel: string;
  threatMultiplier: number;
  artilleryChance: number;
  bombingChance: number;
  largeAttackBonus: number;
}

const DAY_PROFILES: Record<number, DayProfile> = {
  0: {
    day: 0,
    title: '雨夜布防',
    description: '雨气贴着厚墙，麻袋一只只递到缺口前。先把第一道防线立起来，轮休的人才有地方靠。',
    intel: '敌军具体动向尚未确认，先完成布防与轮休。',
    threatMultiplier: 0.8,
    artilleryChance: 0.2,
    bombingChance: 0.08,
    largeAttackBonus: 0,
  },
  1: {
    day: 1,
    title: '步兵试探',
    description: '第一天的枪声把每个人都叫醒了。敌军开始试探，守军得记清每一处阵位，而不是只盯住最响的地方。',
    intel: '总体威胁以步兵进攻为主，炮击与空袭仍可能出现；具体目标须侦察。',
    threatMultiplier: 0.9,
    artilleryChance: 0.35,
    bombingChance: 0.16,
    largeAttackBonus: 0,
  },
  2: {
    day: 2,
    title: '炮火压制',
    description: '墙里的震动越来越密。人开始分不清自己是在等炮声停，还是已经习惯了它；长时间行动要格外留心敌军接近。',
    intel: '炮击概率提高；一项行动耗时越长，敌军推进越多。',
    threatMultiplier: 1,
    artilleryChance: 0.58,
    bombingChance: 0.24,
    largeAttackBonus: 0.05,
  },
  3: {
    day: 3,
    title: '攻势加重',
    description: '作战图上每一层都有人要守。大规模进攻风险上升，传令兵反复核对路线，生怕把增援带错一道楼梯。',
    intel: '大规模进攻与重火力风险继续上升；来袭楼层由实际敌军行动决定。',
    threatMultiplier: 1.1,
    artilleryChance: 0.68,
    bombingChance: 0.3,
    largeAttackBonus: 0.16,
  },
  4: {
    day: 4,
    title: '四面合围',
    description: '外面的路越来越窄，仓库里却仍得给轮休与救护留地方。每次要人离开遮蔽，命令都显得比纸重。',
    intel: '战场压力进一步提高；本局已开放奉命撤退选项，仍需二次确认。',
    threatMultiplier: 1.18,
    artilleryChance: 0.72,
    bombingChance: 0.34,
    largeAttackBonus: 0.2,
  },
  5: {
    day: 5,
    title: '重压之下',
    description: '第五天，报数与领料都变得很慢。人并非不明白命令，只是每一次站起来，都得先把力气重新找齐。',
    intel: '炮击、空袭与大规模进攻风险处于高位；仍须按侦察结果布防。',
    threatMultiplier: 1.3,
    artilleryChance: 0.8,
    bombingChance: 0.42,
    largeAttackBonus: 0.3,
  },
  6: {
    day: 6,
    title: '抵达第六天',
    description: '日历终于翻到第六天。本局坚守期限已到，接下来要把人、阵地与代价，按真实结果逐项记清。',
    intel: '已达本局任务期限；是否完成坚守，以本次最终结算为准。',
    threatMultiplier: 1.2,
    artilleryChance: 0.65,
    bombingChance: 0.3,
    largeAttackBonus: 0.2,
  },
};

export const getDayProfile = (day: number): DayProfile =>
  DAY_PROFILES[Math.max(0, Math.min(6, Math.floor(day)))] ?? DAY_PROFILES[6];

export { DAY_PROFILES };
