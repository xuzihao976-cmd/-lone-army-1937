import React from 'react';
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
  return <header className="shrink-0 border-b border-neutral-700 bg-neutral-950 p-3 font-sans" aria-label="本章任务总览">
    <div className="flex items-center justify-between gap-2">
      <div><span className="text-[11px] text-neutral-500">第{chapter.number}章 · 虚构支线</span><h1 className="font-serif text-lg font-bold text-neutral-100">{chapter.title}</h1></div>
      <div className="text-right"><div className="text-[11px] text-neutral-400">距封锁</div><strong className={remaining <= 40 ? 'text-lg text-red-300' : 'text-lg text-amber-300'}>{remaining}分钟</strong></div>
    </div>
    <p className="mt-1 text-xs leading-5 text-neutral-300">{chapter.objective}</p>
    <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
      {[['可战', stats.soldiers], ['伤员', stats.wounded], ['七九弹', stats.ammo], ['急救包', stats.medkits]].map(([label, value]) =>
        <div key={label} className="rounded bg-neutral-900 py-1.5"><div className="text-[11px] text-neutral-400">{label}</div><b className="text-neutral-100">{value}</b></div>)}
    </div>
    <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-neutral-300">
      <span>{stats.chapterId === 'street' ? `找到${mission.found}/12 · 安全抵达${mission.evacuated}/12`
        : `友军过桥${mission.crossed}/60 · 掩体${mission.cover}/3`}</span>
      <span>压力{stats.siegeMeter} · 疲劳{stats.fatigue}</span>
    </div>
    {stats.chapterId === 'street' && <div className="mt-1 text-[11px] text-cyan-300">撤收线：{mission.route === 'inner' ? '内巷 · 护送25分钟' : mission.route === 'river' ? '沿河 · 护送15分钟，高暴露' : mission.recon ? '已查明，请选择内巷或沿河' : '尚待侦察'}{innerRoadBlocked(stats)?' · 内巷障碍未清':''}</div>}
    {notice && <p role="status" className={`mt-1 text-[11px] leading-4 ${notice.urgent ? 'text-red-300' : 'text-amber-200'}`}>{notice.text}</p>}
  </header>;
}

export function ChapterMissionActions({ stats, disabled, onAction }: { stats: GameStats; disabled: boolean; onAction: (command: string) => void }) {
  const commands = stats.chapterId === 'street'
    ? ['侦察路线', '搜救街巷', '护送民众', '选择内巷', '选择沿河', ...(innerRoadBlocked(stats)?['清理内巷障碍']:[]), '轮换休息', '救治伤员', '组织撤离']
    : ['压制射击', '加固桥头', '轮换掩护', '观察桥面', '救治伤员', '组织撤离'];
  return <div className="grid grid-flow-col auto-cols-[108px] gap-2 overflow-x-auto pb-1" aria-label="本关行动">
    {commands.map(command => {
      const plan = getMissionPlan(stats, command)!;
      const preview = getMissionPreview(stats, command)!;
      const warning = plan.available && (preview.risk === 'critical' || preview.risk === 'high') ? preview.riskLabel : null;
      const unavailable = innerRoadBlocked(stats)&&(command==='选择内巷'||command==='护送民众'&&stats.mission?.route==='inner') ? '内巷障碍未清'
        : command === '救治伤员' ? stats.wounded <= 0 ? '暂无待治伤员' : '急救包不足'
        : command === '护送民众' ? !stats.mission!.route ? '先侦察并选路线' : '暂无待护送民众'
        : command.startsWith('选择') ? '先侦察路线'
        : command === '加固桥头' ? stats.mission!.cover >= 3 ? '掩体已达上限' : '材料不足40份'
        : command === '压制射击' ? '需30发七九弹' : '已找到全部民众';
      return <button key={command} type="button" disabled={disabled || !plan.available}
        onClick={() => onAction(command)} title={plan.reason + (preview.missionTiming ? '\n' + formatMissionTiming(preview.missionTiming) : '')}
        className={`min-h-14 rounded border px-2 py-2 text-xs disabled:opacity-35 ${command === '组织撤离' ? 'border-amber-800 text-amber-200' : 'border-neutral-700 text-neutral-200'}`}>
        <b className="block">{command}</b><span className="mt-1 block text-[11px] text-neutral-400">{plan.available ? command === '组织撤离' ? `先确认 · 再耗时${plan.minutes}分` : `${preview.durationLabel}${command === '压制射击' ? ' · 30弹' : command === '加固桥头' ? ' · 40料' : ''}` : unavailable}</span>
        {warning && <span className={`mt-1 block text-[11px] leading-4 ${preview.risk === 'critical' ? 'text-red-300' : 'text-orange-300'}`}>{warning}</span>}
      </button>;
    })}
  </div>;
}
