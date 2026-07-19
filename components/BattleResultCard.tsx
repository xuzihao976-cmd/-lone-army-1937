import React from 'react';
import type { TurnSummary } from '../types';

const formatDuration = (minutes: number) => {
  if (minutes <= 0) return '即时';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分` : `${hours} 小时`;
};

const BattleResultCard: React.FC<{ summary: TurnSummary }> = ({ summary }) => {
  const accent = summary.kind === 'battle' || summary.kind === 'ending'
    ? 'border-red-900/70 bg-red-950/15'
    : summary.kind === 'new_day'
      ? 'border-amber-900/70 bg-amber-950/10'
      : 'border-neutral-700 bg-neutral-950/60';

  return (
    <section className={`mt-3 w-full max-w-xl rounded-md border p-3.5 font-sans ${accent}`} aria-label={`${summary.title}结果`}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-2">
        <h3 className="text-sm font-black tracking-wide text-neutral-100">{summary.title}</h3>
        <span className="text-xs font-mono text-neutral-400">耗时 {formatDuration(summary.durationMinutes)}</span>
      </div>

      {summary.deltas.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {summary.deltas.map((delta) => {
            const deltaColor = delta.metric === 'wounded'
              ? delta.value > 0 ? 'text-red-500' : 'text-amber-500'
              : delta.value > 0 ? 'text-green-500' : 'text-red-500';
            return (
              <div key={delta.metric} className="flex items-center justify-between rounded border border-neutral-800 bg-black/50 px-2.5 py-2 text-xs">
                <span className="font-bold text-neutral-400">{delta.label}</span>
                <span className={`font-mono font-bold ${deltaColor}`}>
                  {delta.value > 0 ? '+' : ''}{delta.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-neutral-400">
        <span>威胁</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-900">
          <div className="h-full bg-red-700 transition-all" style={{ width: `${summary.threatAfter}%` }} />
        </div>
        <span>{summary.threatBefore}% → {summary.threatAfter}%</span>
      </div>

      {summary.notes.length > 0 && (
        <div className="mt-3 space-y-1 text-xs leading-relaxed text-neutral-400">
          {summary.notes.map((note) => <div key={note}>· {note}</div>)}
        </div>
      )}
    </section>
  );
};

export default BattleResultCard;
