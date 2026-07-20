import type { Dilemma, GameStats, Location } from '../types';
import { playSound } from '../utils/sound';
import { BUILD_SCENES, COMMAND_RESPONSES, HEAL_SUCCESS_SCENES, SPEECH_SCENES } from '../data/text/commands';
import { ALL_DILEMMAS, MUTINY_SCENES, TACTICAL_CARDS } from '../data/text/events';
import { pickWith, type RandomSource } from './commandUtils';
import { calculateCampaignScore } from './endings/campaignScore';
import { reconcileSoldierDistribution } from './roster';

type TurnEvent = 'attack' | 'new_day' | 'none' | 'game_over' | 'victory';
type VisualEffect = 'shake' | 'heavy-damage' | 'none';

interface FinalizeTurnInput {
  currentStats: GameStats;
  calculatedStats: Partial<GameStats>;
  actionType: string;
  attackLocation: Location | null;
  eventTriggered: TurnEvent;
  visualEffect: VisualEffect;
  narrativeParts: string[];
  statsLog: string[];
  random: RandomSource;
  allowRandomEvents: boolean;
}

interface FinalizeTurnResult {
  narrative: string;
  eventTriggered: TurnEvent;
  visualEffect: VisualEffect;
  dilemma?: Dilemma;
}

/**
 * Applies end-of-turn events, defeat/victory checks and final narrative
 * formatting. The mutable calculatedStats object is intentionally shared with
 * the engine so every settlement has one authoritative result object.
 */
