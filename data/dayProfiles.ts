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
    description: '敌军尚在集结，抓紧时间建立第一道防线。',
    intel: '日军动向不明，先头步兵正在雨幕中集结。',
    threatMultiplier: 0.8,
    artilleryChance: 0.2,
    bombingChance: 0.08,
    largeAttackBonus: 0,
  },
  1: {
    day: 1,
    title: '步兵试探',
    description: '小股步兵与迫击炮轮番试探仓库防线。',
    intel: '日军先头部队已展开，主要威胁是步兵冲击与轻型迫击炮。',
    threatMultiplier: 0.9,
    artilleryChance: 0.35,
    bombingChance: 0.16,
    largeAttackBonus: 0,
  },
  2: {
    day: 2,
    title: '炮火压制',
    description: '敌军加强炮击，长时间行动更容易暴露阵地。',
    intel: '日军增派迫击炮和平射炮，正在校准仓库射界。',
    threatMultiplier: 1,
    artilleryChance: 0.58,
    bombingChance: 0.24,
    largeAttackBonus: 0.05,
  },
  3: {
    day: 3,
    title: '装甲强攻',
    description: '装甲车与重炮投入战斗，大规模进攻概率上升。',
    intel: '敌军装甲车和平射炮抵达，正准备正面突破一楼入口。',
    threatMultiplier: 1.1,
    artilleryChance: 0.68,
    bombingChance: 0.3,
    largeAttackBonus: 0.16,
  },
  4: {
    day: 4,
    title: '四面合围',
    description: '封锁圈收紧，任何离开掩体的行动都更加危险。',
    intel: '日军完成四面合围，并在苏州河沿岸建立交叉火力。',
    threatMultiplier: 1.18,
    artilleryChance: 0.72,
    bombingChance: 0.34,
    largeAttackBonus: 0.2,
  },
  5: {
    day: 5,
    title: '毁灭总攻',
    description: '敌军失去耐心，重炮、航空兵和步兵将连续压上。',
    intel: '日军重武器全部进入阵位，一场毁灭性总攻迫在眉睫。',
    threatMultiplier: 1.3,
    artilleryChance: 0.8,
    bombingChance: 0.42,
    largeAttackBonus: 0.3,
  },
  6: {
    day: 6,
    title: '最后坚守',
    description: '双方都已到极限，守住这一轮就能完成使命。',
    intel: '敌军已成强弩之末，但仍在集结最后一批突击队。',
    threatMultiplier: 1.2,
    artilleryChance: 0.65,
    bombingChance: 0.3,
    largeAttackBonus: 0.2,
  },
};

export const getDayProfile = (day: number): DayProfile =>
  DAY_PROFILES[Math.max(0, Math.min(6, Math.floor(day)))] ?? DAY_PROFILES[6];

export { DAY_PROFILES };
