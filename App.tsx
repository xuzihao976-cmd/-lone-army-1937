
import React, { useState, useEffect, useRef, useCallback } from 'react';
import StatsPanel from './components/StatsPanel';
import TacticalMap from './components/TacticalMap';
import Typewriter from './components/Typewriter';
import StartScreen from './components/StartScreen';
import SaveLoadModal from './components/SaveLoadModal';
import AdvisorChat from './components/AdvisorChat';
import QuickActions from './components/QuickActions'; 
import DilemmaModal from './components/DilemmaModal';
import TacticalCardDisplay from './components/TacticalCardDisplay'; 
import GameOverModal from './components/GameOverModal'; 
import BattleResultCard from './components/BattleResultCard';
import ActionPreviewBar from './components/ActionPreviewBar';
import TutorialGuide from './components/TutorialGuide';
import { GameStats, GameLog, GameTurnResult, SaveSlotMeta, Dilemma, Location, EndingType } from './types';
import { runGameTurn } from './engine/gameEngine';
import { getActionPreview } from './engine/actionPreview';
import { enhanceBattleNarrative, resetAiGatewayProbe, type AiSource } from './services/aiClient';
import { createInitialStats, getAutoSaveMeta, listSaveSlots, readAutoSave, readSaveSlot, writeAutoSave, writeSaveSlot } from './storage/saveStore';
import { getSoundEnabled, playSound, setSoundEnabled as persistSoundEnabled } from './utils/sound';

const ACHIEVEMENTS_KEY = 'lone_army_achievements';
const AI_PREFERENCE_KEY = 'lone_army_ai_enhancement';
const MAP_HINT_SEEN_KEY = 'lone_army_map_hint_seen';
const IS_STATIC_HOSTING = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

const createLogId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const readAiPreference = (): boolean => {
  if (IS_STATIC_HOSTING) return false;
  try {
    return typeof window !== 'undefined' && localStorage.getItem(AI_PREFERENCE_KEY) === 'on';
  } catch {
    return false;
  }
};

