
import React from 'react';
import { Dilemma, GameStats } from '../types';
import { getEvent, presentEvent } from '../engine/eventPlans';
import { getActionPreview } from '../engine/actionPreview';

interface DilemmaModalProps {
  dilemma: Dilemma;
  onChoice: (actionCmd: string) => void;
  stats: GameStats;
}

const DilemmaModal: React.FC<DilemmaModalProps> = ({ dilemma, onChoice, stats }) => {
  const event = getEvent(dilemma.id);
  const view = event ? presentEvent(stats, event) : dilemma;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dilemma-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm animate-fade-in sm:p-6">
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded border border-amber-900/50 bg-[#1a1a1a] shadow-[0_0_30px_rgba(251,191,36,0.1)] custom-scrollbar">
        
        {/* Urgent Header */}
        <div className="flex items-start gap-3 border-b border-amber-900/30 bg-amber-900/20 p-4">
            <span className="shrink-0 text-2xl animate-pulse">⚠️</span>
            <h3 id="dilemma-title" className="min-w-0 break-words font-serif text-base font-bold tracking-wider text-amber-500 sm:text-lg sm:tracking-widest">
                {event ? '待处置：' : '待确认：'} {view.title}
            </h3>
        </div>

        {/* Content */}
        <div className="break-words border-b border-neutral-800 p-4 font-serif text-sm leading-relaxed text-neutral-300 sm:p-6 sm:text-base">
            {view.description}
        </div>

        {/* Options */}
        <div className="p-4 bg-[#111] space-y-3">
            {view.options.map((opt, idx) => (
                <button
                    key={idx}
                    onClick={() => onChoice(opt.actionCmd)}
                    disabled={opt.available === false}
                    className="group min-w-0 w-full rounded border border-neutral-700 bg-neutral-800 p-3 text-left transition-all hover:border-neutral-500 hover:bg-neutral-700 disabled:opacity-50 sm:p-4"
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
                    {event && opt.available !== false && (() => { const preview = getActionPreview(stats, opt.actionCmd); return preview?.attackChance === 1
                      ? <p className="mt-1 text-xs font-bold text-orange-300">本次行动将接敌。</p> : null; })()}
                </button>
            ))}
        </div>
        
        <div className="bg-black py-2 text-center text-xs font-mono text-neutral-400 uppercase">
            AWAITING ORDERS /// FIELD COMMAND
        </div>
      </div>
    </div>
  );
};

export default DilemmaModal;
