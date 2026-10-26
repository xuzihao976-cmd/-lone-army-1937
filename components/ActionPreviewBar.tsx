import React from 'react';
import type { ActionPreview } from '../types';
import { formatMissionTiming } from '../engine/chapterGuidance';

const riskColor: Record<ActionPreview['risk'], string> = {
  safe: 'text-green-600 border-green-950/60',
  low: 'text-lime-600 border-lime-950/60',
  medium: 'text-amber-500 border-amber-950/70',
  high: 'text-orange-500 border-orange-950/70',
  critical: 'text-red-500 border-red-900/70',
};

const ActionPreviewBar: React.FC<{ preview: ActionPreview | null; compact?: boolean }> = ({ preview, compact = false }) => {
  if (!preview) return null;

  return (
    <div role={compact ? 'region' : undefined} aria-label={compact ? '军令预览' : undefined} tabIndex={compact ? 0 : undefined}
      className={`rounded-md border bg-black/60 px-3 py-2.5 font-sans ${compact ? 'max-h-[min(24dvh,12rem)] overflow-y-auto overscroll-contain' : ''} ${preview.available ? riskColor[preview.risk] : 'border-neutral-800 text-neutral-500'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-sm font-black text-neutral-100">{preview.action}</span>
        <span className="rounded bg-neutral-900 px-2 py-1 font-bold">耗时 {preview.durationLabel}</span>
        <span className="rounded bg-neutral-900 px-2 py-1 font-bold">敌军压力 → {preview.predictedThreat}%</span>
        {preview.projectedContactTurns !== null && (
          <span className="rounded bg-neutral-900 px-2 py-1 font-bold">
            {preview.enemyAdvanceSteps > 0 ? `敌军推进${preview.enemyAdvanceSteps}格 · ` : '敌军不推进 · '}
            接敌{preview.projectedContactTurns}回合
          </span>
        )}
        <span className="rounded bg-neutral-900 px-2 py-1 font-black">{preview.available ? preview.riskLabel : '不可执行'}</span>
        {preview.available && preview.attackChance === 1 && !preview.riskLabel.includes('接敌') &&
          <span className="rounded bg-neutral-900 px-2 py-1 font-black text-orange-300">本次行动将接敌</span>}
      </div>
      {preview.costs.length > 0 && <div className="mt-2 text-xs text-neutral-300">消耗：{preview.costs.join('、')}</div>}
      {preview.reason && <div className={`mt-1 whitespace-pre-line text-xs ${!preview.available || preview.risk === 'critical' ? 'font-bold text-red-300' : 'text-neutral-300'}`} title={preview.reason}>{preview.reason}</div>}
      {preview.missionTiming && <p className={`mt-2 text-xs leading-5 ${preview.missionTiming.reachesDeadline || !preview.missionTiming.canWithdrawAfter ? 'font-bold text-red-300' : 'text-amber-200'}`}>
        {formatMissionTiming(preview.missionTiming)}
      </p>}
    </div>
  );
};

export default ActionPreviewBar;