const App: React.FC = () => {
  // Scene State
  const [view, setView] = useState<'MENU' | 'GAME'>('MENU');
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false); 
  const [modalMode, setModalMode] = useState<'save' | 'load'>('save');
  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>([]);
  const [autoSaveMeta, setAutoSaveMeta] = useState<SaveSlotMeta | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<EndingType[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(getSoundEnabled);
  
  // NEW: UI State for Delayed Game Over Modal
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  
  // Game Event State
  const [currentDilemma, setCurrentDilemma] = useState<Dilemma | null>(null);
  const [enemyIntel, setEnemyIntel] = useState<string>("日军动向不明...");
  const [attackLocation, setAttackLocation] = useState<Location | null>(null);
  const [showBattleMapHint, setShowBattleMapHint] = useState(false);

  // Visual Effects State
  const [visualEffect, setVisualEffect] = useState<'none' | 'shake' | 'heavy-damage'>('none');
  
  // Menu Internal UI State
  const [confirmExit, setConfirmExit] = useState(false);

  // Game State
  const [stats, setStats] = useState<GameStats>(() => createInitialStats());
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMap, setShowMap] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 640px)').matches,
  );
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiSource, setAiSource] = useState<AiSource | 'auto'>('auto');
  const [aiEnabled, setAiEnabled] = useState(readAiPreference);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const gameSessionRef = useRef(0);
  const statsRef = useRef(stats);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    if (view !== 'GAME' || logs.length === 0 || isLoading) return;
    const timer = window.setTimeout(() => {
      try {
        setAutoSaveMeta(writeAutoSave(localStorage, stats, logs));
      } catch (error) {
        console.error('Auto-save failed', error);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [view, stats, logs, isLoading]);

  // --- Visual Effect Handler ---
  useEffect(() => {
    if (visualEffect !== 'none') {
        const timer = setTimeout(() => {
            setVisualEffect('none');
        }, 600); 
        return () => clearTimeout(timer);
    }
  }, [visualEffect]);

  // --- Game Over Delay Handler ---
  useEffect(() => {
    let timer: number;
    if (stats.isGameOver) {
        timer = window.setTimeout(() => {
            setShowGameOverModal(true);
        }, 1200);
    } else {
        setShowGameOverModal(false);
    }
    return () => clearTimeout(timer);
  }, [stats.isGameOver]);

  // --- Achievement & Save System Logic ---

  useEffect(() => {
    refreshSaveSlots();
    loadAchievements();
    return () => aiAbortRef.current?.abort();
  }, []);

  const loadAchievements = () => {
      try {
          const json = localStorage.getItem(ACHIEVEMENTS_KEY);
          if (json) {
              setUnlockedAchievements(JSON.parse(json));
          }
      } catch (e) {
          console.error("Failed to load achievements", e);
      }
  };

  const unlockAchievement = (endingId: EndingType) => {
      if (endingId === 'ongoing' || endingId === 'defeat_generic') return;
      
      setUnlockedAchievements(prev => {
          if (!prev.includes(endingId)) {
              const newlist = [...prev, endingId];
              localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(newlist));
              return newlist;
          }
          return prev;
      });
  };

  const refreshSaveSlots = () => {
    try {
        setSaveSlots(listSaveSlots(localStorage));
        setAutoSaveMeta(getAutoSaveMeta(localStorage));
    } catch (e) {
        console.error("Error refreshing save slots", e);
    }
  };

  const hasAnySave = () => !!autoSaveMeta || saveSlots.some(s => !s.isEmpty);

  const handleSaveToSlot = (slotId: number) => {
      try {
        playSound('click');
        setSaveSlots(writeSaveSlot(localStorage, slotId, stats, logs));
        playSound('save');
        setShowSaveLoadModal(false);
        setShowGameMenu(false); 
        alert("战报已归档！");
    } catch (e) {
        console.error("Save failed", e);
        alert("保存失败：存储空间可能已满。");
    }
  };

  const handleLoadFromSlot = (slotId: number) => {
      try {
        playSound('click');
        const data = readSaveSlot(localStorage, slotId);
        if (!data) throw new Error('Invalid save data');
        aiAbortRef.current?.abort();
        aiAbortRef.current = null;
        setIsEnhancing(false);
        gameSessionRef.current += 1;
        statsRef.current = data.stats;
        setStats(data.stats);
        setLogs(data.logs);
        setCurrentDilemma(null);
        setAttackLocation(null);
        setShowBattleMapHint(false);
        setAiSource('auto');
        setView('GAME');
        setShowSaveLoadModal(false);
        setShowGameMenu(false);
    } catch (e) {
        console.error("Load failed", e);
        alert("档案读取失败，文件可能已损毁。");
    }
  };

  const handleLoadAutoSave = () => {
      try {
        playSound('click');
        const data = readAutoSave(localStorage);
        if (!data) throw new Error('No auto-save available');
        aiAbortRef.current?.abort();
        aiAbortRef.current = null;
        setIsEnhancing(false);
        gameSessionRef.current += 1;
        statsRef.current = data.stats;
        setStats(data.stats);
        setLogs(data.logs);
        setCurrentDilemma(null);
        setAttackLocation(null);
        setShowBattleMapHint(false);
        setEnemyIntel('自动存档已恢复，侦察信息将在下一次行动后刷新。');
        setAiSource('auto');
        setView('GAME');
        setShowSaveLoadModal(false);
        setShowGameMenu(false);
      } catch (error) {
        console.error('Auto-save load failed', error);
        alert('自动存档读取失败，文件可能已损毁。');
      }
  };

  const openSaveModal = () => {
    playSound('click');
    refreshSaveSlots();
    setModalMode('save');
    setShowSaveLoadModal(true);
  };

  const openLoadModal = () => {
    playSound('click');
    refreshSaveSlots();
    setModalMode('load');
    setShowSaveLoadModal(true);
  };

  // --- Auto Scroll ---
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, view, isLoading]);

  // Focus Input
  useEffect(() => {
    if (view === 'GAME' && !stats.isGameOver && !showSaveLoadModal && !showGameMenu && !showAdvisor && !currentDilemma) {
      const hasPrecisePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
      if (hasPrecisePointer) setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [view, stats.isGameOver, showSaveLoadModal, showGameMenu, showAdvisor, currentDilemma]);

  // --- Core Game Logic ---

  const cancelNarrativeEnhancement = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setIsEnhancing(false);
  }, []);

  const enhanceLogInBackground = useCallback(async (
    logId: string,
    response: GameTurnResult,
    command: string,
    snapshot: GameStats,
    sessionId: number,
  ) => {
    if (IS_STATIC_HOSTING || !aiEnabled || response.dilemma || response.updatedStats.isGameOver || command === 'start_game') return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setIsEnhancing(true);

    const context = `第${snapshot.day}天 ${snapshot.currentTime}；位置：${snapshot.location}；士气：${snapshot.morale}；阵地：${snapshot.health}`;
    const reply = await enhanceBattleNarrative(response.narrative, command, context, controller.signal);

    if (!controller.signal.aborted && gameSessionRef.current === sessionId) {
      setAiSource(reply.source);
      if (reply.source === 'siliconflow') {
        setLogs((prev) => prev.map((log) => log.id === logId ? { ...log, text: reply.text, isTyping: false } : log));
      }
    }

    if (aiAbortRef.current === controller) {
      aiAbortRef.current = null;
      setIsEnhancing(false);
    }
  }, [aiEnabled]);

  const handleGameResponse = useCallback((response: GameTurnResult, logId: string) => {
    const logStats = { ...statsRef.current, ...response.updatedStats };
    setLogs((prev) => [
      ...prev,
      {
        id: logId,
        sender: 'system',
        text: response.narrative,
        isTyping: true, 
        summary: response.summary,
        day: logStats.day,
        time: logStats.currentTime,
      },
    ]);

    if (response.visualEffect && response.visualEffect !== 'none') {
        setVisualEffect(response.visualEffect);
    }

    if (response.enemyIntel) {
        setEnemyIntel(response.enemyIntel);
    }
    
    if (response.attackLocation) {
        setAttackLocation(response.attackLocation);
    }

    if (response.eventTriggered === 'attack' && statsRef.current.tutorialStep >= 3) {
      try {
        if (localStorage.getItem(MAP_HINT_SEEN_KEY) !== '1') {
          localStorage.setItem(MAP_HINT_SEEN_KEY, '1');
          setShowBattleMapHint(true);
        }
      } catch {
        setShowBattleMapHint(true);
      }
    }

    if (response.dilemma) {
        setCurrentDilemma(response.dilemma);
    }

    if (response.updatedStats) {
      setStats((prev) => {
        const newStats = { ...prev, ...response.updatedStats };
        
        // Ensure integer values
        if (typeof newStats.soldiers === 'number') newStats.soldiers = Math.floor(Math.max(0, newStats.soldiers));
        if (typeof newStats.morale === 'number') newStats.morale = Math.floor(Math.min(100, Math.max(0, newStats.morale)));
        if (typeof newStats.health === 'number') newStats.health = Math.floor(Math.min(100, Math.max(0, newStats.health)));
        if (typeof newStats.ammo === 'number') newStats.ammo = Math.floor(Math.max(0, newStats.ammo));
        if (typeof newStats.sandbags === 'number') newStats.sandbags = Math.floor(Math.max(0, newStats.sandbags));
        
        if (response.updatedStats.fortificationLevel) {
             newStats.fortificationLevel = { ...prev.fortificationLevel, ...response.updatedStats.fortificationLevel };
        }
        
        if (response.updatedStats.fortificationBuildCounts) {
             newStats.fortificationBuildCounts = { ...prev.fortificationBuildCounts, ...response.updatedStats.fortificationBuildCounts };
        }

        if (response.updatedStats.soldierDistribution) {
             const dist = { ...prev.soldierDistribution, ...response.updatedStats.soldierDistribution };
             Object.keys(dist).forEach(k => dist[k] = Math.floor(dist[k]));
             newStats.soldierDistribution = dist;
        }

        // Merge Roster Updates (for dead soldiers)
        if (response.updatedStats.roster) {
            newStats.roster = response.updatedStats.roster;
        }
        
        newStats.turnCount = (prev.turnCount || 0) + 1;

        // Check for Ending Unlock
        if (newStats.isGameOver && newStats.gameResult) {
            unlockAchievement(newStats.gameResult);
        }

        statsRef.current = newStats;
        return newStats;
      });
    }

    if (response.eventTriggered === 'new_day' || response.eventTriggered === 'victory') {
      playSound('success');
    } else if (response.visualEffect === 'heavy-damage') {
      playSound('damage');
    }
  }, []);

  // --- Game Control Logic ---

  const handleNewGame = () => {
    if (view === 'MENU' && autoSaveMeta && !window.confirm('开始新战役会覆盖当前自动存档，5 个手动档案不会受影响。确认继续吗？')) {
      return;
    }
    playSound('click');
    cancelNarrativeEnhancement();
    gameSessionRef.current += 1;
    const initialStats = createInitialStats();
    statsRef.current = initialStats;
    setStats(initialStats);
    setLogs([]);
    setView('GAME');
    setShowGameMenu(false);
    setShowGameOverModal(false);
    setCurrentDilemma(null);
    setAttackLocation(null);
    setShowBattleMapHint(false);
    setAiSource('auto');

    try {
        const startResponse = runGameTurn(initialStats, 'start_game');
        handleGameResponse(startResponse, createLogId());
    } catch (error) {
        console.error(error);
        setLogs([{ id: 'error', sender: 'system', text: '初始化失败，系统异常。' }]);
    }
  };

  const handleExitRequest = () => {
    playSound('click');
    setConfirmExit(true);
  };

  const handleConfirmExit = () => {
    playSound('click');
    cancelNarrativeEnhancement();
    gameSessionRef.current += 1;
    setView('MENU');
    setShowGameMenu(false);
    setConfirmExit(false);
    setStats(prev => ({ ...prev, isGameOver: false }));
    setShowGameOverModal(false); 
    refreshSaveSlots();
    loadAchievements();
  };

  const handleCommand = async (e?: React.FormEvent, directCommand?: string, displayLabel?: string) => {
    if (e) e.preventDefault();
    
    const userCmd = directCommand || input.trim();
    const logText = displayLabel || userCmd;

    if (isComposing.current || !userCmd || isLoading || stats.isGameOver) return;

    if (!directCommand) setInput('');
    setIsLoading(true);
    
    // Play sound for command send
    playSound('click');

    const currentStats = statsRef.current;

    setLogs((prev) => [
      ...prev.map(l => ({ ...l, isTyping: false })),
      {
        id: Date.now().toString(),
        sender: 'user',
        text: `> ${logText}`,
        day: currentStats.day,
        time: currentStats.currentTime,
      },
    ]);

    try {
        const response = runGameTurn(currentStats, userCmd);
        const systemLogId = createLogId();
        handleGameResponse(response, systemLogId);

        const snapshot = { ...currentStats, ...response.updatedStats };
        void enhanceLogInBackground(
          systemLogId,
          response,
          userCmd,
          snapshot,
          gameSessionRef.current,
        );
    } catch (error) {
        console.error("Game Error:", error);
        setLogs(prev => [...prev, { id: Date.now().toString(), sender: 'system', text: "系统错误，请重试。", isTyping: false }]);
    } finally {
        setIsLoading(false);
        const hasPrecisePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
        if (!directCommand && hasPrecisePointer) setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleDilemmaChoice = async (actionCmd: string, label: string) => {
      setCurrentDilemma(null);
      handleCommand(undefined, actionCmd.toLowerCase(), label);
  };
  
  // Tactical Card Execution
  const handleTacticalCardExecute = async (cmd: string, title: string) => {
      setStats(prev => ({...prev, activeTacticalCard: null}));
      handleCommand(undefined, cmd, title);
  };

  const toggleAiEnhancement = () => {
    if (IS_STATIC_HOSTING) return;
    const next = !aiEnabled;
    setAiEnabled(next);
    try {
      localStorage.setItem(AI_PREFERENCE_KEY, next ? 'on' : 'off');
    } catch {
      // Storage can be blocked in strict privacy modes; the in-memory toggle
      // still works for the current session.
    }
    if (!next) {
      cancelNarrativeEnhancement();
      setAiSource('local');
    } else {
      resetAiGatewayProbe();
      setAiSource('auto');
    }
  };

  const finishTyping = useCallback((id: string) => {
    setLogs(prev => prev.map(log => log.id === id ? { ...log, isTyping: false } : log));
  }, []);

  const containerEffectClass = 
    visualEffect === 'shake' ? 'effect-shake' : 
    visualEffect === 'heavy-damage' ? 'effect-shake effect-damage' : '';

  const aiStatusLabel = IS_STATIC_HOSTING
    ? '本地叙事 · 无需 API'
    : !aiEnabled
    ? 'AI 已关闭'
    : isEnhancing
      ? 'AI 润色中'
      : aiSource === 'siliconflow'
        ? '免费 AI 已连接'
        : aiSource === 'local'
          ? '本地叙事兜底'
          : 'AI 自动增强';

  const actionPreview = stats.isGameOver || currentDilemma ? null : getActionPreview(stats, input);

  return (
    <div className={`readable-panel relative mx-auto flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden border-x border-neutral-800 bg-[#111] text-[#ddd] shadow-2xl ${containerEffectClass}`}>
      
      {/* Modals */}
      {showSaveLoadModal && (
          <SaveLoadModal 
            mode={modalMode} 
            slots={saveSlots} 
            autoSave={autoSaveMeta}
            onClose={() => setShowSaveLoadModal(false)}
            onSelectAutoSave={handleLoadAutoSave}
            onSelectSlot={(id) => {
                if (modalMode === 'save') {
                    if (saveSlots[id].isEmpty || window.confirm(`确认覆盖 存档 ${id+1} 吗？`)) {
                        handleSaveToSlot(id);
                    }
                } else {
                    if (saveSlots[id].isEmpty) return;
                    handleLoadFromSlot(id);
                }
            }}
          />
      )}
      
      {currentDilemma && (
          <DilemmaModal dilemma={currentDilemma} onChoice={(cmd) => {
              const opt = currentDilemma.options.find(o => o.actionCmd === cmd);
              handleDilemmaChoice(cmd, opt?.label || "做出选择");
          }} />
      )}
      
      {stats.activeTacticalCard && (
          <TacticalCardDisplay 
              card={stats.activeTacticalCard} 
              onExecute={(cmd) => handleTacticalCardExecute(cmd, stats.activeTacticalCard?.title || "")} 
          />
      )}

      {/* NEW: Game Over Modal - Triggered by Delayed State */}
      {showGameOverModal && (
          <GameOverModal 
            stats={stats} 
            onRestart={handleNewGame} 
            onExit={handleConfirmExit} 
            onReview={() => setShowGameOverModal(false)}
          />
      )}
      
      <AdvisorChat isOpen={showAdvisor} onClose={() => setShowAdvisor(false)} />

      {view === 'MENU' ? (
          <StartScreen 
            onNewGame={handleNewGame} 
            onContinueAutoSave={handleLoadAutoSave}
            onOpenLoadMenu={openLoadModal} 
            hasSaves={hasAnySave()} 
            hasAutoSave={!!autoSaveMeta}
            unlockedAchievements={unlockedAchievements}
          />
      ) : (
        <>
            {showGameMenu && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-lg shadow-2xl w-full max-w-sm relative">
                        <h3 className="text-xl font-bold text-neutral-200 mb-6 text-center border-b border-neutral-800 pb-2">战时菜单</h3>
                        {!confirmExit ? (
                            <div className="space-y-3">
                                <button onClick={() => { playSound('click'); setShowGameMenu(false); }} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors">
                                    返回前线
                                </button>
                                <button onClick={openSaveModal} className="w-full py-3 bg-neutral-800 hover:bg-amber-900/30 text-amber-500 rounded border border-neutral-700 transition-colors">
                                    保存进度
                                </button>
                                <button
                                    onClick={() => {
                                      const next = !soundEnabled;
                                      persistSoundEnabled(next);
                                      setSoundEnabled(next);
                                      if (next) playSound('click');
                                    }}
                                    className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 transition-colors"
                                >
                                    本地音效：{soundEnabled ? '开启' : '关闭'}
                                </button>
                                <button onClick={handleExitRequest} className="w-full py-3 bg-red-900/20 hover:bg-red-900/40 text-red-500 rounded border border-red-900/30 transition-colors">
                                    撤出战场
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 text-center">
                                <p className="text-red-400 text-sm mb-4">确定要返回主菜单吗？<br/><span className="text-neutral-500">最近一次命令已经自动保存。</span></p>
                                <button onClick={handleConfirmExit} className="w-full py-3 bg-red-800 hover:bg-red-700 text-white rounded font-bold">
                                    确认撤离
                                </button>
                                <button onClick={() => { playSound('click'); setConfirmExit(false); }} className="w-full py-3 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded">
                                    取消
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <StatsPanel stats={stats} enemyIntel={enemyIntel} />

            {showBattleMapHint && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-900/50 bg-red-950/25 px-3 py-2" role="status">
                <div className="min-w-0">
                  <div className="text-xs font-black text-red-300">战场提示：红点就是敌军当前目标</div>
                  <div className="truncate text-[11px] text-neutral-400">打开地图可查看遭袭楼层，并立即调兵或加固。</div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {!showMap && (
                    <button
                      type="button"
                      onClick={() => { playSound('click'); setShowMap(true); setShowBattleMapHint(false); }}
                      className="rounded border border-red-800 bg-red-950/40 px-2.5 py-1.5 text-[11px] font-black text-red-200"
                    >
                      打开地图
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowBattleMapHint(false)}
                    className="rounded border border-neutral-700 px-2.5 py-1.5 text-[11px] font-bold text-neutral-300"
                  >
                    知道了
                  </button>
                </div>
              </div>
            )}

            <div className="relative z-10 flex shrink-0 justify-center border-b border-neutral-800 bg-neutral-900 px-4 py-2">
                <button 
                    onClick={() => { playSound('click'); setShowMap(!showMap); }}
                    className="flex items-center gap-2 text-xs font-bold tracking-wider text-neutral-300 hover:text-white"
                >
                    {showMap ? '▼ 隐藏战略地图' : '▲ 显示战略地图'}
                </button>
            </div>

            {/* Map Container: Restricted height with scroll to prevent blocking chat */}
            {showMap && (
                <div className="max-h-[34vh] shrink-0 overflow-y-auto border-b border-neutral-800 bg-[#0a0a0a] custom-scrollbar sm:max-h-[38vh]">
                    <TacticalMap stats={stats} onAction={(cmd) => handleCommand(undefined, cmd)} attackLocation={attackLocation} />
                </div>
            )}

            <div 
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 font-mono scroll-smooth sm:space-y-6 sm:p-6"
                onClick={() => {
                    const lastLog = logs[logs.length - 1];
                    if (lastLog?.isTyping) finishTyping(lastLog.id);
                }}
            >
                {logs.map((log) => (
                <div 
                    key={log.id} 
                    className={`flex flex-col ${log.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                    {log.sender === 'user' && log.day !== undefined && log.time && (
                        <div className="mb-1.5 text-[11px] font-mono font-bold text-neutral-500">第 {log.day} 天 · {log.time}</div>
                    )}
                    <div className={`max-w-[95%] sm:max-w-[90%] ${
                    log.sender === 'user' 
                        ? 'rounded-r border-l-2 border-neutral-500 bg-neutral-900/40 py-2 pr-3 pl-3 text-sm font-bold text-neutral-300'
                        : 'text-[15px] leading-7 text-neutral-200 sm:text-base sm:leading-8'
                    }`}>
                    {log.sender === 'system' && log.isTyping ? (
                        <>
                            <Typewriter
                                text={log.text}
                                speed={15}
                                onComplete={() => finishTyping(log.id)}
                            />
                            <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); finishTyping(log.id); }}
                                className="ml-2 inline-flex rounded border border-neutral-700 px-2 py-1 align-middle text-[11px] font-bold leading-none text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                            >
                                跳过
                            </button>
                        </>
                    ) : (
                        <span className="whitespace-pre-wrap">{log.text}</span>
                    )}
                    </div>
                    {log.sender === 'system' && log.summary && !log.isTyping && (
                        <BattleResultCard summary={log.summary} />
                    )}
                </div>
                ))}

                {isEnhancing && (
                <div className="flex items-center gap-2 text-sm text-neutral-400 animate-pulse font-mono">
                    <span>[本地战报已生成，AI 正在后台润色...]</span>
                    <button 
                        onClick={cancelNarrativeEnhancement} 
                        className="ml-2 text-xs underline text-red-400 hover:text-red-300"
                        title="取消本次 AI 润色，本地战报不会丢失"
                    >
                        (取消润色)
                    </button>
                </div>
                )}
            </div>

            <div className="relative z-20 flex shrink-0 flex-col gap-2 border-t border-neutral-600 bg-[#171717] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(0,0,0,0.45)]">
                
                {!stats.isGameOver && (
                    <div className="flex justify-between items-center px-1 mb-1">
                        <div className="flex gap-2">
                             <button 
                                onClick={() => { playSound('click'); setShowAdvisor(true); }}
                                className="flex items-center gap-1.5 rounded border border-green-900/70 bg-neutral-950 px-3 py-2 text-xs font-bold text-green-300 transition-colors hover:text-green-200"
                            >
                                <span>☍</span> 战地顾问
                            </button>
                            <button
                                type="button"
                                onClick={toggleAiEnhancement}
                                disabled={IS_STATIC_HOSTING}
                                className={`flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-bold transition-colors ${
                                  IS_STATIC_HOSTING
                                    ? 'text-green-700 bg-black border-green-950/70 cursor-default'
                                    : aiEnabled
                                    ? 'text-amber-500/90 bg-neutral-900 border-amber-900/50 hover:border-amber-700'
                                    : 'text-neutral-600 bg-black border-neutral-800 hover:text-neutral-400'
                                }`}
                                title={IS_STATIC_HOSTING ? 'GitHub Pages 使用完整本地叙事，不会请求不存在的 API' : '免费 AI 只润色文字；关闭或连接失败时，游戏规则与本地叙事仍可完整运行'}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${IS_STATIC_HOSTING || (aiSource === 'siliconflow' && aiEnabled) ? 'bg-green-500' : 'bg-neutral-600'}`}></span>
                                <span className="hidden sm:inline">{aiStatusLabel}</span>
                                <span className="sm:hidden">{IS_STATIC_HOSTING ? '本地' : 'AI'}</span>
                            </button>
                        </div>
                        <button 
                            onClick={() => {
                                playSound('click');
                                setShowGameMenu(true);
                                setConfirmExit(false);
                            }}
                            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-bold text-neutral-300 transition-colors hover:text-white"
                        >
                            <span>☰</span> 菜单
                        </button>
                    </div>
                )}

                {/* Quick Actions Row */}
                {!stats.isGameOver && (
                    <>
                      <TutorialGuide
                        stats={stats}
                        disabled={isLoading || !!currentDilemma}
                        onSkip={() => handleCommand(undefined, 'skip_tutorial', '跳过教程')}
                      />
                      <QuickActions
                          onAction={(cmd) => handleCommand(undefined, cmd)}
                          disabled={isLoading || !!currentDilemma}
                          stats={stats}
                      />
                    </>
                )}

                {stats.isGameOver ? (
                  <div className="flex items-center justify-between gap-2 rounded border border-amber-900/40 bg-black/40 p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-black tracking-wide text-amber-400">战场复盘模式</div>
                      <div className="text-xs text-neutral-400">可滚动查看全部命令、战报与每回合结算</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setShowGameOverModal(true)}
                        className="rounded border border-amber-800 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-950/30"
                      >
                        查看结局
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmExit}
                        className="rounded border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-300 hover:bg-neutral-800"
                      >
                        主菜单
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <ActionPreviewBar preview={actionPreview} />

                    <form onSubmit={(e) => handleCommand(e)} className="relative flex gap-2">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-mono select-none">
                        {'>'}
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onCompositionStart={() => isComposing.current = true}
                        onCompositionEnd={() => isComposing.current = false}
                        placeholder={stats.isGameOver ? "连接断开..." : (currentDilemma ? "等待抉择..." : "下达命令...")}
                        disabled={stats.isGameOver || !!currentDilemma}
                        autoComplete="off"
                        autoCorrect="off"
                        className="w-full bg-neutral-900 text-white pl-8 pr-4 py-2.5 rounded-md border border-neutral-700 focus:border-neutral-500 focus:outline-none font-mono placeholder-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading || stats.isGameOver || !!currentDilemma}
                        className="whitespace-nowrap rounded-md border border-neutral-600 bg-neutral-700 px-4 py-2 text-sm font-black text-neutral-100 transition-colors hover:bg-neutral-600 disabled:opacity-50"
                    >
                        {isLoading ? '...' : '发送'}
                    </button>
                    </form>
                  </>
                )}
            </div>
        </>
      )}
    </div>
  );
};

export default App;
