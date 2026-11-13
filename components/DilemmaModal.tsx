
import React from 'react';
import { Dilemma, GameStats } from '../types';
import { getEvent, presentEvent } from '../engine/eventPlans';
import { getActionPreview } from '../engine/actionPreview';
import { advanceCampaignClock } from '../engine/time';

interface DilemmaModalProps {
  dilemma: Dilemma;
  onChoice: (actionCmd: string) => void;
  stats: GameStats;
  onSaveExit: () => void;
}

const DilemmaModal: React.FC<DilemmaModalProps> = ({ dilemma, onChoice, stats, onSaveExit }) => {
  const event = getEvent(dilemma.id);
  const view = event ? presentEvent(stats, event) : dilemma;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dilemma-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm animate-fade-in sm:p-6">
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-sm border border-neutral-600 bg-neutral-950 shadow-2xl custom-scrollbar">
        
        {/* Urgent Header */}
        <div className="flex items-start gap-3 border-b border-neutral-700 bg-neutral-900 p-4">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center border border-amber-400 font-serif text-lg text-amber-200">!</span>
            <h3 id="dilemma-title" className="min-w-0 break-words font-serif text-lg font-bold tracking-wider text-amber-100">
                {event ? '待处置：' : '待确认：'} {view.title}
            </h3>
        </div>

        {event && <p className="border-b border-neutral-800 px-4 py-3 text-xs leading-5 text-neutral-400">
          {stats.mission?`已用${stats.mission.elapsedMinutes}/180分钟`:`当前第${stats.day}天`} {stats.currentTime} · 步兵{stats.soldiers}人 · 待治{stats.wounded}人<br />
          七九弹{stats.ammo}发 · 急救包{stats.medkits}份 · 材料{stats.sandbags}份
        </p>}

        {/* Content */}
        <div className="war-prose break-words border-b border-neutral-700 p-4 text-base text-neutral-200 sm:p-6">
            {view.description}
        </div>

        {/* Options */}
        <div className="p-4 bg-[#111] space-y-3">
            {view.options.map((opt, idx) => (
                <button
                    key={idx}
                    type="button"
                    onClick={() => onChoice(opt.actionCmd)}
                    disabled={opt.available === false}
                    className="group min-h-11 min-w-0 w-full rounded-sm border border-neutral-600 bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-400 hover:bg-neutral-800 disabled:border-neutral-800 disabled:bg-neutral-950 sm:p-4"
                >
                    <div className="mb-1 break-words font-bold leading-5 text-neutral-200 group-hover:text-white">
                        {String.fromCharCode(65 + idx)}. {opt.label}
                    </div>
                    {opt.riskText && (
                        <div className="break-words font-mono text-xs leading-5 text-neutral-300 group-hover:text-amber-300">
                            风险与效果： {opt.riskText}
                        </div>
                    )}
                    {opt.unavailableReason && <p className="mt-1 text-xs leading-5 text-red-300">不可执行：{opt.unavailableReason}</p>}
                    {event && opt.available !== false && (() => {
                      const preview = getActionPreview(stats, opt.actionCmd);
                      const clock = preview?.durationMinutes ? advanceCampaignClock(stats.day, stats.currentTime, preview.durationMinutes) : null;
                      return <>
                        {clock && <p className="mt-1 text-xs leading-5 text-neutral-400">拟完成：{stats.mission?`${clock.time}（已用${stats.mission.elapsedMinutes+(preview?.durationMinutes??0)}/180分钟）`:`第${clock.day}天 ${clock.time}`}</p>}
                        {preview?.attackChance === 1 && <p className="mt-1 text-xs font-bold text-orange-300">本次行动将接敌。</p>}
                      </>;
                    })()}
                </button>
            ))}
        </div>

        {event && <button onClick={onSaveExit} className="min-h-11 border-t border-neutral-800 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800">保存并返回选关</button>}
        
        <div className="border-t border-neutral-800 bg-neutral-950 py-3 text-center text-xs text-neutral-400">
            查看代价，再作决定
        </div>
      </div>
    </div>
  );
};

export default DilemmaModal;
