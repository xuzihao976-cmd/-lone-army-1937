import type { GameStats, GameTurnResult, Location, SummaryMetric, TurnDelta, TurnSummary } from '../types';
import { getActionPreview } from './actionPreview';
import { isShortChapter } from '../data/chapters';

const METRICS: Array<{ metric: SummaryMetric; label: string }> = [
  { metric: 'soldiers', label: '步兵' },
  { metric: 'wounded', label: '伤员' },
  { metric: 'morale', label: '士气' },
  { metric: 'health', label: '总结构' },
  { metric: 'ammo', label: '七九弹' },
  { metric: 'machineGunAmmo', label: '机枪弹' },
  { metric: 'grenades', label: '手榴弹' },
  { metric: 'sandbags', label: '工事材料' },
  { metric: 'medkits', label: '急救包' },
  { metric: 'enemiesKilled', label: '毙敌' },
];

const elapsedMinutes = (before: GameStats, after: GameStats): number => {
  const [beforeHour, beforeMinute] = before.currentTime.split(':').map(Number);
  const [afterHour, afterMinute] = after.currentTime.split(':').map(Number);
  const dayDelta = Math.max(0, after.day - before.day);
  return Math.max(0, dayDelta * 1440 + afterHour * 60 + afterMinute - beforeHour * 60 - beforeMinute);
};

export const buildTurnSummary = (
  before: GameStats,
  after: GameStats,
  result: GameTurnResult,
  command: string,
): TurnSummary | undefined => {
  if (command === 'start_game') return undefined;

  const deltas: TurnDelta[] = METRICS.flatMap(({ metric, label }) => {
    const value = after[metric] - before[metric];
    return value === 0 ? [] : [{ metric, label, value }];
  });
  const durationMinutes = elapsedMinutes(before, after);
  const preview = getActionPreview(before, command);
  const meaningful = deltas.length > 0 || durationMinutes > 0 || result.eventTriggered === 'attack'
    || result.eventTriggered === 'new_day' || result.eventTriggered === 'victory' || result.eventTriggered === 'game_over';
  if (!meaningful) return undefined;

  let kind: TurnSummary['kind'] = 'action';
  let title = command.toLowerCase().startsWith('evt_resolve:') ? '事件后果'
    : command.toLowerCase().startsWith('card_resolve:') ? '战机结算'
      : preview?.action ?? '命令执行';
  const notes: string[] = [];

  if (result.eventTriggered === 'attack') {
    kind = 'battle';
    title = '敌军进攻结算';
    notes.push(isShortChapter(after) ? '小队在任务途中接敌，伤亡与弹药按实际结算' : result.attackLocation ? `交火位置：${result.attackLocation}` : '敌军对仓库发动进攻');
    if (!isShortChapter(after)) notes.push('实际减伤、本层可用火力与敌军规模共同决定伤亡');
  } else if (result.eventTriggered === 'new_day') {
    kind = 'new_day';
    title = `进入第 ${after.day} 天`;
  } else if (result.eventTriggered === 'victory' || result.eventTriggered === 'game_over') {
    kind = 'ending';
    title = result.eventTriggered === 'victory' ? '战役胜利' : '战役结束';
  }

  if (after.siegeMeter < before.siegeMeter && result.eventTriggered === 'attack') {
    notes.push('敌军发动进攻后，压力已回落');
  } else if (after.siegeMeter > before.siegeMeter) {
    notes.push(`本次行动令敌军压力上升 ${after.siegeMeter - before.siegeMeter}`);
  }

  (['屋顶', '二楼阵地', '一楼入口', '地下室'] as Location[]).forEach((location) => {
    const beforeIntegrity = before.sectorIntegrity[location] ?? 100;
    const afterIntegrity = after.sectorIntegrity[location] ?? 100;
    if (beforeIntegrity > 0 && afterIntegrity <= 0) notes.push(`${location}失守，敌军推进路线已经改变`);
    else if (beforeIntegrity <= 0 && afterIntegrity > 0) notes.push(`${location}已被反冲锋夺回（完整度${afterIntegrity}%）`);
    else if (afterIntegrity !== beforeIntegrity) notes.push(`${location}完整度 ${beforeIntegrity}% → ${afterIntegrity}%`);
  });

  if (after.gameOverReason === 'commander_killed') {
    title = '指挥官阵亡 · 战役结束';
    notes.push(`指挥官在${result.attackLocation || after.location}遭袭阵亡`);
  }
  if (isShortChapter(after) && after.mission) {
    notes.push(after.chapterId === 'street' ? `安全撤收 ${after.mission.evacuated}/12人` : `友军过桥 ${after.mission.crossed}/60人`);
    notes.push(`本章已用${after.mission.elapsedMinutes}分钟，180分钟封锁`);
  }

  return {
    kind,
    title,
    durationMinutes,
    threatBefore: before.siegeMeter,
    threatAfter: after.siegeMeter,
    deltas,
    notes,
  };
};
