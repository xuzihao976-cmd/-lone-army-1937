import type { Dilemma, GameStats, Location } from '../types';
import { playSound } from '../utils/sound';
import { BUILD_SCENES, COMMAND_RESPONSES, HEAL_SUCCESS_SCENES, SPEECH_SCENES } from '../data/text/commands';
import { ALL_DILEMMAS, MUTINY_SCENES } from '../data/text/events';
import { ENDING_TEXTS } from '../data/text/endings';
import { pickWith, type RandomSource } from './commandUtils';
import { calculateCampaignScore } from './endings/campaignScore';
import { reconcileSoldierDistribution } from './roster';
import { eligibleBattlefieldEncounters } from './tacticalCards';
import { canOfferEvent, issueEvent, presentEvent } from './eventPlans';
import { EVENT_RULES } from '../data/eventRules';
import { resolveDilemma } from './dilemmaResolver';

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
  allowDilemmas?: boolean;
  checkCollapse?: boolean;
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
  allowDilemmas = true,
  checkCollapse = false,
}: FinalizeTurnInput): FinalizeTurnResult => {
  const pick = <T>(items: T[]): T => pickWith(items, random);
  let eventTriggered = initialEvent;
  let visualEffect = initialVisualEffect;
  const combatantsNow = () => (calculatedStats.soldiers ?? currentStats.soldiers)
    + (calculatedStats.hmgSquads ?? currentStats.hmgSquads).reduce((n, squad) => n + (squad.status === 'active' ? squad.count : 0), 0);

  const finalMorale = calculatedStats.morale ?? currentStats.morale;
  if (allowRandomEvents && combatantsNow() > 0 && !calculatedStats.isGameOver && finalMorale < 30 && random() < 0.4) {
    narrativeParts.push('\n\n' + pick(MUTINY_SCENES));
    const lost = Math.floor(random() * 10) + 5;
    const soldiersBeforeLoss = calculatedStats.soldiers ?? currentStats.soldiers;
    calculatedStats.soldiers = Math.max(0, soldiersBeforeLoss - lost);
    statsLog.push(`🏃 逃兵/失踪: ${soldiersBeforeLoss - calculatedStats.soldiers}人`);
  }

  if (allowRandomEvents && combatantsNow() > 0 && !currentStats.activeTacticalCard && random() < 0.1 && !calculatedStats.isGameOver) {
    const used = calculatedStats.usedTacticalCards || currentStats.usedTacticalCards || [];
    const availableCards = eligibleBattlefieldEncounters({ ...currentStats, ...calculatedStats, usedTacticalCards: used }, actionType);
    if (availableCards.length > 0) {
      const newCard = pick(availableCards);
      calculatedStats.activeTacticalCard = newCard;
      calculatedStats.usedTacticalCards = [...used, newCard.id];
      statsLog.push(`战地际遇：${newCard.title}`);
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
  const flagRaised = (calculatedStats.hasFlagRaised ?? currentStats.hasFlagRaised ?? false) || (calculatedStats.consequenceFlags || currentStats.consequenceFlags || []).includes('roof_flag_beacon');
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
  } else if (finalDay > 5 && finalCombatants > 0) {
    calculatedStats.isGameOver = true;
    calculatedStats.gameResult = 'victory_hold';
    calculatedStats.gameOverReason = 'mission_complete';
    eventTriggered = 'victory';
    const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'victory_hold');
    calculatedStats.finalRank = report.rank;
    narrativeParts.push(`\n\n${ENDING_TEXTS.hold}\n${report.text}`);
  } else if ((allowRandomEvents || checkCollapse) && collapseDetected && !immediateCollapse && !lastStandAlreadyUsed) {
    calculatedStats.lastStandUsed = true;
    calculatedStats.siegeMeter = Math.min(35, calculatedStats.siegeMeter ?? currentStats.siegeMeter);
    visualEffect = 'heavy-damage';
    const collapseWarning = forceCollapsed
      ? `可战兵力只剩 ${finalCombatants} 人`
      : '一楼、二楼与地下室已经全部失守';
    narrativeParts.push(`\n\n【最后防线】\n${collapseWarning}，但残余守军仍在抵抗。副官为你争取到一次补救机会：立即救治伤员或从仍控制的楼层发动反攻，夺回一个核心防区；若局面仍未恢复，战役才会结束。`);
    statsLog.push('⚠ 最后防线已启用：本局仅有一次补救机会');
  } else if (collapseDetected && (allowRandomEvents || checkCollapse || immediateCollapse)) {
    calculatedStats.isGameOver = true;
    eventTriggered = 'game_over';
    visualEffect = 'heavy-damage';
    calculatedStats.gameOverReason = forceCollapsed && corePositionsLost
      ? 'total_collapse'
      : forceCollapsed
        ? 'combat_force_collapsed'
        : 'position_collapsed';

    if (flagRaised && immediateCollapse) {
      calculatedStats.gameResult = 'defeat_martyr';
      const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_martyr');
      calculatedStats.finalRank = report.rank;
      narrativeParts.push(`\n\n${ENDING_TEXTS.martyr}\n${report.text}`);
    } else if (aggression > 3) {
      calculatedStats.gameResult = 'defeat_assault';
      const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_assault');
      calculatedStats.finalRank = report.rank;
      narrativeParts.push(`\n\n${ENDING_TEXTS.assault}\n${report.text}`);
    } else {
      calculatedStats.gameResult = 'defeat_generic';
      const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_generic');
      calculatedStats.finalRank = report.rank;
      const collapseText = forceCollapsed && corePositionsLost
        ? `可战兵力只剩 ${finalCombatants} 人，核心楼层也已全部失守，已经无法继续成建制抵抗。`
        : forceCollapsed
          ? `可战兵力只剩 ${finalCombatants} 人，已经无法覆盖各处防线。现存伤员 ${finalWounded} 人，成建制防守宣告结束。`
          : `一楼、二楼与地下室相继失守，仓库纵深已被敌军切断。现存可战人员 ${finalCombatants} 人、伤员 ${finalWounded} 人，但核心阵地已经无法恢复。`;
      narrativeParts.push(`\n\n【战役结束】\n${collapseText}\n\n作战图上还有线，线后却已经接不上足够的人或阵地。失败不替任何人的死亡作证明；伤员、失散与残余守军，都只能按现有记录分别登记。\n\n本局指挥评价：${report.rank}\n${report.text}`);
    }
  } else if (finalDay > 5) {
    calculatedStats.isGameOver = true;
    calculatedStats.gameResult = 'victory_hold';
    calculatedStats.gameOverReason = 'mission_complete';
    eventTriggered = 'victory';
    const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'victory_hold');
    calculatedStats.finalRank = report.rank;
    narrativeParts.push(`\n\n${ENDING_TEXTS.hold}\n${report.text}`);
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
  const projectedTurn = currentStats.turnCount + 1;
  if (allowRandomEvents && allowDilemmas && !calculatedStats.isGameOver && !eventTriggered.includes('attack')
    && projectedTurn - (currentStats.lastDilemmaTurn ?? -999) >= EVENT_RULES.cooldownTurns) {
    const offeredState = { ...currentStats, ...calculatedStats, day: finalDay, turnCount: projectedTurn };
    const candidates = ALL_DILEMMAS.filter(event => canOfferEvent(offeredState, event));
    const followUps = candidates.filter(event => event.requiresFlag);
    const pool = followUps.length ? followUps : random() < 0.2 ? candidates : [];
    if (pool.length) {
      const event = pick(pool);
      const ticket = issueEvent(offeredState, event.id);
      if (event.presentation === 'notice') {
        const notice = resolveDilemma({ ...offeredState, ...ticket }, event.id, 0, random, () => {});
        Object.assign(calculatedStats, ticket, notice.updatedStats);
        narrativeParts.push('\n\n' + notice.narrative);
      } else {
        Object.assign(calculatedStats, ticket);
        dilemma = presentEvent(offeredState, event);
      }
    }
  }

  let narrative = narrativeParts.join('');
  if (statsLog.length > 0) narrative += '\n\n━━━━━━━━━━━━━━\n' + statsLog.join('\n');

  return { narrative, eventTriggered, visualEffect, dilemma };
};
