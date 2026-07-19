import type { Location } from '../types';
import { GENERAL_CHATTER } from '../data/text/chatter';

export type RandomSource = () => number;

export const LOCATIONS: Location[] = ['屋顶', '二楼阵地', '一楼入口', '地下室'];
export const FORTIFICATION_NAMES = ['无掩体', '沙袋防线', '加固掩体', '堡垒化阵地'] as const;

export const pickWith = <T>(items: T[], random: RandomSource): T =>
  items[Math.floor(random() * items.length)];

export const findLocations = (command: string): Location[] => LOCATIONS
  .map((location) => {
    const aliases = location === '屋顶' ? ['屋顶', '楼顶']
      : location === '二楼阵地' ? ['二楼阵地', '二楼']
        : location === '一楼入口' ? ['一楼入口', '一楼']
          : ['地下室', '地下'];
    const indexes = aliases.map((alias) => command.indexOf(alias)).filter((index) => index >= 0);
    return { location, index: indexes.length ? Math.min(...indexes) : -1 };
  })
  .filter((entry) => entry.index >= 0)
  .sort((a, b) => a.index - b.index)
  .map((entry) => entry.location);

const matchesAny = (input: string, keywords: string[]): boolean =>
  keywords.some((keyword) => input.includes(keyword));

export const getConversationalResponse = (input: string, random: RandomSource): string => {
  if (matchesAny(input, ['你是谁', '我是谁', '介绍', '名字', '身份', '穿越', '系统'])) return pickWith(GENERAL_CHATTER.META_IDENTITY, random);
  if (matchesAny(input, ['电报', '师部', '命令', '消息', '孙元良', '顾祝同', '蒋', '上级', '无线电', '信号'])) return pickWith(GENERAL_CHATTER.RADIO_INTEL, random);
  if (matchesAny(input, ['杀', '拼', '干', '弄死', '击退', '冲锋', '进攻', '灭', '宰', '打死', '反击', '血'])) return pickWith(GENERAL_CHATTER.BLOODTHIRST, random);
  if (matchesAny(input, ['快', '慢', '加速', '没时间', '速度', '抓紧', '磨蹭', '来不及', '迅速'])) return pickWith(GENERAL_CHATTER.URGENCY, random);
  if (matchesAny(input, ['太难', '猛', '守不住', '变态', '强', '怎么打', '太多', '受不了', '绝望', '不行'])) return pickWith(GENERAL_CHATTER.DIFFICULTY, random);
  if (matchesAny(input, ['副官', '参谋', '报告', '长官'])) return pickWith(GENERAL_CHATTER.ADJUTANT, random);
  if (matchesAny(input, ['机枪', '连长', '重火力', '弹药', '马克沁', '扫射'])) return pickWith(GENERAL_CHATTER.HMG_TALK, random);
  if (matchesAny(input, ['大家', '弟兄', '士兵', '战士', '人', '咱们', '队伍', '一营'])) return pickWith(GENERAL_CHATTER.SOLDIERS_TALK, random);
  if (matchesAny(input, ['看', '观察', '环境', '周围', '河', '租界', '桥', '灯', '外面'])) return pickWith(GENERAL_CHATTER.ENVIRONMENT, random);
  if (matchesAny(input, ['饿', '吃', '水', '渴', '饭', '粮'])) return pickWith(GENERAL_CHATTER.HUNGRY, random);
  if (matchesAny(input, ['鬼子', '日军', '日本', '敌人', '仇'])) return pickWith(GENERAL_CHATTER.ENEMY, random);
  if (matchesAny(input, ['你好', '在吗', '喂', '嗨', '收到', '好'])) return pickWith(GENERAL_CHATTER.GREETING, random);
  return pickWith(GENERAL_CHATTER.CONFUSED, random);
};
