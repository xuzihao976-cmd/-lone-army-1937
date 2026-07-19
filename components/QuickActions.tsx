
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
    <div className="grid grid-flow-col auto-cols-[116px] gap-2 overflow-x-auto px-1 pb-2 sm:grid-flow-row sm:grid-cols-7 sm:overflow-visible no-scrollbar" aria-label="常用命令">
      {actions.map((act) => {
        const preview = getActionPreview(stats, act.cmd);
        const unavailable = preview && !preview.available;
        return (
        <button
            key={act.label}
            onClick={() => onAction(act.cmd)}
            disabled={disabled || !!unavailable}
            title={preview?.reason}
            className={`min-w-0 flex min-h-[54px] flex-col items-center justify-center whitespace-nowrap rounded-md border bg-neutral-900/90 px-2 py-2 font-sans transition-colors active:scale-95 disabled:opacity-35 shadow-sm ${act.color}`}
        >
            <span className="text-[13px] font-black">{act.label}</span>
            <span className="mt-1 text-[11px] font-medium text-neutral-400">{preview?.short}</span>
        </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
