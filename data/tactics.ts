import type { ChapterId, EquippedTactic, Location, TacticId } from '../types';

export interface TacticDefinition {
  id: TacticId;
  chapterId: ChapterId;
  title: string;
  description: string;
  effect: string;
  tradeoff: string;
}

export const TACTICS: readonly TacticDefinition[] = [
  { id: 'group_escort', chapterId: 'street', title: '分组接应',
    description: '“前后都得有人照看。多带两个，不是把队伍往一块挤。”班长把接应的人重新分开。',
    effect: '一次护送上限6→8人，仍按已选路线耗时。', tradeoff: '额外消耗20发七九弹，基础压力增量额外+8；至少7人等待护送。' },
  { id: 'wall_hug', chapterId: 'street', title: '贴墙慢行',
    description: '“慢一点，让后头的人跟上。”这条路没有变短，只是每一步都收得更紧。',
    effect: '一次护送的压力增量降低10点。', tradeoff: '护送额外耗时10分钟，封锁期限照常推进。' },
  { id: 'rapid_crossing', chapterId: 'bridge', title: '加速渡桥',
    description: '接应处与桥头对上了下一批的顺序。传令兵反复问清：到了那边，谁负责再点一次名？',
    effect: '一次20分钟压制掩护，过桥人数上限10→20人。', tradeoff: '本次七九弹共60发、压力最多+16，额外疲劳最多+8；至少11人尚未过桥。' },
  { id: 'covered_withdrawal', chapterId: 'bridge', title: '交替撤离',
    description: '“谁都不单留下。”班长把两组的顺序报完，又问了一遍最后接应的位置。',
    effect: '本次撤离若接敌，小队伤亡最多减少2人。', tradeoff: '撤离20→30分钟；仍须二次确认、达成目标并赶在封锁前撤出。' },
  { id: 'emergency_shoring', chapterId: 'sihang', title: '应急支撑',
    description: '工兵摸了摸开裂的支撑：“能先顶住这一处。整面墙的活，不能算做完。”',
    effect: '30分钟修补一处受控楼层，完整度最多+10。', tradeoff: '消耗100份工事材料，不提高工事等级；无法修补失守楼层。' },
  { id: 'urgent_aid', chapterId: 'sihang', title: '紧急救治',
    description: '军医把能先处理的名字圈出来：“先让这几个人有人照料。后头的，不能因此漏掉。”',
    effect: '30分钟让最多2名现有伤员恢复战斗力。', tradeoff: '每人消耗2份急救包；地下室医院必须仍受控。' },
];

export const getTactic = (id: unknown): TacticDefinition | undefined => TACTICS.find(tactic => tactic.id === id);
export const chapterTactics = (id: ChapterId) => TACTICS.filter(tactic => tactic.chapterId === id);
export const makeTactic = (id: TacticId | null, chapterId: ChapterId): EquippedTactic | null => {
  if (id === null) return null;
  if (getTactic(id)?.chapterId !== chapterId) throw new Error('Tactic does not belong to this chapter');
  return { id, spent: false };
};
export const tacticCommand = (id: TacticId, target?: Location): string => `tactic_use:${id}${target ? `:${target}` : ''}`;

/** Null is a deliberate no-card loadout, not a fresh reward during migration. */
export const migrateTactic = (value: unknown, chapterId: ChapterId): EquippedTactic | null | false => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const card = getTactic(item.id);
  return card?.chapterId === chapterId && typeof item.spent === 'boolean' ? { id: card.id, spent: item.spent } : false;
};
