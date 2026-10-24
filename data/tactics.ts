import type { ChapterId, EquippedTactic, Location, TacticId } from '../types';

export interface TacticDefinition {
  id: TacticId;
  chapterId: ChapterId;
  title: string;
  description: string;
  effect: string;
  tradeoff: string;
}

export const TACTIC_RULES = {
  groupEscort: { capacity: 8, ammo: 20, pressureExtra: 8 },
  wallHug: { minutesExtra: 10, pressureReduction: 15 },
  rapidCrossing: { minutes: 20, capacity: 20, ammo: 60, pressure: 16, extraFatigue: 8 },
  coveredWithdrawal: { minutes: 30, pressure: 18, casualtyReduction: 2 },
  emergencyShoring: { minutes: 30, materials: 100, integrity: 10, pressure: 10 },
  urgentAid: { minutes: 30, capacity: 2, medkitsPerPerson: 2, pressure: 10 },
} as const;
const R = TACTIC_RULES;

export const TACTICS: readonly TacticDefinition[] = [
  { id: 'group_escort', chapterId: 'street', title: '分组接应',
    description: '班长压着名单：“前后都得有人照看。多带两个，不是把队伍往一块挤。”',
    effect: `一次护送上限6→${R.groupEscort.capacity}人，仍按已选路线耗时。`, tradeoff: `额外消耗${R.groupEscort.ammo}发七九弹，基础压力增量额外+${R.groupEscort.pressureExtra}；至少7人等待护送。` },
  { id: 'wall_hug', chapterId: 'street', title: '贴墙慢行',
    description: '“慢一点，让后头的人跟上。”班长指着路边的遮蔽；这条路不会变短，要走得稳，就得多留些时间。',
    effect: `一次护送的压力增量降低${R.wallHug.pressureReduction}点。`, tradeoff: `护送额外耗时${R.wallHug.minutesExtra}分钟，封锁期限照常推进。` },
  { id: 'rapid_crossing', chapterId: 'bridge', title: '加速渡桥',
    description: '传令兵拿着分批接应的草案：“到了那边，谁负责再点一次名？您得给我一句准话。”',
    effect: `一次${R.rapidCrossing.minutes}分钟压制掩护，过桥人数上限10→${R.rapidCrossing.capacity}人。`, tradeoff: `本次七九弹共${R.rapidCrossing.ammo}发、压力最多+${R.rapidCrossing.pressure}，额外疲劳最多+${R.rapidCrossing.extraFatigue}；至少11人尚未过桥。` },
  { id: 'covered_withdrawal', chapterId: 'bridge', title: '交替撤离',
    description: '“谁都不单留下。”班长指着两组的名单，“最后走的人，也得有人接。”',
    effect: `本次撤离若接敌，小队伤亡最多减少${R.coveredWithdrawal.casualtyReduction}人。`, tradeoff: `撤离20→${R.coveredWithdrawal.minutes}分钟；仍须二次确认、达成目标并赶在封锁前撤出。` },
  { id: 'emergency_shoring', chapterId: 'sihang', title: '应急支撑',
    description: '工兵把修补单摊开：“只能先顶住一处受损支撑。整面墙的活，不能算做完。”',
    effect: `${R.emergencyShoring.minutes}分钟修补一处受控楼层，完整度最多+${R.emergencyShoring.integrity}。`, tradeoff: `消耗${R.emergencyShoring.materials}份工事材料，不提高工事等级；无法修补失守楼层。` },
  { id: 'urgent_aid', chapterId: 'sihang', title: '紧急救治',
    description: '军医压着急救单：“要赶这半个钟头，就得多用些东西。别让我先答应能救几个，药箱还得数清。”',
    effect: `${R.urgentAid.minutes}分钟让最多${R.urgentAid.capacity}名现有伤员恢复战斗力。`, tradeoff: `每人消耗${R.urgentAid.medkitsPerPerson}份急救包；地下室医院必须仍受控。` },
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
