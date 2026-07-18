
import React from 'react';
import { GameStats } from '../types';

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

  // Split into two rows to ensure a balanced, filled layout
  const row1 = actions.slice(0, 4);
  const row2 = actions.slice(4);

  const ButtonGroup = ({ items }: { items: typeof actions }) => (
    <div className="flex gap-1 w-full">
      {items.map((act) => (
        <button
            key={act.label}
            onClick={() => onAction(act.cmd)}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center whitespace-nowrap px-1 py-2.5 rounded border bg-neutral-900/80 hover:bg-neutral-800 text-[10px] sm:text-xs font-mono transition-colors active:scale-95 disabled:opacity-50 shadow-sm ${act.color}`}
        >
            {act.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-1 w-full px-1 pb-2">
      <ButtonGroup items={row1} />
      <ButtonGroup items={row2} />
    </div>
  );
};

export default QuickActions;
