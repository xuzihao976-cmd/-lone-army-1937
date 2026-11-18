
import React, { useState, useEffect, useRef, useCallback } from 'react';
import StatsPanel from './components/StatsPanel';
import BattleMasthead from './components/BattleMasthead';
import GameDialog from './components/GameDialog';
import TacticalMap from './components/TacticalMap';
import Typewriter from './components/Typewriter';
import StartScreen from './components/StartScreen';
import SaveLoadModal from './components/SaveLoadModal';
import AdvisorChat from './components/AdvisorChat';
import LocalCommandGuide from './components/LocalCommandGuide';
import QuickActions from './components/QuickActions'; 
import DilemmaModal from './components/DilemmaModal';
import TacticalCardDisplay from './components/TacticalCardDisplay'; 
import GameOverModal from './components/GameOverModal'; 
import BattleResultCard from './components/BattleResultCard';
import ActionPreviewBar from './components/ActionPreviewBar';
import TutorialGuide from './components/TutorialGuide';
import { ChapterMissionPanel, ChapterMissionActions } from './components/ChapterMissionPanel';
import { TacticStatus, TacticUseModal } from './components/TacticControls';
import { TACTICAL_CARDS } from './data/text/events';
import { getChapter, isShortChapter } from './data/chapters';
import { readChapterArchive, recordChapterResult, type ChapterArchive } from './storage/chapterArchive';
import { ChapterId, GameStats, GameLog, GameTurnResult, SaveSlotMeta, Dilemma, Location, EndingType, TacticId } from './types';
import { runGameTurn } from './engine/gameEngine';
import { getActionPreview } from './engine/actionPreview';
import { getPendingEvent } from './engine/eventPlans';
import { enhanceBattleNarrative, resetAiGatewayProbe, interpretUnknownCommand, isAiConfigured, describeAiFailure, type AiFailure, type AiSource } from './services/aiClient';
import { resolveNaturalCommand } from './engine/naturalCommands';
import { createInitialStats, getAutoSaveMeta, getChapterSaveMetas, listSaveSlots, readAutoSave, readChapterAutoSave, readSaveSlot, writeAutoSave, writeSaveSlot } from './storage/saveStore';
import { ACHIEVEMENTS } from './constants';
import { getSoundEnabled, playSound, setSoundEnabled as persistSoundEnabled } from './utils/sound';

