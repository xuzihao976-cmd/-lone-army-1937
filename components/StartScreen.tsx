
import React, { useState } from 'react';
import { EndingType } from '../types';
import { ACHIEVEMENTS } from '../constants';

interface StartScreenProps {
  onNewGame: () => void;
  onContinueAutoSave: () => void;
  onOpenLoadMenu: () => void;
  hasSaves: boolean;
  hasAutoSave: boolean;
  unlockedAchievements: EndingType[];
}

const StartScreen: React.FC<StartScreenProps> = ({ onNewGame, onContinueAutoSave, onOpenLoadMenu, hasSaves, hasAutoSave, unlockedAchievements }) => {
  const [showAchievements, setShowAchievements] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#050505] text-[#e5e5e5] p-6 relative overflow-hidden">
      {/* Atmospheric Background Elements */}
      <div className="linen-texture absolute inset-0 opacity-30 pointer-events-none"></div>
      <div className="absolute top-10 left-0 w-full h-32 bg-gradient-to-b from-red-900/10 to-transparent pointer-events-none"></div>
      
      {!showAchievements ? (
      <>
        {/* Title Section */}
        <div className="z-10 text-center mb-10 sm:mb-16 animate-fade-in">
            <div className="text-red-700 text-xs tracking-[0.5em] mb-2 font-bold uppercase">
                一九三七 · 上海
            </div>
            <h1 className="text-5xl sm:text-7xl font-bold font-serif text-neutral-200 tracking-wider mb-2 drop-shadow-2xl">
            孤军
            </h1>
            <h2 className="text-2xl sm:text-3xl font-serif text-neutral-400 tracking-widest border-t border-neutral-800 pt-4 mt-2">
            四行仓库
            </h2>
            <div className="mt-6 text-sm text-neutral-600 font-mono">
                八百壮士 · 民族之魂
            </div>
        </div>

        {/* Action Buttons */}
        <div className="z-10 flex flex-col gap-4 w-full max-w-xs">
            
            <button
            onClick={onNewGame}
            className="w-full py-4 bg-red-900/20 border border-red-900/50 hover:bg-red-900/40 hover:border-red-600 text-neutral-200 font-bold tracking-widest transition-all duration-300 shadow-lg transform hover:scale-[1.02] active:scale-95 relative overflow-hidden"
            >
            <span className="relative z-10">开始新战役</span>
            </button>

            {hasAutoSave && (
                <button
                onClick={onContinueAutoSave}
                className="w-full py-3 bg-amber-950/20 border border-amber-800/50 hover:bg-amber-950/40 hover:border-amber-600 text-amber-500 font-bold tracking-widest transition-all duration-300 shadow-lg active:scale-95"
                >
                继续最近战役
                </button>
            )}

            <button
            onClick={onOpenLoadMenu}
            disabled={!hasSaves}
            className={`w-full py-3 bg-neutral-800 border border-neutral-600 text-amber-500 font-bold tracking-widest transition-all duration-300 shadow-lg flex flex-col items-center gap-1 ${hasSaves ? 'hover:bg-neutral-700 hover:border-amber-600 transform hover:scale-[1.02] active:scale-95' : 'opacity-50 cursor-not-allowed grayscale'}`}
            >
                <span>读取作战记录</span>
            </button>

            <button
                onClick={() => setShowAchievements(true)}
                className="w-full py-2 bg-transparent border border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600 transition-colors text-xs tracking-wider"
            >
                查看勋章墙 ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
            </button>
            
            <div className="mt-6 text-center text-xs font-mono leading-relaxed text-neutral-400">
                建议佩戴耳机体验本地战场音效<br/>
                v2.4.0 | 清晰战况 · 大字界面 · 离线可玩
            </div>
        </div>
      </>
      ) : (
          /* Achievements View */
          <div className="z-20 w-full max-w-2xl bg-[#0a0a0a] border border-neutral-800 p-6 rounded shadow-2xl flex flex-col h-[80vh] animate-fade-in">
              <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-2">
                  <h2 className="text-xl font-bold font-serif text-amber-600 tracking-widest">勋章墙</h2>
                  <button onClick={() => setShowAchievements(false)} className="text-neutral-500 hover:text-white px-2">✕</button>
              </div>
              
              <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4 custom-scrollbar pr-2">
                  {ACHIEVEMENTS.map((ach) => {
                      const isUnlocked = unlockedAchievements.includes(ach.id);
                      return (
                          <div 
                            key={ach.id} 
                            className={`p-4 border rounded flex gap-4 items-center transition-all ${
                                isUnlocked 
                                ? 'bg-neutral-900 border-amber-900/30' 
                                : 'bg-black border-neutral-900 opacity-60'
                            }`}
                          >
                              <div className={`text-3xl ${isUnlocked ? '' : 'grayscale opacity-20'}`}>
                                  {isUnlocked ? ach.icon : '🔒'}
                              </div>
                              <div className="flex-1">
                                  <div className={`font-bold font-serif ${isUnlocked ? 'text-neutral-200' : 'text-neutral-600'}`}>
                                      {isUnlocked ? ach.title : (ach.isSecret ? '???' : ach.title)}
                                  </div>
                                  <div className="mt-1 text-xs leading-relaxed text-neutral-400">
                                      {isUnlocked ? ach.desc : (ach.isSecret ? '该成就尚未解锁。' : ach.desc)}
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}
      
      {/* Footer */}
      <div className="pointer-events-none absolute bottom-4 text-[11px] font-mono text-neutral-600">
        &copy; 2024 孤军项目组
      </div>
    </div>
  );
};

export default StartScreen;
