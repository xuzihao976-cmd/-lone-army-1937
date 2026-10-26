import type { ChapterId, ChapterMission, GameStats } from '../types';

export interface ChapterDefinition {
  id: ChapterId;
  number: string;
  title: string;
  subtitle: string;
  setting: string;
  duration: string;
  description: string;
  objective: string;
  opening: string;
  next?: ChapterId;
}

export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: 'street', number: '一', title: '街巷撤收', subtitle: '把人带回来',
    setting: '淞沪战场 · 虚构支线', duration: '短篇 · 约10—15次行动',
    description: '巷道里还有人没有出来。先查清路，再在封锁前接回他们；不是找到人就算救到了人。',
    objective: '180分钟内护送至少8名被困民众到安全区，并确认撤出小队。',
    opening: '傍晚，临时接应所。\n\n门板上压着一份十二人的求援登记，有人把同一家人的名字写在了一起。老班长把纸折好：“找到了，也得带出来。别隔着一条街就说人已经安全。”\n\n先侦察路线，再选择内巷或沿河撤收线；搜救找到的人需要另行护送。封锁会在180分钟后收紧，至少护送8人并让小队撤离才算完成。\n\n本章人物与行动为虚构支线，不对应某次真实史实。',
    next: 'bridge',
  },
  {
    id: 'bridge', number: '二', title: '桥头阻击', subtitle: '最后走的人',
    setting: '淞沪战场 · 虚构支线', duration: '短篇 · 约8—12次行动',
    description: '身后的人正在过桥。火力、掩体与轮换都得算，而任务完成后，你还需要把掩护小队撤出来。',
    objective: '掩护60名友军过桥，再于180分钟封锁前确认撤出小队。',
    opening: '桥头，临时掩护阵地。\n\n传令兵指向桥面：“还有六十个人。那边有人接，咱们看住这一头。”你问他最后一队怎么走，他没立刻答，先看了看身边的人。\n\n每2分钟可让1名友军过桥，交谈不推进时间。压制射击、加固与轮换各有代价；60人过桥后，明确下令撤离并再次确认。180分钟后通路关闭，不能一直守到没有退路。\n\n本章为虚构支线，与四行仓库切换小队视角。',
    next: 'sihang',
  },
  {
    id: 'sihang', number: '三', title: '四行1937', subtitle: '仓库里的名字',
    setting: '四行仓库 · 历史背景演绎', duration: '长篇 · 原版完整战役',
    description: '四层阵地、专业小队、伤员与物资。沿用完整四行战役，守到任务期限，或按规则奉命撤退。',
    objective: '守至第6天，或第4天起奉命撤退；撤退仍需二次确认。',
    opening: '',
  },
];

export const isChapterId = (value: unknown): value is ChapterId =>
  CHAPTERS.some(chapter => chapter.id === value);
export const getChapter = (id: ChapterId = 'sihang'): ChapterDefinition =>
  CHAPTERS.find(chapter => chapter.id === id) ?? CHAPTERS[2];
export const isShortChapter = (stats: Pick<GameStats, 'chapterId'>): boolean =>
  stats.chapterId === 'street' || stats.chapterId === 'bridge';
export const CHAPTER_TIME_LIMIT = 180;
export const EVACUATION_TARGET = 8;
export const CIVILIAN_COUNT = 12;
export const CROSSING_TARGET = 60;
export const EXTRACTION_MINUTES = 20;

export const initialMission = (): ChapterMission => ({
  started: false, elapsedMinutes: 0, recon: false, route: null,
  found: 0, evacuated: 0, crossed: 0, cover: 0,
});

export const applyChapterSetup = (stats: GameStats, chapterId: ChapterId): GameStats => {
  stats.chapterId = chapterId;
  if (chapterId === 'sihang') return stats;
  const street = chapterId === 'street';
  stats.mission = initialMission();
  stats.tutorialStep = 3;
  stats.day = 0;
  stats.currentTime = street ? '17:00' : '06:00';
  stats.soldiers = street ? 36 : 48;
  stats.wounded = 0;
  stats.ammo = street ? 240 : 420;
  stats.machineGunAmmo = 0;
  stats.grenades = 0;
  stats.sandbags = street ? 0 : 120;
  stats.medkits = street ? 6 : 8;
  stats.morale = 72;
  stats.fatigue = 10;
  stats.siegeMeter = 15;
  stats.hmgSquads = [];
  stats.specialistSquads = [];
  stats.enemyOperation = null;
  // Internal warehouse coordinates remain opaque to these chapters' own UI.
  stats.soldierDistribution = { '一楼入口': stats.soldiers, '二楼阵地': 0, '地下室': 0, '屋顶': 0 };
  stats.roster = [
    { id: `${chapterId}-1`, name: street ? '周存生' : '韩立秋', origin: '虚构人物', trait: '老班长', status: 'alive' },
    { id: `${chapterId}-2`, name: street ? '陆文清' : '钱有根', origin: '虚构人物', trait: '传令兵', status: 'alive' },
    { id: `${chapterId}-3`, name: street ? '许守义' : '周述平', origin: '虚构人物', trait: '救护兵', status: 'alive' },
  ];
  return stats;
};

/** Invalid chapter progress is rejected, never reset into another supply grant. */
export const sanitizeMission = (value: unknown, id: ChapterId): ChapterMission | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  const integer = (key: string, max: number) => Number.isInteger(m[key]) && (m[key] as number) >= 0 && (m[key] as number) <= max;
  if (typeof m.started !== 'boolean' || typeof m.recon !== 'boolean'
    || !integer('elapsedMinutes', 240) || !integer('found', CIVILIAN_COUNT)
    || !integer('evacuated', CIVILIAN_COUNT) || !integer('crossed', CROSSING_TARGET) || !integer('cover', 3)
    || ![null, 'inner', 'river'].includes(m.route as null | string)
    || (m.evacuated as number) > (m.found as number)
    || (!m.recon && m.route !== null)
    || (id === 'street' && (m.crossed !== 0 || m.cover !== 0))
    || (id === 'bridge' && (m.found !== 0 || m.evacuated !== 0 || m.route !== null))) return null;
  return {
    started: m.started, recon: m.recon, elapsedMinutes: m.elapsedMinutes as number,
    route: m.route as ChapterMission['route'], found: m.found as number,
    evacuated: m.evacuated as number, crossed: m.crossed as number, cover: m.cover as number,
  };
};
