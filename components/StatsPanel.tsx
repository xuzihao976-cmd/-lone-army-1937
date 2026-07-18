
import React from 'react';
import { GameStats } from '../types';

interface StatsPanelProps {
  stats: GameStats;
  enemyIntel?: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats, enemyIntel }) => {
  const currentDate = 26 + stats.day;
  
  // Calculate total force
  const activeHmgCount = stats.hmgSquads ? stats.hmgSquads.reduce((acc, s) => acc + (s.status === 'active' ? s.count : 0), 0) : 0;
  const totalLiving = stats.soldiers + stats.wounded + activeHmgCount;
  
  // Siege Meter Color
  const siegePercent = stats.siegeMeter || 0;
  let siegeColor = 'bg-neutral-600';
  if (siegePercent > 80) siegeColor = 'bg-red-600 animate-pulse';
  else if (siegePercent > 50) siegeColor = 'bg-orange-500';
  else if (siegePercent > 20) siegeColor = 'bg-yellow-600';

  // Helper to map location to short code
  const getLocCode = (loc: string) => {
      if (loc.includes('一楼')) return '1F';
      if (loc.includes('二楼')) return '2F';
      if (loc.includes('屋顶')) return 'RF';
      if (loc.includes('地下')) return 'B1';
      return '??';
  };

  return (
    <div className="bg-black border-b border-neutral-800 shadow-2xl sticky top-0 z-30">
      <div className="max-w-4xl mx-auto flex flex-col">
        
        {/* Row 1: Intel & Siege (Merged) */}
        <div className="flex border-b border-neutral-800 h-7">
            {/* Intel Ticker */}
            <div className="w-[60%] bg-red-900/10 flex items-center px-2 gap-2 overflow-hidden relative border-r border-neutral-800">
                <span className="text-[9px] font-bold text-red-700 whitespace-nowrap uppercase tracking-widest animate-pulse shrink-0">
                    ⚠ 敌情
                </span>
                <div className="mask-gradient-right overflow-hidden w-full">
                    <span className="text-[10px] text-red-400/90 font-mono whitespace-nowrap animate-marquee inline-block">
                        {enemyIntel || "通讯中断..."}
                    </span>
                </div>
            </div>
            
            {/* Siege Meter - Expanded to fill */}
            <div className="flex-1 bg-black flex items-center px-2 gap-2 justify-between min-w-0" title="威胁值：满条时日军将发动进攻。进行耗时行动会增加此值。">
                <span className="text-[9px] font-bold text-neutral-500 whitespace-nowrap shrink-0">
                    威胁值
                </span>
                <div className="flex-1 h-2 bg-neutral-900 rounded-full overflow-hidden mx-1 border border-neutral-800">
                    <div 
                        className={`h-full transition-all duration-700 ease-out ${siegeColor}`} 
                        style={{ width: `${siegePercent}%` }}
                    ></div>
                </div>
                <span className="text-[9px] font-mono text-neutral-600 w-6 text-right">{siegePercent}%</span>
            </div>
        </div>

        {/* Row 2: Vitals (Time, Location, Flag) */}
        <div className="flex items-stretch bg-[#0a0a0a] border-b border-neutral-800 h-10">
            
            {/* Time/Date Block */}
            <div className="flex flex-col justify-center px-2 border-r border-neutral-800 min-w-[70px] bg-[#111]" title="坚持到第6天即可获胜。">
                <div className="flex items-baseline gap-1 leading-none mb-1">
                    <span className="text-xs text-neutral-200 font-bold font-serif">{currentDate}日</span>
                    <span className="text-[8px] text-red-800 font-bold">D{stats.day}</span>
                </div>
                <span className="text-sm text-amber-500 font-mono font-bold tracking-widest leading-none">
                    {stats.currentTime}
                </span>
            </div>

            {/* Location & Flag Block */}
            <div className="flex-1 flex items-center justify-between px-3 border-r border-neutral-800 min-w-0">
                 <div className="flex flex-col justify-center min-w-0">
                    <div className="text-[8px] text-neutral-600 tracking-wider uppercase truncate">Current Pos</div>
                    <div className="text-xs sm:text-sm text-amber-500/90 font-bold font-serif tracking-widest truncate">
                        {stats.location}
                    </div>
                 </div>
                 
                 {/* Flag Status - Enhanced Visibility */}
                 <div className="flex flex-col items-end justify-center pl-2 shrink-0" title="升旗可大幅提升士气，但会招致日军轰炸。">
                    <span className="text-[8px] text-neutral-500 mb-0.5 scale-90 origin-right">国旗状态</span>
                    {stats.hasFlagRaised ? (
                        <div className="flex items-center gap-1 text-red-500 font-bold text-[10px] border border-red-900/50 px-2 py-0.5 bg-red-900/20 shadow-[0_0_8px_rgba(220,38,38,0.5)] rounded-sm">
                            <span className="animate-pulse">⚑</span> 飘扬
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 text-neutral-200 font-bold text-[10px] border border-neutral-600 px-2 py-0.5 bg-neutral-800/80 shadow-[0_0_5px_rgba(255,255,255,0.1)] rounded-sm">
                             <span className="text-neutral-400">⚑</span> 暂未升起
                        </div>
                    )}
                 </div>
            </div>

            {/* Soldiers/Morale (Horizontal Layout) */}
            <div className="flex items-center px-1 gap-1 bg-[#050505]">
                <div className="flex flex-col items-center w-10" title="剩余战斗人员。低于20人游戏失败。">
                    <span className="text-[8px] text-neutral-500">兵力</span>
                    <span className={`text-xs font-bold font-mono ${totalLiving < 100 ? 'text-red-500' : 'text-neutral-300'}`}>{totalLiving}</span>
                </div>
                <div className="w-px h-6 bg-neutral-800"></div>
                <div className="flex flex-col items-center w-10" title="等待救治的伤员。如不及时救治会阵亡。">
                    <span className="text-[8px] text-neutral-500">伤员</span>
                    <span className={`text-xs font-bold font-mono ${stats.wounded > 0 ? 'text-orange-500' : 'text-neutral-500'}`}>{stats.wounded}</span>
                </div>
                <div className="w-px h-6 bg-neutral-800"></div>
                <div className="flex flex-col items-center w-10" title="士气影响战斗力。过低会导致哗变。可以通过休息或演讲提升。">
                    <span className="text-[8px] text-neutral-500">士气</span>
                    <span className={`text-xs font-bold font-mono ${stats.morale < 30 ? 'text-red-500 animate-pulse' : 'text-neutral-300'}`}>{stats.morale}</span>
                </div>
            </div>
        </div>
        
        {/* Row 3: HMG Squads (Location Added) */}
        {stats.hmgSquads && stats.hmgSquads.length > 0 && (
            <div className="flex bg-[#0f0f0f] border-b border-neutral-800 py-1 px-1 gap-1 h-8 items-center">
                 <div className="text-[8px] text-neutral-600 font-bold uppercase tracking-widest shrink-0 w-8 text-center leading-tight">
                    核心<br/>火力
                 </div>
                 <div className="flex-1 flex gap-1">
                    {stats.hmgSquads.map((squad, idx) => (
                        <div key={idx} className={`flex-1 flex items-center justify-between px-2 rounded border text-[10px] ${squad.status === 'active' ? 'border-orange-900/30 bg-orange-900/10' : 'border-red-900/50 bg-red-900/20 grayscale'}`} title="机枪连提供强大的防御加成。">
                            <div className="flex flex-col leading-none">
                                <span className={`${squad.status === 'active' ? 'text-orange-500' : 'text-red-600 line-through'} font-bold`}>{squad.name}</span>
                                <span className="text-[8px] text-neutral-500 mt-0.5">{getLocCode(squad.location)}</span>
                            </div>
                            <span className={`font-mono font-bold text-xs ${squad.status === 'active' ? 'text-neutral-300' : 'text-red-600'}`}>
                                {squad.status === 'active' ? `${squad.count}/30` : '☠'}
                            </span>
                        </div>
                    ))}
                 </div>
            </div>
        )}

        {/* Row 4: Resources (Expanded to Fill) */}
        <div className="flex w-full bg-neutral-900 border-b border-neutral-800 py-1 px-1 gap-1 h-9 items-stretch" title="资源耗尽将导致防御力大幅下降。">
             {[
                { l: '七九弹', v: stats.ammo > 9999 ? '充足' : stats.ammo, c: stats.ammo < 5000 ? 'text-red-500 animate-pulse' : 'text-yellow-700' },
                { l: '机枪弹', v: stats.machineGunAmmo > 5000 ? '充足' : stats.machineGunAmmo, c: 'text-orange-700' },
                { l: '手榴弹', v: stats.grenades, c: 'text-neutral-300' },
                { l: '粮包', v: stats.sandbags, c: 'text-stone-500' },
                { l: '急救包', v: stats.medkits, c: stats.medkits < 10 ? 'text-red-500 animate-pulse' : 'text-green-700' }
             ].map((item, i) => (
                <div key={i} className="flex-1 bg-black px-1 sm:px-2 rounded border border-neutral-800 flex flex-col justify-center items-center gap-0.5 min-w-0">
                    <span className="text-[8px] text-neutral-500 font-bold scale-90 whitespace-nowrap">{item.l}</span>
                    <span className={`text-[10px] sm:text-xs font-bold font-mono ${item.c}`}>{item.v}</span>
                </div>
             ))}
        </div>
        
        {/* Row 5: Health Line */}
        <div className="relative h-1 bg-neutral-900 border-b border-neutral-800 w-full" title="阵地完整度。归零时游戏失败。">
            <div 
                className={`absolute left-0 top-0 h-full transition-all duration-500 ${stats.health < 30 ? 'bg-red-900' : 'bg-neutral-600'}`} 
                style={{ width: `${stats.health}%` }}
            ></div>
        </div>

      </div>
    </div>
  );
};

export default StatsPanel;
