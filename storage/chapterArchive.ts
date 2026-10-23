import { isChapterId } from '../data/chapters';
import type { ChapterId, EndingType, GameStats } from '../types';

export const CHAPTER_ARCHIVE_KEY = 'lone_army_chapter_archive_v1';
export interface ChapterRecord {
  cleared: boolean;
  campaignId: string;
  ending: EndingType;
  soldiers: number;
  wounded: number;
  rescued: number;
  crossed: number;
  recordedAt: number;
}
export type ChapterArchive = Partial<Record<ChapterId, ChapterRecord>>;
interface ArchiveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const endings: EndingType[] = ['victory_hold', 'victory_retreat', 'victory_evacuation', 'victory_cover',
  'defeat_assault', 'defeat_deserter', 'defeat_martyr', 'defeat_commander', 'defeat_generic', 'defeat_mission'];

export const readChapterArchive = (storage: ArchiveStorage): ChapterArchive => {
  try {
    const raw: unknown = JSON.parse(storage.getItem(CHAPTER_ARCHIVE_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const archive: ChapterArchive = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!isChapterId(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const v = value as Record<string, unknown>;
      if (typeof v.cleared !== 'boolean' || typeof v.campaignId !== 'string' || v.campaignId.length > 80
        || !endings.includes(v.ending as EndingType)
        || !['soldiers', 'wounded', 'rescued', 'crossed', 'recordedAt'].every(k =>
          typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= 0)) continue;
      archive[id] = { cleared: v.cleared, campaignId: v.campaignId, ending: v.ending as EndingType,
        soldiers: v.soldiers as number, wounded: v.wounded as number, rescued: v.rescued as number,
        crossed: v.crossed as number, recordedAt: v.recordedAt as number };
    }
    return archive;
  } catch { return {}; }
};

/** Archives affect the chapter shelf only; they never grant troops or unlock rewards. */
export const recordChapterResult = (storage: ArchiveStorage, stats: GameStats): ChapterArchive => {
  const archive = readChapterArchive(storage);
  if (!stats.isGameOver || stats.gameResult === 'ongoing') return archive;
  const id = stats.chapterId ?? 'sihang';
  if (archive[id]?.campaignId === stats.campaignId) return archive;
  archive[id] = {
    cleared: !!archive[id]?.cleared || stats.gameResult.startsWith('victory_'),
    campaignId: stats.campaignId, ending: stats.gameResult,
    soldiers: stats.soldiers + stats.hmgSquads.reduce((n, squad) => n + (squad.status === 'active' ? squad.count : 0), 0),
    wounded: stats.wounded, rescued: stats.mission?.evacuated ?? 0, crossed: stats.mission?.crossed ?? 0,
    recordedAt: Date.now(),
  };
  storage.setItem(CHAPTER_ARCHIVE_KEY, JSON.stringify(archive));
  return archive;
};

export const chapterTransition = (id: ChapterId, archive: ChapterArchive): string => {
  if (id === 'bridge' && archive.street) {
    return archive.street.ending === 'victory_evacuation'
      ? `上一份撤收记录里，有${archive.street.rescued}名民众抵达安全区。这次镜头转向另一支掩护队：要让身后的人先走，也要记得给自己留路。`
      : '上一份撤收记录没能完成任务，结局没有被改写。这次换一支小队守住桥头，把每一道撤离命令说清。';
  }
  if (id === 'sihang' && archive.bridge) {
    return `桥头档案记下${archive.bridge.crossed}名友军过桥。镜头转入四行仓库，另一支部队在这里接防。前章的小队留在自己的名册上；本章人员与物资独立计算。`;
  }
  return '各章切换不同小队视角，人员与物资独立，分别自动保存进度。重开本关会替换本关自动档，已完成的章节标记保留。';
};
