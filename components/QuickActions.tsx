
import React from 'react';
import { GameStats } from '../types';
import { getActionPreview } from '../engine/actionPreview';

interface QuickActionsProps {
  onAction: (cmd: string) => void;
  disabled: boolean;
  stats: GameStats;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onAction, disabled, stats }) => {
  const actions = [
    { label: '🛠️ 加固', cmd: `加固${stats.location}`, color: 'border-neutral-600 text-neutral-300' },
    { label: '🔍 搜寻', cmd: '搜寻物资', color: 'border-zinc-600 text-zinc-400' },
    { label: '🚑 救治', cmd: '治疗伤员', color: 'border-green-800 text-green-500' },
    { label: '💤 休息', cmd: '休息整顿', color: 'border-blue-800 text-blue-400' },
    { label: '📣 演讲', cmd: '演讲鼓舞', color: 'border-amber-800 text-amber-500' },
    { label: '👀 侦察', cmd: '侦察敌情', color: 'border-cyan-900 text-cyan-500' },
    { label: '🌙 夜袭', cmd: '火力突袭', color: 'border-purple-900 text-purple-400' }, 
  ];

  return (
    <div className="grid grid-flow-col auto-cols-[88px] gap-1 overflow-x-auto px-1 pb-2 sm:grid-flow-row sm:grid-cols-7 sm:overflow-visible no-scrollbar">
      {actions.map((act) => {
        const preview = getActionPreview(stats, act.cmd);
        const unavailable = preview && !preview.available;
        return (
        <button
            key={act.label}
            onClick={() => onAction(act.cmd)}
            disabled={disabled || !!unavailable}
            title={preview?.reason}
            className={`min-w-0 flex flex-col items-center justify-center whitespace-nowrap px-1 py-1.5 rounded border bg-neutral-900/80 hover:bg-neutral-800 font-mono transition-colors active:scale-95 disabled:opacity-35 shadow-sm ${act.color}`}
        >
            <span className="text-[10px] sm:text-xs">{act.label}</span>
            <span className="mt-0.5 text-[8px] text-neutral-600">{preview?.short}</span>
        </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