export const finalizeTurn = ({
  currentStats,
  calculatedStats,
  actionType,
  attackLocation,
  eventTriggered: initialEvent,
  visualEffect: initialVisualEffect,
  narrativeParts,
  statsLog,
  random,
  allowRandomEvents,
}: FinalizeTurnInput): FinalizeTurnResult => {
  const pick = <T>(items: T[]): T => pickWith(items, random);
  let eventTriggered = initialEvent;
  let visualEffect = initialVisualEffect;

  const finalMorale = calculatedStats.morale ?? currentStats.morale;
  if (allowRandomEvents && !calculatedStats.isGameOver && finalMorale < 30 && random() < 0.4) {
    narrativeParts.push('\n\n' + pick(MUTINY_SCENES));
    const lost = Math.floor(random() * 10) + 5;
    calculatedStats.soldiers = Math.max(0, (calculatedStats.soldiers ?? currentStats.soldiers) - lost);
    statsLog.push(`🏃 逃兵/失踪: ${lost}人`);
  }

  if (allowRandomEvents && !currentStats.activeTacticalCard && random() < 0.1 && !calculatedStats.isGameOver) {
    const used = calculatedStats.usedTacticalCards || currentStats.usedTacticalCards || [];
    const availableCards = TACTICAL_CARDS.filter((card) => !used.includes(card.id));
    if (availableCards.length > 0) {
      const newCard = pick(availableCards);
      calculatedStats.activeTacticalCard = newCard;
      calculatedStats.usedTacticalCards = [...used, newCard.id];
      statsLog.push(`🃏 触发战机: ${newCard.title}`);
      playSound('alert');
    }
  }

  const finalSoldiers = calculatedStats.soldiers ?? currentStats.soldiers;
  calculatedStats.soldierDistribution = reconcileSoldierDistribution(
    calculatedStats.soldierDistribution || currentStats.soldierDistribution,
    finalSoldiers,
    attackLocation || calculatedStats.location || currentStats.location,
  );
  const finalDay = calculatedStats.day ?? currentStats.day;
  const aggression = calculatedStats.aggressiveCount ?? currentStats.aggressiveCount ?? 0;
  const flagRaised = calculatedStats.hasFlagRaised ?? currentStats.hasFlagRaised ?? false;
  const finalHmgSquads = calculatedStats.hmgSquads || currentStats.hmgSquads;
  const activeHmgCrew = finalHmgSquads.reduce(
    (sum, squad) => sum + (squad.status === 'active' ? squad.count : 0),
    0,
  );
  const finalCombatants = finalSoldiers + activeHmgCrew;
  const finalWounded = calculatedStats.wounded ?? currentStats.wounded;
  const forceCollapsed = finalCombatants < 20;
  const finalSectorIntegrity = calculatedStats.sectorIntegrity || currentStats.sectorIntegrity;
  const corePositionsLost = finalSectorIntegrity['一楼入口'] <= 0
    && finalSectorIntegrity['二楼阵地'] <= 0
    && finalSectorIntegrity['地下室'] <= 0;
  const collapseDetected = forceCollapsed || corePositionsLost;
  const immediateCollapse = finalCombatants <= 0;
  const lastStandAlreadyUsed = calculatedStats.lastStandUsed ?? currentStats.lastStandUsed ?? false;

  if (calculatedStats.gameOverReason === 'commander_killed') {
    eventTriggered = 'game_over';
    visualEffect = 'heavy-damage';
  } else if (collapseDetected && !immediateCollapse && !lastStandAlreadyUsed) {
    calculatedStats.lastStandUsed = true;
    calculatedStats.siegeMeter = Math.min(35, calculatedStats.siegeMeter ?? currentStats.siegeMeter);
    visualEffect = 'heavy-damage';
    const collapseWarning = forceCollapsed
      ? `可战兵力只剩 ${finalCombatants} 人`
      : '一楼、二楼与地下室已经全部失守';
    narrativeParts.push(`\n\n【最后防线】\n${collapseWarning}，但残余守军仍在抵抗。副官为你争取到一次补救机会：立即救治伤员或从仍控制的楼层发动反攻，夺回一个核心防区；若局面仍未恢复，战役才会结束。`);
    statsLog.push('⚠ 最后防线已启用：本局仅有一次补救机会');
  } else if (collapseDetected) {
    calculatedStats.isGameOver = true;
    eventTriggered = 'game_over';
    visualEffect = 'heavy-damage';
    calculatedStats.gameOverReason = forceCollapsed && corePositionsLost
      ? 'total_collapse'
      : forceCollapsed
        ? 'combat_force_collapsed'
        : 'position_collapsed';

    if (aggression > 3) {
      calculatedStats.gameResult = 'defeat_assault';
      const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_assault');
      calculatedStats.finalRank = report.rank;
      narrativeParts.push(`\n\n【反攻失败】\n连续主动出击耗尽了最后的成建制战斗力量。仍有伤员和失散士兵活着，但四行仓库已经无法继续防守。\n\n结局达成：【反攻的号角】\n${report.text}`);
    } else if (flagRaised && immediateCollapse && finalWounded <= 0) {
      calculatedStats.gameResult = 'defeat_martyr';
      const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_martyr');
      calculatedStats.finalRank = report.rank;
      narrativeParts.push(`\n\n【壮烈殉国】\n四行仓库被攻破了。但在顶楼，那面旗帜依然在硝烟中飘扬。日军指挥官看着旗帜，久久没有下令降旗。\n\n结局达成：【血染孤旗】\n${report.text}`);
    } else {
      calculatedStats.gameResult = 'defeat_generic';
      const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_generic');
      calculatedStats.finalRank = report.rank;
      const collapseText = forceCollapsed && corePositionsLost
        ? `可战兵力只剩 ${finalCombatants} 人，核心楼层也已全部失守。残余人员被迫停止成建制抵抗。`
        : forceCollapsed
          ? `可战兵力只剩 ${finalCombatants} 人，已经无法覆盖各处防线。伤员和幸存者仍在，但成建制防守宣告结束。`
          : `一楼、二楼与地下室相继失守，仓库纵深已被敌军切断。仍有 ${finalCombatants} 名可战人员与伤员幸存，但阵地已经无法恢复。`;
      narrativeParts.push(`\n\n【战役结束】\n${collapseText}\n\n最终军衔评价：${report.rank}\n${report.text}`);
    }
  } else if (finalDay > 5) {
    calculatedStats.isGameOver = true;
    calculatedStats.gameResult = 'victory_hold';
    calculatedStats.gameOverReason = 'mission_complete';
    eventTriggered = 'victory';
    const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'victory_hold');
    calculatedStats.finalRank = report.rank;
    narrativeParts.push(`\n\n【战役胜利】\n你坚守了整整六天。在全世界的注视下，孤军完成了不可能的任务。\n\n结局达成：【固若金汤】\n${report.text}`);
  }

  let responseText = '';
  if (actionType === 'move') responseText = pick(COMMAND_RESPONSES.MOVE).replace('{dest}', calculatedStats.location || '');
  else if (actionType === 'build') responseText = pick(BUILD_SCENES);
  else if (actionType === 'build_max') responseText = pick(COMMAND_RESPONSES.BUILD_MAX);
  else if (actionType === 'rest') responseText = pick(COMMAND_RESPONSES.REST);
  else if (actionType === 'heal') responseText = pick(HEAL_SUCCESS_SCENES);
  else if (actionType === 'heal_fail') responseText = pick(COMMAND_RESPONSES.HEAL_FAIL);
  else if (actionType === 'flag_warn') responseText = pick(COMMAND_RESPONSES.FLAG_WARN);
  else if (actionType === 'flag_success') responseText = pick(COMMAND_RESPONSES.FLAG_SUCCESS);
  else if (actionType === 'speech') responseText = pick(SPEECH_SCENES);
  if (responseText) narrativeParts.unshift(responseText);

  let dilemma: Dilemma | undefined;
  if (allowRandomEvents && !calculatedStats.isGameOver && !eventTriggered.includes('attack') && random() < 0.2) {
    const alreadyTriggered = calculatedStats.triggeredEvents || currentStats.triggeredEvents || [];
    const flags = calculatedStats.consequenceFlags || currentStats.consequenceFlags || [];
    const potentialDilemmas = ALL_DILEMMAS.filter((candidate) =>
      !alreadyTriggered.includes(candidate.id)
      && (!candidate.requiresFlag || flags.includes(candidate.requiresFlag))
      && (!candidate.excludesFlag || !flags.includes(candidate.excludesFlag))
      && (candidate.minDay === undefined || finalDay >= candidate.minDay));
    if (potentialDilemmas.length > 0) dilemma = pick(potentialDilemmas);
  }

  let narrative = narrativeParts.join('');
  if (statsLog.length > 0) narrative += '\n\n━━━━━━━━━━━━━━\n' + statsLog.join('\n');

  return { narrative, eventTriggered, visualEffect, dilemma };
};
