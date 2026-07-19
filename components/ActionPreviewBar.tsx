import React from 'react';
import type { ActionPreview } from '../types';

const riskColor: Record<ActionPreview['risk'], string> = {
  safe: 'text-green-600 border-green-950/60',
  low: 'text-lime-600 border-lime-950/60',
  medium: 'text-amber-500 border-amber-950/70',
  high: 'text-orange-500 border-orange-950/70',
  critical: 'text-red-500 border-red-900/70',
};

const ActionPreviewBar: React.FC<{ preview: ActionPreview | null }> = ({ preview }) => {
  if (!preview) return null;

  return (
    <div className={`flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 rounded border bg-black/50 px-2 py-1 text-[9px] font-mono ${preview.available ? riskColor[preview.risk] : 'border-neutral-800 text-neutral-600'}`}>
      <span className="font-bold text-neutral-300">{preview.action}</span>
      <span>{preview.durationLabel}</span>
      <span>威胁 {preview.threatIncrease ? `+${preview.threatIncrease}` : '不变'} → {preview.predictedThreat}%</span>
      <span className="font-bold">{preview.available ? preview.riskLabel : '不可执行'}</span>
      {preview.costs.length > 0 && <span>消耗：{preview.costs.join('、')}</span>}
      {preview.reason && <span className="basis-full truncate text-neutral-600" title={preview.reason}>{preview.reason}</span>}
    </div>
  );
};

export default ActionPreviewBar;
