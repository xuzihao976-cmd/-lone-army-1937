import React from 'react';
import type { GameStats } from '../types';

interface TutorialGuideProps {
  stats: GameStats;
  disabled: boolean;
  onSkip: () => void;
}

const TutorialGuide: React.FC<TutorialGuideProps> = ({ stats, disabled, onSkip }) => {
  if (stats.tutorialStep !== 1 && stats.tutorialStep !== 2) return null;

  const isFortifyStep = stats.tutorialStep === 1;

  return (
    <section
      className="tutorial-note"
      aria-label={`新手引导第 ${stats.tutorialStep} 步，共 2 步`}
    >
      <details className="min-w-0 flex-1" key={stats.tutorialStep}>
        <summary className="tutorial-summary">
          <span className="font-mono text-xs text-amber-200">{stats.tutorialStep}/2</span>
          <span>{isFortifyStep ? '先加固一楼入口' : '让守军轮换休息'}</span>
          <span className="text-xs font-normal text-neutral-400">说明</span>
        </summary>
        <p className="pb-3 text-xs leading-5 text-neutral-300">
          {isFortifyStep
            ? '工事会直接提高实际减伤。点击下方标出的「加固」命令。'
            : '休息可恢复士气并结束序章。点击下方标出的「休息」命令。'}
        </p>
      </details>
      <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="min-h-11 shrink-0 px-2 text-xs text-neutral-400 underline underline-offset-4 hover:text-neutral-200 disabled:opacity-40"
        >
          跳过教程
      </button>
    </section>
  );
};

export default TutorialGuide;
