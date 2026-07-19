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
      className="rounded-md border border-amber-700/70 bg-amber-950/20 px-3 py-2.5 shadow-[0_0_18px_rgba(180,83,9,0.12)]"
      aria-label={`新手引导第 ${stats.tutorialStep} 步，共 2 步`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black tracking-wider text-amber-300">新手引导</span>
          <span className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-[11px] font-black text-amber-100">
            {stats.tutorialStep}/2
          </span>
        </div>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="text-[11px] font-bold text-neutral-400 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-200 disabled:opacity-40"
        >
          跳过教程
        </button>
      </div>

      <div className="mt-2 flex gap-1" aria-hidden="true">
        <div className="h-1.5 flex-1 rounded-full bg-amber-500" />
        <div className={`h-1.5 flex-1 rounded-full ${isFortifyStep ? 'bg-neutral-700' : 'bg-amber-500'}`} />
      </div>

      <div className="mt-2">
        <div className="text-sm font-black text-neutral-100">
          {isFortifyStep ? '先加固一楼入口' : '让守军轮换休息'}
        </div>
        <p className="mt-0.5 text-xs leading-5 text-neutral-300">
          {isFortifyStep
            ? '工事会直接提高实际减伤。点击下方发光的「加固」命令。'
            : '休息可恢复士气并结束序章。点击下方发光的「休息」命令。'}
        </p>
      </div>
    </section>
  );
};

export default TutorialGuide;
