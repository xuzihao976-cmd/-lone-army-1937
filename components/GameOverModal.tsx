
import React from 'react';
import { GameStats, EndingType } from '../types';
import { getChapter, isShortChapter } from '../data/chapters';

interface GameOverModalProps {
  stats: GameStats;
  onRestart: () => void;
  onExit: () => void;
  onReview: () => void;
  onNext?: () => void;
}

const GameOverModal: React.FC<GameOverModalProps> = ({ stats, onRestart, onExit, onReview, onNext }) => {
  const endingType = stats.gameResult as EndingType;
  
  // Define Visuals based on Ending Type
  let borderColor = 'border-neutral-700';
  let bgColor = 'bg-neutral-900/10';
  let titleColor = 'text-neutral-500';
  let icon = '🏁';
  let mainTitle = '战斗结束';
  let subTitle = 'GAME OVER';

  switch (endingType) {
      case 'victory_evacuation': case 'victory_cover':
          borderColor = 'border-amber-700'; titleColor = 'text-amber-300';
          bgColor = 'bg-amber-950/20'; icon = endingType === 'victory_evacuation' ? '🕯' : '🌉';
          mainTitle = endingType === 'victory_evacuation' ? '撤收完成' : '掩护完成';
          subTitle = '任务完成 · 小队已撤出';
          break;
      case 'defeat_mission':
          borderColor = 'border-red-900'; titleColor = 'text-red-300';
          mainTitle = '任务未竟'; subTitle = stats.finalRank ?? '本章结束';
          break;
      case 'victory_hold':
          borderColor = 'border-yellow-600';
          bgColor = 'bg-yellow-900/10';
          titleColor = 'text-yellow-500';
          icon = '🎖️';
          mainTitle = '四行孤军';
          subTitle = '任务到期 · DEFENSE COMPLETE';
          break;
      case 'victory_retreat':
          borderColor = 'border-blue-700';
          bgColor = 'bg-blue-900/10';
          titleColor = 'text-blue-400';
          icon = '🌉';
          mainTitle = '孤军撤退';
          subTitle = '奉命撤离 · ORDERED WITHDRAWAL';
          break;
      case 'defeat_martyr':
          borderColor = 'border-red-600';
          bgColor = 'bg-red-900/20';
          titleColor = 'text-red-500';
          icon = '🇹🇼';
          mainTitle = '血染孤旗';
          subTitle = '孤旗为证 · NO COMBAT FORCE';
          break;
      case 'defeat_assault':
          borderColor = 'border-orange-700';
          bgColor = 'bg-orange-900/10';
          titleColor = 'text-orange-500';
          icon = '⚔️';
          mainTitle = '反攻失败';
          subTitle = '反攻的代价 · ASSAULT FAILED';
          break;
      case 'defeat_deserter':
          borderColor = 'border-neutral-500';
          bgColor = 'bg-gray-900/50';
          titleColor = 'text-gray-400';
          icon = '🏳️';
          mainTitle = '提前撤离';
          subTitle = '防务未竟 · EARLY WITHDRAWAL';
          break;
      case 'defeat_commander':
          borderColor = 'border-stone-500';
          bgColor = 'bg-stone-900/30';
          titleColor = 'text-stone-300';
          icon = '✦';
          mainTitle = '将星陨落';
          subTitle = '指挥链中断 · COMMANDER FALLEN';
          break;
      default: // Generic Defeat
          borderColor = 'border-red-900';
          bgColor = 'bg-red-900/10';
          titleColor = 'text-red-500';
          if (stats.gameOverReason === 'position_collapsed') {
              icon = '🏚️';
              mainTitle = '阵地失守';
              subTitle = '仓库防线被突破 · POSITION LOST';
          } else if (stats.gameOverReason === 'combat_force_collapsed') {
              icon = '🕯️';
              mainTitle = '防线崩溃';
              subTitle = '可战力量不足 · FORCE COLLAPSED';
          } else {
              icon = '🔥';
              mainTitle = '四行失守';
              subTitle = '兵力与阵地同时崩溃 · TOTAL COLLAPSE';
          }
  }

  // Calculate Total Survivors (Infantry + Wounded + HMG Squads)
  const hmgSurvivors = stats.hmgSquads ? stats.hmgSquads.reduce((acc, s) => acc + (s.status === 'active' ? s.count : 0), 0) : 0;
  const totalSurvivors = stats.soldiers + stats.wounded + hmgSurvivors;
  const combatReady = stats.soldiers + hmgSurvivors;
  const reasonLabels = {
    combat_force_collapsed: '可战兵力不足20人',
    position_collapsed: '一楼、二楼与地下室全部失守',
    total_collapse: '兵力与阵地同时崩溃',
    commander_killed: '指挥官在所在防区遭袭阵亡',
    early_retreat: '战斗初期擅自撤离',
    historical_retreat: '奉命撤入公共租界',
    mission_complete: '坚守至第六天，任务完成',
    chapter_complete: '人数目标达成，小队已及时撤出',
    chapter_failed: stats.finalRank ?? '本章未完成目标',
  } as const;
  
  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-lg flex items-center justify-center p-6 animate-fade-in">
      <div className={`max-h-[92dvh] w-full max-w-md overflow-y-auto border-2 rounded-lg p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center relative flex flex-col gap-4 ${borderColor} ${bgColor}`}>
        
        {/* Background Effect */}
        <div className={`absolute inset-0 opacity-5 pointer-events-none ${borderColor.replace('border', 'bg')}`}></div>

        <div className="text-6xl mb-2 filter drop-shadow-lg animate-bounce-slow">
            {icon}
        </div>

        {stats.campaignHistory.length > 0 && (
          <div className="max-h-36 overflow-y-auto rounded border border-white/10 bg-black/40 p-3 text-left custom-scrollbar">
            <div className="mb-2 text-xs font-black tracking-wider text-neutral-300">关键行动时间线</div>
            {stats.campaignHistory.slice(-6).map((entry) => (
              <div key={entry.id} className="mb-2 border-l border-neutral-700 pl-2 text-[11px] last:mb-0">
                <span className="font-mono text-neutral-500">D{entry.day} {entry.time}</span>{' '}
                <span className={entry.tone === 'good' ? 'font-bold text-green-400' : entry.tone === 'bad' ? 'font-bold text-red-400' : 'font-bold text-amber-300'}>{entry.title}</span>
                <div className="text-neutral-400">{entry.detail}</div>
              </div>
            ))}
          </div>
        )}
        
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
            <div className="text-neutral-500 text-right text-xs">记录存活</div>
            <div className="text-white font-bold">{totalSurvivors} 人</div>

            <div className="text-neutral-500 text-right text-xs">可战人员</div>
            <div className="text-white font-bold">{combatReady} 人</div>
            
            <div className="text-neutral-500 text-right text-xs">{isShortChapter(stats) ? '任务用时' : '坚守时长'}</div>
            <div className="text-white font-bold">{stats.mission ? `${stats.mission.elapsedMinutes}分钟` : `第${stats.day}天 ${stats.currentTime}`}</div>

            {stats.mission && <>
              <div className="text-neutral-400 text-right text-xs">{stats.chapterId === 'street' ? '民众安全抵达' : '友军已过桥'}</div>
              <div className="text-amber-300 font-bold">{stats.chapterId === 'street' ? `${stats.mission.evacuated}/12人` : `${stats.mission.crossed}/60人`}</div>
            </>}

            <div className="text-neutral-500 text-right text-xs">结束原因</div>
            <div className="text-red-400 font-bold">{stats.gameOverReason ? reasonLabels[stats.gameOverReason] : '战役结算'}</div>

            <div className="text-neutral-500 text-right text-xs">本局评价</div>
            <div className={`font-bold ${titleColor}`}>{stats.finalRank || '无名英雄'}</div>

            <div className="text-neutral-500 text-right text-xs">击毙日军</div>
            <div className="text-red-500 font-bold">{stats.enemiesKilled || 0} 人</div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3 mt-4 z-10">
            {onNext && stats.gameResult.startsWith('victory_') && <button type="button" onClick={onNext}
              className="w-full rounded border border-amber-700 bg-amber-950/40 py-3 font-bold text-amber-200">
              前往下一章 · {getChapter(getChapter(stats.chapterId).next).title}
            </button>}
            <button 
                onClick={onReview}
                className="w-full py-3 bg-neutral-100 hover:bg-white text-black font-bold tracking-widest rounded shadow-lg transition-transform active:scale-95"
            >
                返回战场复盘
            </button>
            <button
                onClick={onRestart}
                className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold tracking-widest rounded border border-neutral-700 transition-transform active:scale-95"
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
