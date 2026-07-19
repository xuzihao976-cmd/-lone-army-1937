
import React from 'react';
import { GameStats } from '../types';
import { getActionPreview } from '../engine/actionPreview';

interface QuickActionsProps {
  onAction: (cmd: string) => void;
  disabled: boolean;
  stats: GameStats;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onAction, disabled, stats }) => {
  const fortifyCommand = stats.tutorialStep === 1 ? '加固一楼入口' : `加固${stats.location}`;
  const actions = [
    { label: '🛠️ 加固', cmd: fortifyCommand, color: 'border-neutral-600 text-neutral-300' },
    { label: '🔍 搜寻', cmd: '搜寻物资', color: 'border-zinc-600 text-zinc-400' },
    { label: '🚑 救治', cmd: '治疗伤员', color: 'border-green-800 text-green-500' },
    { label: '💤 休息', cmd: '休息整顿', color: 'border-blue-800 text-blue-400' },
    { label: '📣 演讲', cmd: '演讲鼓舞', color: 'border-amber-800 text-amber-500' },
    { label: '👀 侦察', cmd: '侦察敌情', color: 'border-cyan-900 text-cyan-500' },
    { label: '🌙 夜袭', cmd: '火力突袭', color: 'border-purple-900 text-purple-400' }, 
  ];
  const tutorialCommand = stats.tutorialStep === 1
    ? '加固一楼入口'
    : stats.tutorialStep === 2
      ? '休息整顿'
      : null;
  const orderedActions = tutorialCommand
    ? [...actions].sort((a, b) => Number(b.cmd === tutorialCommand) - Number(a.cmd === tutorialCommand))
    : actions;

  return (
    <div className="grid grid-flow-col auto-cols-[116px] gap-2 overflow-x-auto px-1 pb-2 sm:grid-flow-row sm:grid-cols-7 sm:overflow-visible no-scrollbar" aria-label="常用命令">
      {orderedActions.map((act) => {
        const preview = getActionPreview(stats, act.cmd);
        const unavailable = preview && !preview.available;
        const isTutorialTarget = tutorialCommand === act.cmd;
        const tutorialBlocked = tutorialCommand !== null && !isTutorialTarget;
        return (
        <button
            key={act.label}
            onClick={() => onAction(act.cmd)}
            disabled={disabled || !!unavailable || tutorialBlocked}
            title={preview?.reason}
            aria-current={isTutorialTarget ? 'step' : undefined}
            className={`min-w-0 flex min-h-[54px] flex-col items-center justify-center whitespace-nowrap rounded-md border bg-neutral-900/90 px-2 py-2 font-sans transition-colors active:scale-95 disabled:opacity-25 shadow-sm ${act.color} ${isTutorialTarget ? 'animate-pulse border-amber-400 bg-amber-950/40 ring-2 ring-amber-500/40' : ''}`}
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
