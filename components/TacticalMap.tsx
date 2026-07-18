
import React, { useState, useEffect } from 'react';
import { GameStats, Location } from '../types';

interface TacticalMapProps {
  stats: GameStats;
  onAction?: (cmd: string) => void;
  attackLocation?: Location | null; 
}

const LOCATION_DETAILS: Record<Location, { desc: string; tactical: string }> = {
  '屋顶': {
    desc: "视野极佳，但无遮挡。防空关键，易受重炮打击。",
    tactical: "适合升旗。需防空袭。"
  },
  '二楼阵地': {
    desc: "核心防御层，混凝土墙体，理想的射击掩体。",
    tactical: "封锁桥面。主力机枪阵地。"
  },
  '一楼入口': {
    desc: "大门已封死。日军坦克和敢死队必经之路。",
    tactical: "绞肉机。需手榴弹防守。"
  },
  '地下室': {
    desc: "物资储备区与临时医院。墙壁最厚，防重炮。",
    tactical: "后勤中枢。安全区。"
  }
};

const TacticalMap: React.FC<TacticalMapProps> = ({ stats, onAction, attackLocation }) => {
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const [flashingLoc, setFlashingLoc] = useState<Location | null>(null);

  // Trigger Flash Effect
  useEffect(() => {
    if (attackLocation) {
        setFlashingLoc(attackLocation);
        const timer = setTimeout(() => setFlashingLoc(null), 2000);
        return () => clearTimeout(timer);
    }
  }, [attackLocation]);

  const handleLocAction = (cmd: string) => {
      if (onAction) {
          onAction(cmd);
          setSelectedLoc(null);
      }
  };

  const FloorRender = ({ loc, label, isBasement = false, isRoof = false }: { loc: Location, label: string, isBasement?: boolean, isRoof?: boolean }) => {
      const isCurrent = stats.location === loc;
      const isSelected = selectedLoc === loc;
      const isUnderAttack = flashingLoc === loc;
      const level = stats.fortificationLevel[loc] || 0;
      const count = stats.fortificationBuildCounts?.[loc] || 0;
      const isBuilding = count % 2 !== 0;
      const soldierCount = stats.soldierDistribution?.[loc] || 0;
      
      // HMG Logic
      const hmgSquads = stats.hmgSquads ? stats.hmgSquads.filter(s => s.location === loc && s.status === 'active') : [];
      const hasHmg = hmgSquads.length > 0;

      // Flag Logic (Roof only)
      const showFlag = isRoof && stats.hasFlagRaised;

      // Dynamic Styles
      let bgStyle = 'bg-neutral-900/40';
      if (isCurrent) bgStyle = 'bg-amber-900/10';
      if (isSelected) bgStyle = 'bg-neutral-800';
      if (isUnderAttack) bgStyle = 'bg-red-900/40 animate-pulse';

      let borderStyle = 'border-neutral-700';
      if (isCurrent) borderStyle = 'border-amber-600/60';
      if (isSelected) borderStyle = 'border-white/40';
      if (isUnderAttack) borderStyle = 'border-red-500';
      
      // Construction Stripes Background
      const constructionStyle = isBuilding 
        ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(234, 179, 8, 0.05) 10px, rgba(234, 179, 8, 0.05) 20px)' } 
        : {};

      return (
          <div 
            onClick={() => setSelectedLoc(loc)}
            className={`
                relative flex flex-col justify-between p-2 cursor-pointer transition-all duration-300 group
                border-x-2 border-y
                ${bgStyle} ${borderStyle}
                ${isRoof ? 'border-t-0 rounded-t-sm h-24 mt-6' : ''} 
                ${isBasement ? 'border-b-2 rounded-b-sm h-20 bg-[#050505]' : 'h-24'}
                ${!isRoof && !isBasement ? 'border-y-neutral-800/50' : ''}
            `}
            style={constructionStyle}
          >
              {/* Roof visual hint */}
              {isRoof && <div className="absolute -top-4 left-0 right-0 h-4 bg-gradient-to-t from-neutral-800/20 to-transparent pointer-events-none"></div>}
              
              {/* Flag Visual on Roof - Enhanced */}
              {isRoof && (
                  <div className="absolute -top-5 right-4 z-20 flex flex-col items-center group/flag">
                       {showFlag ? (
                           <>
                                <div className="relative z-10">
                                    <span className="text-3xl sm:text-4xl leading-none animate-pulse drop-shadow-[0_0_15px_rgba(220,38,38,0.9)] origin-bottom-left -rotate-12 block transform transition-transform hover:scale-110 cursor-help" title="国旗已升起：士气+30，但会吸引日军轰炸">🇹🇼</span>
                                </div>
                                <div className="w-1 h-8 bg-gradient-to-b from-neutral-300 to-neutral-600 shadow-lg mt-[-2px]"></div>
                                <div className="w-4 h-1 bg-neutral-500 rounded-full mt-[-1px]"></div>
                           </>
                       ) : (
                           <div className="flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity cursor-help" title="升旗点 (需在屋顶指令中操作)">
                                <div className="w-6 h-5 border-2 border-dashed border-neutral-600 rounded-sm mb-0.5 flex items-center justify-center bg-black/20">
                                    <span className="text-[10px] text-neutral-500 font-bold">?</span>
                                </div>
                                <div className="w-0.5 h-6 bg-neutral-600"></div>
                                <div className="w-3 h-0.5 bg-neutral-600"></div>
                           </div>
                       )}
                  </div>
              )}

              {/* Construction Overlay Badge */}
              {isBuilding && (
                  <div className="absolute top-0 right-0 bg-yellow-600/20 text-yellow-500 text-[9px] font-bold px-1.5 py-0.5 rounded-bl border-b border-l border-yellow-600/30 flex items-center gap-1 z-20">
                      <span className="animate-spin-slow">⚙</span> 施工中...
                  </div>
              )}

              {/* Top Row: Label & Level */}
              <div className="flex justify-between items-start z-10">
                  <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                          <span className={`text-xs font-bold font-serif tracking-widest ${isUnderAttack ? 'text-red-400' : (isCurrent ? 'text-amber-500' : 'text-neutral-400')}`}>
                              {label.split(' ')[0]} 
                          </span>
                          <span className="text-[9px] opacity-60 font-mono uppercase">{label.split(' ')[1]}</span>
                      </div>
                      
                      {/* Level Badge */}
                      <div className={`
                        text-[9px] font-mono px-1 rounded border 
                        ${level === 3 ? 'text-yellow-400 border-yellow-800 bg-yellow-900/20' : 
                          level === 0 ? 'text-red-500 border-red-900 bg-red-900/10' : 
                          'text-neutral-500 border-neutral-700 bg-neutral-800'}
                      `}>
                        Lv.{level}
                      </div>

                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_5px_orange]"></span>}
                      {isUnderAttack && <span className="text-[10px] text-red-500 animate-bounce">⚠</span>}
                  </div>
              </div>

              {/* Middle Row: Visual Unit Representation */}
              <div className="flex-1 flex items-center justify-between px-2 py-1">
                 
                 {/* HMG Turrets */}
                 <div className="flex gap-2 items-center">
                    {hmgSquads.map((_, i) => (
                        <div key={i} className="relative group/hmg" title="机枪连部署中">
                            {/* Base */}
                            <div className="w-6 h-3 bg-neutral-800 rounded-sm border border-neutral-600 relative z-10"></div>
                            {/* Barrel */}
                            <div className="absolute top-1 -right-2 w-3 h-1 bg-neutral-500"></div>
                            {/* Flash Animation */}
                            <div className="absolute top-0 -right-4 w-4 h-3 bg-orange-500/0 rounded-full animate-ping-fast"></div>
                            <div className="absolute -top-3 left-0 text-[8px] text-orange-500 font-bold opacity-0 group-hover/hmg:opacity-100 transition-opacity">HMG</div>
                        </div>
                    ))}
                 </div>

                 {/* Soldier Density Dots */}
                 <div className="flex flex-col items-end gap-1">
                    <div className="flex flex-wrap justify-end gap-0.5 max-w-[80px]">
                        {Array.from({ length: Math.min(20, Math.ceil(soldierCount / 10)) }).map((_, i) => (
                            <div key={i} className={`w-1 h-1.5 rounded-[1px] ${isCurrent ? 'bg-amber-700' : 'bg-neutral-600'} ${i % 3 === 0 ? 'opacity-80' : 'opacity-50'}`}></div>
                        ))}
                    </div>
                    <span className="text-[9px] text-neutral-500 font-mono">{soldierCount}人</span>
                 </div>
              </div>

              {/* Bottom Row: Fortification Integrity Visuals */}
              <div className="mt-auto relative w-full h-1.5 flex items-end gap-0.5 opacity-60">
                  {/* Render Level Blocks */}
                  {[...Array(3)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`flex-1 h-full rounded-[1px] transition-all duration-500 ${
                            i < level 
                            ? (isUnderAttack ? 'bg-red-600' : (loc === '地下室' ? 'bg-blue-800' : 'bg-stone-500')) 
                            : 'bg-neutral-800/30'
                        }`}
                      ></div>
                  ))}
              </div>
              
              {/* Background texture for walls */}
              {!isRoof && <div className="absolute inset-0 border-x-[4px] border-neutral-800/30 pointer-events-none"></div>}
          </div>
      );
  };

  return (
    <div className="bg-[#080808] border-b border-neutral-800 p-4 select-none relative font-sans">
      
      {/* Blueprint Container */}
      <div className="max-w-md mx-auto flex flex-col relative shadow-2xl">
          
          {/* Ground Line visual - Fixed Layout */}
          <div className="absolute top-[190px] left-0 right-0 h-0.5 bg-neutral-600/50 z-0 shadow-[0_0_10px_rgba(0,0,0,0.8)]"></div>
          <div className="absolute top-[190px] left-0 right-0 h-32 bg-gradient-to-b from-neutral-900/80 to-black pointer-events-none z-0"></div>

          {/* Floors */}
          <FloorRender loc="屋顶" label="RF 防空台" isRoof />
          <FloorRender loc="二楼阵地" label="2F 射击窗" />
          <FloorRender loc="一楼入口" label="1F 大门垒" />
          <FloorRender loc="地下室" label="B1 医疗室" isBasement />
          
      </div>
      
      {/* Selection Detail Modal (Kept Logic) */}
      {selectedLoc && (
        <div 
            className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col p-4 animate-fade-in text-neutral-200"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="bg-[#111] border border-neutral-700 shadow-2xl rounded-lg p-4 flex flex-col h-full max-h-[300px]">
                <div className="flex justify-between items-center border-b border-neutral-800 pb-2 mb-3 bg-[#111]">
                    <h4 className="text-lg font-bold text-amber-500">{selectedLoc}</h4>
                    <button onClick={() => setSelectedLoc(null)} className="text-neutral-500 hover:text-white px-2">✕</button>
                </div>

                <div className="bg-neutral-900/50 p-2 rounded mb-4 border-l-2 border-amber-900">
                     <p className="text-neutral-400 text-xs italic leading-relaxed">{LOCATION_DETAILS[selectedLoc].desc}</p>
                     <p className="text-amber-700 text-[10px] mt-1 font-bold uppercase">战术价值: {LOCATION_DETAILS[selectedLoc].tactical}</p>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
                    <button onClick={() => handleLocAction(`前往${selectedLoc}`)} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded border border-neutral-700 transition-colors flex items-center justify-center gap-2">
                        <span>🏃</span> 移动至此
                    </button>

                    {selectedLoc !== '地下室' && (
                        <button onClick={() => handleLocAction(`加固${selectedLoc}`)} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-amber-500 text-xs font-bold rounded border border-neutral-700 transition-colors flex items-center justify-center gap-2">
                            <span>🛠️</span> 加固工事 (2h)
                        </button>
                    )}

                    {selectedLoc === '屋顶' && !stats.hasFlagRaised && (
                            <button onClick={() => handleLocAction(`升旗`)} className="w-full py-3 bg-red-900/20 hover:bg-red-900/30 text-red-500 text-xs font-bold rounded border border-red-800 transition-colors flex items-center justify-center gap-2">
                            <span className="animate-pulse">⚑</span> 升起国旗 (危险)
                        </button>
                    )}
                    
                    {selectedLoc === '地下室' && stats.wounded > 0 && (
                            <button onClick={() => handleLocAction(`治疗伤员`)} className="w-full py-3 bg-green-900/20 hover:bg-green-900/30 text-green-500 text-xs font-bold rounded border border-green-800 transition-colors flex items-center justify-center gap-2">
                            <span>🚑</span> 救治伤员 (1h)
                        </button>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TacticalMap;
