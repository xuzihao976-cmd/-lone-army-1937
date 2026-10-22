import type { Location } from '../types';
import { canonicalCommand } from './commandLanguage';

export type RandomSource = () => number;

export const LOCATIONS: Location[] = ['屋顶', '二楼阵地', '一楼入口', '地下室'];
export const FORTIFICATION_NAMES = ['无掩体', '沙袋防线', '加固掩体', '堡垒化阵地'] as const;

export const pickWith = <T>(items: T[], random: RandomSource): T =>
  items[Math.floor(random() * items.length)];

export const findLocations = (command: string): Location[] => LOCATIONS
  .map((location) => {
    const aliases = location === '屋顶' ? ['屋顶', '楼顶', '顶楼']
      : location === '二楼阵地' ? ['二楼阵地', '二楼']
        : location === '一楼入口' ? ['一楼入口', '一楼']
          : ['地下室', '地下'];
    const indexes = aliases.map((alias) => canonicalCommand(command).indexOf(alias)).filter((index) => index >= 0);
    return { location, index: indexes.length ? Math.min(...indexes) : -1 };
  })
  .filter((entry) => entry.index >= 0)
  .sort((a, b) => a.index - b.index)
  .map((entry) => entry.location);