const ACHIEVEMENTS_KEY = 'lone_army_achievements';
const AI_PREFERENCE_KEY = 'lone_army_ai_enhancement';
const MAP_HINT_SEEN_KEY = 'lone_army_map_hint_seen';
const IS_STATIC_HOSTING = !isAiConfigured();

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
  const [showCommands, setShowCommands] = useState(false);
  const [modalMode, setModalMode] = useState<'save' | 'load'>('save');
  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>([]);
  const [autoSaveMeta, setAutoSaveMeta] = useState<SaveSlotMeta | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<ChapterId>('street');
  const [selectedTactics, setSelectedTactics] = useState<Record<ChapterId, TacticId | null>>({ street: null, bridge: null, sihang: null });
  const [showTacticPreview, setShowTacticPreview] = useState(false);
  const [showEncounterDetails, setShowEncounterDetails] = useState(false);
  const [chapterSaves, setChapterSaves] = useState<Partial<Record<ChapterId, SaveSlotMeta>>>({});
  const [chapterArchive, setChapterArchive] = useState<ChapterArchive>({});
  const [unlockedAchievements, setUnlockedAchievements] = useState<EndingType[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(getSoundEnabled);
  
  // NEW: UI State for Delayed Game Over Modal
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  
  // Game Event State
  const [currentDilemma, setCurrentDilemma] = useState<Dilemma | null>(null);
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
  const [showMap, setShowMap] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiSource, setAiSource] = useState<AiSource | 'auto'>('auto');
  const [aiEnabled, setAiEnabled] = useState(readAiPreference);
  const [aiFailure, setAiFailure] = useState<AiFailure>();
  const [isInterpreting, setIsInterpreting] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const gameSessionRef = useRef(0);
  const statsRef = useRef(stats);

  useEffect(() => { setShowEncounterDetails(false); setShowTacticPreview(false); setShowCommands(false); setInput(''); }, [stats.campaignId, view]);

  useEffect(() => {
    if (!currentDilemma && !stats.isGameOver) return;
    setShowCommands(false); setShowMap(false); setShowGameMenu(false);
    setShowAdvisor(false); setShowTacticPreview(false); setShowEncounterDetails(false);
  }, [currentDilemma, stats.isGameOver]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    if (!stats.isGameOver) return;
    try { setChapterArchive(recordChapterResult(localStorage, stats)); }
    catch { /* The current result remains visible even if storage is full. */ }
  }, [stats.isGameOver, stats.campaignId]);

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
              const stored: unknown = JSON.parse(json);
              if (Array.isArray(stored)) setUnlockedAchievements(stored.filter(id => ACHIEVEMENTS.some(a => a.id === id)));
          }
      } catch (e) {
          console.error("Failed to load achievements", e);
      }
  };

  const unlockAchievement = (endingId: EndingType) => {
      if (!ACHIEVEMENTS.some(achievement => achievement.id === endingId)) return;
      
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
        setChapterSaves(getChapterSaveMetas(localStorage));
        setChapterArchive(readChapterArchive(localStorage));
    } catch (e) {
        console.error("Error refreshing save slots", e);
    }
  };

  const hasAnySave = () => !!autoSaveMeta || Object.keys(chapterSaves).length > 0 || saveSlots.some(s => !s.isEmpty);

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
        setShowGameOverModal(data.stats.isGameOver);
        setSelectedChapter(data.stats.chapterId);
        setShowTacticPreview(false);
        setSelectedTactics(previous => ({ ...previous, [data.stats.chapterId]: data.stats.equippedTactic?.id ?? null }));
        setLogs(data.logs);
        setCurrentDilemma(getPendingEvent(data.stats));
        setAttackLocation(null);
        setShowBattleMapHint(false);
        setShowMap(false);
        setShowAdvisor(false);
        setIsLoading(false);
        setAiSource('auto');
        setView('GAME');
        setShowSaveLoadModal(false);
        setShowGameMenu(false);
    } catch (e) {
        console.error("Load failed", e);
        alert("档案读取失败，文件可能已损毁。");
    }
  };

  const handleLoadAutoSave = (chapterId?: ChapterId) => {
      try {
        playSound('click');
        const data = chapterId ? readChapterAutoSave(localStorage, chapterId) : readAutoSave(localStorage);
        if (!data) throw new Error('No auto-save available');
        aiAbortRef.current?.abort();
        aiAbortRef.current = null;
        setIsEnhancing(false);
        gameSessionRef.current += 1;
        statsRef.current = data.stats;
        setStats(data.stats);
        setShowGameOverModal(data.stats.isGameOver);
        setSelectedChapter(data.stats.chapterId);
        setShowTacticPreview(false);
        setSelectedTactics(previous => ({ ...previous, [data.stats.chapterId]: data.stats.equippedTactic?.id ?? null }));
        setLogs(data.logs);
        setCurrentDilemma(getPendingEvent(data.stats));
        setAttackLocation(null);
        setShowBattleMapHint(false);
        setShowMap(false);
        setShowAdvisor(false);
        setIsLoading(false);
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
    setShowGameMenu(false);
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
    if (isShortChapter(snapshot) || IS_STATIC_HOSTING || !aiEnabled || response.dilemma || response.updatedStats.isGameOver || !['attack', 'new_day'].includes(response.eventTriggered || '')) return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setIsEnhancing(true);

    const context = `第${snapshot.day}天 ${snapshot.currentTime}；位置：${snapshot.location}；士气：${snapshot.morale}；阵地：${snapshot.health}`;
    const reply = await enhanceBattleNarrative(response.narrative, command, context, controller.signal);

    if (!controller.signal.aborted && gameSessionRef.current === sessionId) {
      setAiSource(reply.source);
      setAiFailure(reply.failure);
      if (reply.source === 'cloudflare') {
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

    
    if (response.attackLocation) {
        setAttackLocation(response.attackLocation);
    }

    if (response.eventTriggered === 'attack' && !isShortChapter(logStats) && statsRef.current.tutorialStep >= 3) {
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
        if (typeof newStats.fatigue === 'number') newStats.fatigue = Math.floor(Math.min(100, Math.max(0, newStats.fatigue)));
        if (typeof newStats.searchExhaustion === 'number') newStats.searchExhaustion = Math.floor(Math.min(6, Math.max(0, newStats.searchExhaustion)));
        
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
        
        // Menus, blocked commands and pending event choices do not move enemy
        // operations. Only actions that consume battlefield time advance turns.
        newStats.turnCount = (prev.turnCount || 0) + (response.turnAdvanced ? 1 : 0);

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

  const handleNewGame = (chapterId: ChapterId = selectedChapter) => {
    let existing;
    try { existing = readChapterAutoSave(localStorage, chapterId); }
    catch { /* Starting a local game remains possible without persistent storage. */ }
    if (existing && !existing.stats.isGameOver && !window.confirm(`重新开始${getChapter(chapterId).title}会覆盖本关自动档。其他章节与5个手动档案保留。确认重新开始吗？`)) {
      return;
    }
    playSound('click');
    cancelNarrativeEnhancement();
    gameSessionRef.current += 1;
    const initialStats = createInitialStats(undefined, chapterId, selectedTactics[chapterId]);
    setSelectedChapter(chapterId);
    statsRef.current = initialStats;
    setStats(initialStats);
    setLogs([]);
    setView('GAME');
    setShowGameMenu(false);
    setShowGameOverModal(false);
    setCurrentDilemma(null);
    setAttackLocation(null);
    setShowBattleMapHint(false);
    setShowMap(false);
    setShowAdvisor(false);
    setShowTacticPreview(false);
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
    try { writeAutoSave(localStorage, statsRef.current, logs); }
    catch { if (!window.confirm('自动存档写入失败，返回选关可能丢失本次进度。仍要返回吗？')) return false; }
    playSound('click');
    cancelNarrativeEnhancement();
    gameSessionRef.current += 1;
    setView('MENU');
    setShowGameMenu(false);
    setConfirmExit(false);
    setShowGameOverModal(false); 
    setShowTacticPreview(false);
    refreshSaveSlots();
    loadAchievements();
    return true;
  };

  const handleCommand = async (e?: React.FormEvent, directCommand?: string, displayLabel?: string) => {
    if (e) e.preventDefault();
    
    const userCmd = directCommand || input.trim();
    const logText = displayLabel || (userCmd.length>500 ? '[超长输入：'+userCmd.length+'字，本次未执行]' : userCmd);

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
        const sessionId = gameSessionRef.current;
        if (!isShortChapter(currentStats) && !directCommand && aiEnabled && isAiConfigured() && currentStats.tutorialStep >= 3
          && !resolveNaturalCommand(currentStats, userCmd)
          && getActionPreview(currentStats, userCmd)?.action === '交谈 / 询问'
          && !/撤退|撤离|逃跑|confirm_|card_|evt_/.test(userCmd)) {
          const controller = new AbortController();
          aiAbortRef.current?.abort();
          aiAbortRef.current = controller;
          setIsInterpreting(true);
          const interpretation = await interpretUnknownCommand(userCmd, currentStats, controller.signal);
          if (controller.signal.aborted || gameSessionRef.current !== sessionId || statsRef.current !== currentStats) return;
          setAiFailure(interpretation.failure);
          const interpreted = interpretation.order;
          if (interpreted) {
            setAiSource('cloudflare');
            const preview = interpreted.command ? getActionPreview(currentStats, interpreted.command) : null;
            handleGameResponse({ narrative: `【AI 副官${interpreted.command ? ' · 尚未执行军令' : ''}】\n${interpreted.reply}`, updatedStats: {}, eventTriggered: 'none',
              dilemma: interpreted.command ? { id: 'ai_order_confirmation', title: '确认副官理解的军令', description: `${interpreted.reply}\n${preview?.short || ''}\n${preview?.reason || ''}`, options: [{ label: '确认执行', actionCmd: interpreted.command }, { label: '取消', actionCmd: 'cancel_retreat' }] } : undefined,
            }, createLogId());
            return;
          }
          setAiSource('local');
        }
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
        setIsInterpreting(false);
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
      handleCommand(undefined, cmd, title);
  };

  const toggleAiEnhancement = () => {
    if (IS_STATIC_HOSTING || isShortChapter(stats)) return;
    const next = !aiEnabled;
    setAiFailure(undefined);
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

  const shortChapter = isShortChapter(stats);
  const nextChapter = getChapter(stats.chapterId).next;
  const aiStatusLabel = shortChapter ? '本关使用本地引擎' : IS_STATIC_HOSTING
    ? '本地模式 · AI 未配置'
    : !aiEnabled
    ? 'AI 已关闭'
    : isInterpreting
      ? 'AI 正在理解'
    : isEnhancing
      ? 'AI 润色中'
      : aiSource === 'cloudflare'
        ? '本次 AI 回复成功'
        : aiSource === 'local'
          ? 'AI 暂不可用 · 本地回复'
          : 'AI 副官已开启';

  const actionPreview = stats.isGameOver || currentDilemma ? null : getActionPreview(stats, input);

  const prepareCommand = (command: string) => {
    setInput(command);
    setShowCommands(false);
    setShowMap(false);
    requestAnimationFrame(() => {
      if (!document.querySelector('[aria-modal="true"], dialog[open]')) inputRef.current?.focus();
    });
  };
  const commandDisabled = isLoading || !!currentDilemma || stats.isGameOver;
  const tutorialTarget = !shortChapter && (stats.tutorialStep === 1 ? '加固一楼入口' : stats.tutorialStep === 2 ? '休息整顿' : '');
  return (
    <div className={`game-shell night-archive-app readable-panel relative mx-auto flex h-[100dvh] w-full flex-col overflow-hidden border-x border-neutral-800 shadow-2xl ${containerEffectClass}`}>
      
      {/* Modals */}
      {showSaveLoadModal && (
          <SaveLoadModal 
            mode={modalMode} 
            slots={saveSlots} 
            autoSave={autoSaveMeta}
            onClose={() => setShowSaveLoadModal(false)}
            onSelectAutoSave={() => handleLoadAutoSave()}
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
          <DilemmaModal dilemma={currentDilemma} stats={stats} onSaveExit={() => {
              if (handleConfirmExit()) setCurrentDilemma(null);
          }} onChoice={(cmd) => {
              const opt = currentDilemma.options.find(o => o.actionCmd === cmd);
              handleDilemmaChoice(cmd, opt?.label || "做出选择");
          }} />
      )}
      
      {view === 'GAME' && showEncounterDetails && !stats.isGameOver && !currentDilemma && !showTacticPreview && !showGameMenu && !showAdvisor && !showSaveLoadModal && stats.activeTacticalCard && (
          <TacticalCardDisplay 
              card={TACTICAL_CARDS.find(card => card.id === stats.activeTacticalCard!.id) ?? stats.activeTacticalCard}
              onExecute={(cmd) => { setShowEncounterDetails(false); handleTacticalCardExecute(cmd, '接受战地际遇'); }}
              onDecline={() => { setShowEncounterDetails(false); handleCommand(undefined, 'encounter_skip', '放弃本次际遇'); }}
              onClose={() => setShowEncounterDetails(false)}
          />
      )}
      {view === 'GAME' && showTacticPreview && !stats.isGameOver && <TacticUseModal key={stats.campaignId} stats={stats}
        onClose={() => setShowTacticPreview(false)} onExecute={(command, label) => {
          setShowTacticPreview(false); handleCommand(undefined, command, label);
        }} />}

      {/* NEW: Game Over Modal - Triggered by Delayed State */}
      {showGameOverModal && (
          <GameOverModal 
            stats={stats} 
            onRestart={() => handleNewGame(stats.chapterId)}
            onExit={handleConfirmExit} 
            onReview={() => setShowGameOverModal(false)}
            onNext={nextChapter ? () => { if (handleConfirmExit()) setSelectedChapter(nextChapter); } : undefined}
          />
      )}
      
      <AdvisorChat key={stats.chapterId} isOpen={showAdvisor} onClose={() => setShowAdvisor(false)} stats={stats} aiEnabled={!shortChapter && aiEnabled} />

      {view === 'MENU' ? (
          <StartScreen 
            onNewGame={() => handleNewGame()}
            onContinueAutoSave={() => handleLoadAutoSave()}
            onContinueChapter={() => handleLoadAutoSave(selectedChapter)}
            onSelectChapter={setSelectedChapter}
            selectedChapter={selectedChapter}
            selectedTactic={selectedTactics[selectedChapter]}
            onSelectTactic={id => setSelectedTactics(previous => ({ ...previous, [selectedChapter]: id }))}
            chapterSaves={chapterSaves}
            archive={chapterArchive}
            recentSave={autoSaveMeta}
            onOpenLoadMenu={openLoadModal} 
            hasSaves={hasAnySave()} 
            unlockedAchievements={unlockedAchievements}
          />
      ) : (
        <>
            <BattleMasthead stats={stats} onMenu={() => { playSound('click'); setConfirmExit(false); setShowGameMenu(true); }} />
            {shortChapter ? <ChapterMissionPanel key={stats.campaignId} stats={stats} /> : <StatsPanel key={stats.campaignId} stats={stats} />}

            {showGameMenu && <GameDialog title="战时菜单" onClose={() => { setShowGameMenu(false); setConfirmExit(false); }} className="menu-dialog">
              {!confirmExit ? <div className="menu-actions">
                <button type="button" onClick={() => setShowGameMenu(false)}>返回前线</button>
                <button type="button" onClick={openSaveModal}>保存进度</button>
                <button type="button" onClick={() => {
                  const next = !soundEnabled; persistSoundEnabled(next); setSoundEnabled(next); if (next) playSound('click');
                }}>本地音效：{soundEnabled ? '开启' : '关闭'}</button>
                <button type="button" onClick={toggleAiEnhancement} disabled={IS_STATIC_HOSTING || shortChapter} aria-pressed={aiEnabled && !shortChapter}>
                  {aiStatusLabel}
                </button>
                <p className="tool-explanation">{shortChapter ? '本关使用本地规则与对白，不发送模型请求。' : IS_STATIC_HOSTING ? 'AI 网关尚未配置；本地军令和战斗完整可用。' : 'AI 关闭时不请求模型。开启后，陌生输入与精简战况会经网关发送；AI 军令须确认，失败回退本地。不会发送完整存档或身份资料。'}</p>
                <button type="button" onClick={handleExitRequest}>返回主菜单</button>
              </div> : <div className="menu-actions">
                <p>确定要返回主菜单吗？最近一次命令已经自动保存。</p>
                <button type="button" className="state-warning" onClick={handleConfirmExit}>确认返回</button>
                <button type="button" onClick={() => setConfirmExit(false)}>取消</button>
              </div>}
            </GameDialog>}

            {showCommands && <GameDialog title="军令簿" onClose={() => setShowCommands(false)}>
              <p className="tool-explanation">选择只填入军令，核对预览后再发送。查询与交谈不耗时；有效行动推进战场。</p>
              {!shortChapter && <TutorialGuide stats={stats} disabled={commandDisabled} onSkip={() => { setShowCommands(false); handleCommand(undefined, 'skip_tutorial', '跳过教程'); }} />}
              {shortChapter
                ? <ChapterMissionActions stats={stats} disabled={commandDisabled} onAction={prepareCommand} />
                : <QuickActions stats={stats} disabled={commandDisabled} onAction={prepareCommand} />}
              {stats.equippedTactic && <TacticStatus stats={stats} disabled={commandDisabled} onPreview={() => { setShowCommands(false); setShowTacticPreview(true); }} />}
              {stats.activeTacticalCard && <button type="button" className="encounter-entry" disabled={commandDisabled}
                onClick={() => { setShowCommands(false); setShowEncounterDetails(true); }}>战地际遇 · {TACTICAL_CARDS.find(card => card.id === stats.activeTacticalCard!.id)?.title ?? stats.activeTacticalCard.title} · 查看</button>}
              {shortChapter ? <p className="tool-explanation">可询问任务、战况和行动规则；撤离需再次确认。输入一次一条命令。</p> : <LocalCommandGuide onFill={prepareCommand} />}
            </GameDialog>}
            {!shortChapter && showMap && <GameDialog title="阵地地图" onClose={() => setShowMap(false)} className="map-dialog">
              <p className="tool-explanation">只显示已知敌情。地图军令先填入，核对预览后再发送。</p>
              <TacticalMap stats={stats} onAction={prepareCommand} attackLocation={attackLocation} />
            </GameDialog>}

            <div 
                ref={scrollRef}
                className="battle-log min-h-0 flex-1 space-y-5 overflow-y-auto scroll-smooth"
                aria-label="作战记录"
                role="region"
                tabIndex={0}
                onClick={() => {
                    const lastLog = logs[logs.length - 1];
                    if (lastLog?.isTyping) finishTyping(lastLog.id);
                }}
            >
                <div className="journal-heading"><h1>{getChapter(stats.chapterId).subtitle}</h1><span>作战记录</span></div>
                {!shortChapter && <p className="journal-objective">本章任务 · {getChapter(stats.chapterId).objective}</p>}
                {!shortChapter && showBattleMapHint && <aside className="journal-map-hint" role="status">
                  <p>战场提示：地图标出已知交战位置。调兵和加固会消耗行动时间。</p>
                  <button type="button" onClick={() => { setShowMap(true); setShowBattleMapHint(false); }}>打开地图</button>
                  <button type="button" onClick={() => setShowBattleMapHint(false)}>知道了</button>
                </aside>}
                {logs.map((log) => (
                <div 
                    key={log.id} 
                    className={`flex flex-col ${log.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                    {log.sender === 'user' && log.day !== undefined && log.time && (
                        <div className="mb-1.5 text-[11px] font-mono font-bold text-neutral-500">{shortChapter ? getChapter(stats.chapterId).title : `第${log.day}天`} · {log.time}</div>
                    )}
                    <div className={`max-w-[95%] sm:max-w-[90%] ${
                    log.sender === 'user' 
                        ? 'rounded-r border-l-2 border-neutral-500 bg-neutral-900/40 py-2 pr-3 pl-3 text-sm font-bold text-neutral-300'
                        : 'war-prose text-base leading-7 text-neutral-200 sm:leading-8'
                    }`}>
                    {log.sender === 'system' && log.isTyping ? (
                        <>
                            <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); finishTyping(log.id); }}
                                className="mb-3 flex min-h-11 items-center rounded border border-neutral-700 px-3 align-middle text-xs leading-none text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                            >
                                跳过
                            </button>
                            <Typewriter
                                text={log.text}
                                speed={15}
                                onComplete={() => finishTyping(log.id)}
                            />
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

            <div className="command-dock">
              {!stats.isGameOver && !input.trim() && <div className="dock-suggestions">
                <div className="featured-command-row">
                  {shortChapter ? <ChapterMissionActions stats={stats} disabled={commandDisabled} onAction={prepareCommand} featured />
                    : <QuickActions stats={stats} disabled={commandDisabled} onAction={prepareCommand} featured />}
                  <button type="button" className="all-orders" onClick={() => setShowCommands(true)}><b>全部军令</b><span>{tutorialTarget ? '教学与说明 →' : '先看代价 →'}</span></button>
                </div>
              </div>}
              {!shortChapter && aiEnabled && aiFailure && !isInterpreting && <p role="status" className="ai-failure-note">{describeAiFailure(aiFailure)} 当前使用本地回复，游戏仍可继续。</p>}
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
                    <label id="order-help" className="composer-label" htmlFor="order-input">{tutorialTarget ? `教学目标：${tutorialTarget} · 选择后发送` : '军令或对话 · 选择军令后，核对预览再发送'}</label>
                    <ActionPreviewBar preview={actionPreview} compact />

                    <form onSubmit={(e) => handleCommand(e)} className="command-form relative flex gap-2">
                    <input
                        ref={inputRef}
                        id="order-input"
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onCompositionStart={() => isComposing.current = true}
                        onCompositionEnd={() => isComposing.current = false}
                        placeholder={stats.isGameOver ? "本局已结束，可复盘战报" : (currentDilemma ? "请先完成当前选择" : "下令，或说两句话")}
                        aria-label="军令或对话"
                        aria-describedby="order-help"
                        disabled={stats.isGameOver || !!currentDilemma}
                        autoComplete="off"
                        autoCorrect="off"
                        className="min-h-11 min-w-0 flex-1 rounded-sm border border-neutral-600 bg-neutral-950 py-2.5 px-3 text-base text-neutral-100 placeholder-neutral-400 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading || stats.isGameOver || !!currentDilemma}
                        className="send-order min-h-11 shrink-0 whitespace-nowrap rounded-sm px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {isLoading ? '...' : '发送'}
                    </button>
                    </form>

                  </>
                )}
                <nav className="dock-tools" aria-label="战地工具">
                  {!shortChapter && <button type="button" onClick={() => setShowMap(true)} aria-haspopup="dialog">阵地</button>}
                  <button type="button" onClick={() => setShowAdvisor(true)} aria-haspopup="dialog">顾问</button>
                  {!stats.isGameOver && <button type="button" onClick={() => setShowCommands(true)} aria-haspopup="dialog">军令{stats.activeTacticalCard ? ' · 际遇' : stats.equippedTactic ? ' · 战术' : ''}</button>}
                  <span title={aiStatusLabel}>{shortChapter || IS_STATIC_HOSTING || !aiEnabled ? '本地引擎 · 交谈不耗时' : aiStatusLabel}</span>
                </nav>
            </div>
        </>
      )}
    </div>
  );
};

export default App;
