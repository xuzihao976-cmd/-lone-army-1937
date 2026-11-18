import React from 'react';
import BattleOverview from './BattleOverview';
import type { GameStats } from '../types';
import { CHAPTER_TIME_LIMIT, getChapter } from '../data/chapters';
import { getMissionPlan, getMissionPreview } from '../engine/chapterEngine';
import { getMissionWithdrawalNotice, formatMissionTiming } from '../engine/chapterGuidance';
import { innerRoadBlocked } from '../engine/eventContext';

export function ChapterMissionPanel({ stats }: { stats: GameStats }) {
  const mission = stats.mission!;
  const chapter = getChapter(stats.chapterId);
  const remaining = Math.max(0, CHAPTER_TIME_LIMIT - mission.elapsedMinutes);
  const notice = getMissionWithdrawalNotice(stats);
  return <BattleOverview label="本章任务总览" summary={<>
    <span>{stats.chapterId === 'street' ? `已送达 ${mission.evacuated}人` : `已过桥 ${mission.crossed}/60`}</span>
    <span className={remaining <= 40 ? 'state-warning' : ''}>距封锁 {remaining}分钟</span>
  </>} notice={notice && <p role="status" className={`mission-notice ${notice.urgent ? 'state-warning' : ''}`}>{notice.text}</p>}>
    <dl className="battle-metrics">
      {([['可战', stats.soldiers], ['伤员', stats.wounded], ['七九弹', stats.ammo], ['急救包', stats.medkits]] as const).map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="mission-progress">
      <span>{stats.chapterId === 'street' ? `找到 ${mission.found}/12 · 安全抵达 ${mission.evacuated}/12` : `友军过桥 ${mission.crossed}/60 · 掩体 ${mission.cover}/3`}</span>
      <strong className={remaining <= 40 ? 'state-warning' : ''}>距封锁 {remaining}分钟</strong>
    </div>
    <div className="battle-readouts"><span>压力 {stats.siegeMeter}%</span><span>疲劳 {stats.fatigue}%</span></div>
    <p className="battle-intel"><b>本章任务</b><span>{chapter.objective}</span></p>
    {stats.chapterId === 'street' && <p className="mission-route">撤收线：{mission.route === 'inner' ? '内巷 · 护送25分钟' : mission.route === 'river' ? '沿河 · 护送15分钟，高暴露' : mission.recon ? '已查明，请选择内巷或沿河' : '尚待侦察'}{innerRoadBlocked(stats) ? ' · 内巷障碍未清' : ''}</p>}
  </BattleOverview>;
}

export function ChapterMissionActions({ stats, disabled, onAction, featured = false }: { stats: GameStats; disabled: boolean; featured?: boolean; onAction: (command: string) => void }) {
  const commands = stats.chapterId === 'street'
    ? ['侦察路线', '搜救街巷', '护送民众', '选择内巷', '选择沿河', ...(innerRoadBlocked(stats)?['清理内巷障碍']:[]), '轮换休息', '救治伤员', '组织撤离']
    : ['压制射击', '加固桥头', '轮换掩护', '观察桥面', '救治伤员', '组织撤离'];
  const visibleCommands = !featured ? commands : stats.chapterId === 'street'
    ? !stats.mission!.recon ? commands.slice(0, 2)
      : !stats.mission!.route ? ['选择内巷', '选择沿河']
      : stats.mission!.evacuated >= 8 ? ['组织撤离', '搜救街巷']
      : ['搜救街巷', '护送民众']
    : stats.mission!.crossed >= 60 ? ['组织撤离', '救治伤员'] : commands.slice(0, 2);
  return <div className={`order-strip chapter-orders ${featured ? 'featured-orders' : ''}`} aria-label="本关行动">
    {visibleCommands.map(command => {
      const plan = getMissionPlan(stats, command)!;
      const preview = getMissionPreview(stats, command)!;
      const warning = plan.available && (preview.risk === 'critical' || preview.risk === 'high') ? preview.riskLabel : null;
      return <button key={command} type="button" disabled={disabled || !plan.available}
        onClick={() => onAction(command)} title={plan.reason + (preview.missionTiming ? '\n' + formatMissionTiming(preview.missionTiming) : '')}
        className={`order-button text-xs ${command === '组织撤离' ? 'withdraw-order' : ''}`}>
        <b className="block">{command}</b><span className="mt-1 block text-[11px] text-neutral-400">{plan.available ? command === '组织撤离' ? `先确认 · 再耗时${plan.minutes}分` : `${preview.durationLabel}${command === '压制射击' ? ' · 30弹' : command === '加固桥头' ? ' · 40料' : ''}` : plan.reason}</span>
        {warning && <span className={`mt-1 block text-[11px] leading-4 ${preview.risk === 'critical' ? 'text-red-300' : 'text-orange-300'}`}>{warning}</span>}
      </button>;
    })}
  </div>;
}
