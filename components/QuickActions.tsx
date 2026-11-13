
import React from 'react';
import { GameStats } from '../types';
import { getActionPreview } from '../engine/actionPreview';
import OrderIcon from './OrderIcon';

interface QuickActionsProps {
  onAction: (cmd: string) => void;
  disabled: boolean;
  stats: GameStats;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onAction, disabled, stats }) => {
  const fortifyCommand = stats.tutorialStep === 1 ? '加固一楼入口' : `加固${stats.location}`;
  const actions = [
    { label: '加固', cmd: fortifyCommand, icon: 'fortify' },
    { label: '搜寻', cmd: '搜寻物资', icon: 'search' },
    { label: '救治', cmd: '治疗伤员', icon: 'aid' },
    { label: '休息', cmd: '休息整顿', icon: 'rest' },
    { label: '演讲', cmd: '演讲鼓舞', icon: 'speech' },
    { label: '侦察', cmd: '侦察敌情', icon: 'recon' },
    { label: '夜袭', cmd: '火力突袭', icon: 'raid' },
  ] as const;
  const tutorialCommand = stats.tutorialStep === 1
    ? '加固一楼入口'
    : stats.tutorialStep === 2
      ? '休息整顿'
      : null;
  const orderedActions = tutorialCommand
    ? [...actions].sort((a, b) => Number(b.cmd === tutorialCommand) - Number(a.cmd === tutorialCommand))
    : actions;

  return (
    <div className="order-strip" aria-label="常用命令">
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
            className="order-button"
        >
            <span className="order-label"><OrderIcon name={act.icon} />{act.label}</span>
            <span className="order-caption">{preview?.short}</span>
        </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
