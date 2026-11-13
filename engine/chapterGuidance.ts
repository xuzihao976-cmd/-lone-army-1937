import type { GameStats, MissionTiming } from '../types';
import { CHAPTER_TIME_LIMIT, CROSSING_TARGET, EVACUATION_TARGET, EXTRACTION_MINUTES } from '../data/chapters';

export const missionGoalMet = (stats: GameStats): boolean => !!stats.mission && (stats.chapterId === 'street'
  ? stats.mission.evacuated >= EVACUATION_TARGET : stats.chapterId === 'bridge' && stats.mission.crossed >= CROSSING_TARGET);

/** Projects a proposed action, including extraction that still needs confirmation. */
export const projectMissionTiming = (stats: GameStats, minutes: number, extracting = false, confirmationRequired = false): MissionTiming => {
  const elapsedAfter = stats.mission!.elapsedMinutes + minutes;
  return { elapsedAfter, remainingAfter: Math.max(0, CHAPTER_TIME_LIMIT - elapsedAfter), extracting, confirmationRequired,
    reachesDeadline: elapsedAfter >= CHAPTER_TIME_LIMIT,
    canWithdrawAfter: elapsedAfter + (extracting ? 0 : EXTRACTION_MINUTES) < CHAPTER_TIME_LIMIT };
};

export const formatMissionTiming = (timing: MissionTiming): string => {
  const when = timing.extracting ? timing.confirmationRequired ? '二次确认撤离后' : '撤离后' : '行动后';
  const clock = `${when}已用${timing.elapsedAfter}/${CHAPTER_TIME_LIMIT}分钟，距封锁${timing.remainingAfter}分钟。`;
  if (timing.reachesDeadline) return `${clock}本方案将赶上封锁，任务会失败。`;
  if (timing.extracting) return clock;
  return clock + (timing.canWithdrawAfter
    ? `普通撤离另需${EXTRACTION_MINUTES}分钟，必须在封锁前完成。`
    : `普通撤离另需${EXTRACTION_MINUTES}分钟，已来不及在封锁前完成。`);
};

export const getMissionWithdrawalNotice = (stats: GameStats): { text: string; urgent: boolean } | null => {
  if (!stats.mission?.started || stats.isGameOver || stats.chapterId === 'sihang') return null;
  const remaining = Math.max(0, CHAPTER_TIME_LIMIT - stats.mission.elapsedMinutes);
  if (remaining <= EXTRACTION_MINUTES) return { urgent: true,
    text: `距封锁仅${remaining}分钟；普通撤离需${EXTRACTION_MINUTES}分钟，已来不及在封锁前完成。` };
  if (missionGoalMet(stats)) return { urgent: remaining <= 40,
    text: `人数目标已达成，小队仍须组织撤离；普通撤离需${EXTRACTION_MINUTES}分钟。` };
  if (remaining <= 40) return { urgent: true,
    text: `人数目标尚未达成，还须为普通撤离预留${EXTRACTION_MINUTES}分钟。` };
  return null;
};
