
import React from 'react';
import { GameStats, EndingType } from '../types';

interface GameOverModalProps {
  stats: GameStats;
  onRestart: () => void;
  onExit: () => void;
}

const GameOverModal: React.FC<GameOverModalProps> = ({ stats, onRestart, onExit }) => {
  const endingType = stats.gameResult as EndingType;
  
  // Define Visuals based on Ending Type
  let borderColor = 'border-neutral-700';
  let bgColor = 'bg-neutral-900/10';
  let titleColor = 'text-neutral-500';
  let icon = '🏁';
  let mainTitle = '战斗结束';
  let subTitle = 'GAME OVER';

  switch (endingType) {
      case 'victory_hold':
          borderColor = 'border-yellow-600';
          bgColor = 'bg-yellow-900/10';
          titleColor = 'text-yellow-500';
          icon = '🎖️';
          mainTitle = '四行孤军';
          subTitle = '永垂不朽 · GLORY TO HEROES';
          break;
      case 'victory_retreat':
          borderColor = 'border-blue-700';
          bgColor = 'bg-blue-900/10';
          titleColor = 'text-blue-400';
          icon = '🌉';
          mainTitle = '孤军撤退';
          subTitle = '保存火种 · STRATEGIC WITHDRAWAL';
          break;
      case 'defeat_martyr':
          borderColor = 'border-red-600';
          bgColor = 'bg-red-900/20';
          titleColor = 'text-red-500';
          icon = '🇹🇼';
          mainTitle = '血染孤旗';
          subTitle = '浩气长存 · ETERNAL GLORY';
          break;
      case 'defeat_assault':
          borderColor = 'border-orange-700';
          bgColor = 'bg-orange-900/10';
          titleColor = 'text-orange-500';
          icon = '⚔️';
          mainTitle = '全军覆没';
          subTitle = '血色冲锋 · LAST STAND';
          break;
      case 'defeat_deserter':
          borderColor = 'border-neutral-500';
          bgColor = 'bg-gray-900/50';
          titleColor = 'text-gray-400';
          icon = '🏳️';
          mainTitle = '懦夫结局';
          subTitle = '遗臭万年 · DESERTER';
          break;
      default: // Generic Defeat
          borderColor = 'border-red-900';
          bgColor = 'bg-red-900/10';
          titleColor = 'text-red-500';
          icon = '🕯️';
          mainTitle = '壮烈殉国';
          subTitle = '魂归中华 · MISSION FAILED';
  }

  // Calculate Total Survivors (Infantry + Wounded + HMG Squads)
  const hmgSurvivors = stats.hmgSquads ? stats.hmgSquads.reduce((acc, s) => acc + (s.status === 'active' ? s.count : 0), 0) : 0;
  const totalSurvivors = stats.soldiers + stats.wounded + hmgSurvivors;
  
  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-lg flex items-center justify-center p-6 animate-fade-in">
      <div className={`w-full max-w-md border-2 rounded-lg p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center relative overflow-hidden flex flex-col gap-4 ${borderColor} ${bgColor}`}>
        
        {/* Background Effect */}
        <div className={`absolute inset-0 opacity-5 pointer-events-none ${borderColor.replace('border', 'bg')}`}></div>

        <div className="text-6xl mb-2 filter drop-shadow-lg animate-bounce-slow">
            {icon}
        </div>
        
        <div>
            <h2 className={`text-3xl font-bold font-serif tracking-[0.2em] mb-1 ${titleColor}`}>
                {mainTitle}
            </h2>
            <div className="text-sm font-mono text-neutral-400 uppercase tracking-widest border-t border-white/10 pt-2 inline-block px-4">
                {subTitle}
            </div>
        </div>
        
        {/* Stats Grid */}
        <div className="bg-black/50 p-4 rounded border border-white/10 grid grid-cols-2 gap-y-3 gap-x-6 text-sm font-mono text-left mt-2">
            <div className="text-neutral-500 text-right text-xs">最终存活</div>
            <div className="text-white font-bold">{totalSurvivors} 人</div>
            
            <div className="text-neutral-500 text-right text-xs">坚守时长</div>
            <div className="text-white font-bold">{stats.day} 天</div>

            <div className="text-neutral-500 text-right text-xs">历史评价</div>
            <div className={`font-bold ${titleColor}`}>{stats.finalRank || '无名英雄'}</div>

            <div className="text-neutral-500 text-right text-xs">击毙日军</div>
            <div className="text-red-500 font-bold">{stats.enemiesKilled || 0} 人</div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3 mt-4 z-10">
            <button 
                onClick={onRestart} 
                className="w-full py-3 bg-neutral-100 hover:bg-white text-black font-bold tracking-widest rounded shadow-lg transition-transform active:scale-95"
            >
                再次挑战
            </button>
            <button 
                onClick={onExit} 
                className="w-full py-3 bg-transparent border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 rounded transition-colors"
            >
                返回主菜单
            </button>
        </div>
      </div>
    </div>
  );
};

export default GameOverModal;
