
import { canonicalCommand, resolveNaturalCommand } from './naturalCommands';
import { compactCommand, isExecutableLocalAction } from './commandLanguage';
import { ALL_DILEMMAS } from '../data/text/events';
import { GameStats, GameTurnResult, Location } from "../types";
import { playSound } from "../utils/sound";
import { isExplicitRetreatCommand } from './intents';
import { getDayProfile } from '../data/dayProfiles';
import { buildTurnSummary } from './turnSummary';
import { advanceCampaignClock, formatCampaignDate } from './time';
import { type AttackScale, type DamageType } from './combat';
import { createEnemyOperation, getOperationIntel, projectEnemyOperation } from './battlefield';
import { resolveTacticalCard } from './tacticalCards';
import { appendCampaignHistory } from './campaignProgress';
import { resolveDilemma } from './dilemmaResolver';
import { pickWith, type RandomSource } from './commandUtils';
import { applyNamedSoldierDeaths } from './roster';
import { calculateCampaignScore } from './endings/campaignScore';
import { resolvePlayerAction } from './actions/resolvePlayerAction';
import { resolveAttack } from './combatResolution/resolveAttack';
import { finalizeTurn } from './turnFinalizer';
import { isSectorHeld } from './strategicDefense';
import { isShortChapter } from '../data/chapters';
import { resolveChapterTurn } from './chapterEngine';

// Import Narrative Data Modules
import { WOUNDED_DEATH_SCENES } from "../data/text/combat";
import { ENDING_TEXTS } from '../data/text/endings';



// --- Helper Functions ---

let activeRandomSource: RandomSource = Math.random;
const random = (): number => activeRandomSource();

const createSeededRandom = (seed: number) => {
    let state = seed >>> 0 || 0x19371026;
    return {
        next: () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        },
        getState: () => state >>> 0,
    };
};

const pick = <T>(items: T[]): T => pickWith(items, random);


// --- Main Logic ---

const runGameTurnInternal = (
  currentStats: GameStats,
  userCommand: string
): GameTurnResult => {
    if (isShortChapter(currentStats)) return resolveChapterTurn(currentStats, userCommand, random);
    
    let calculatedStats: Partial<GameStats> = {};
    let statsLog: string[] = []; 
    
    let eventTriggered: 'attack' | 'new_day' | 'none' | 'game_over' | 'victory' = "none";
    let visualEffect: 'shake' | 'heavy-damage' | 'none' = 'none';
    let attackLocation: Location | null = null;
    let narrativeParts: string[] = [];
    
    const cmd = canonicalCommand(userCommand);
    if (cmd.startsWith('confirm_') && currentStats.pendingRetreat !== cmd) return { narrative: '未收到有效的撤退确认请求，命令未执行。', updatedStats: {}, eventTriggered: 'none' };
    if (currentStats.isGameOver) return { narrative: '本次战役已结束。', updatedStats: {}, eventTriggered: 'none' };
    if (currentStats.day >= 6) {
      const final = finalizeTurn({currentStats, calculatedStats, actionType:'idle', attackLocation:null, eventTriggered:'none', visualEffect:'none', narrativeParts, statsLog, random, allowRandomEvents:false});
      return {narrative:final.narrative, updatedStats:calculatedStats,eventTriggered:final.eventTriggered};
    }

    if (userCommand.length>500) {
      const r=resolveNaturalCommand(currentStats,userCommand)!;
      return {narrative:r.narrative.join(''),updatedStats:r.updatedStats,eventTriggered:'none'};
    }

    // --- ENDING CHECK: RETREAT COMMANDS ---
    const isRetreat = isExplicitRetreatCommand(cmd);
    if (cmd === 'cancel_retreat') {
        return {
            narrative: '你取消了这项待确认命令。副官把确认单放下；没有撤离，也没有推进时间。',
            updatedStats: { pendingRetreat: null },
            eventTriggered: 'none'
        };
    }

    if (isRetreat && !currentStats.isGameOver) {
        // ENDING 3: Deserter (Day 0-1)
        if (currentStats.day <= 1) {
            return {
                narrative: '撤离阵地将立即结束本次战役，而且无法撤销。副官盯着你，等待最后命令。',
                updatedStats: { pendingRetreat: 'confirm_desertion' },
                eventTriggered: 'none',
                dilemma: {
                    id: 'confirm_desertion',
                    title: '确认放弃阵地？',
                    description: '战斗尚在初期。擅自撤离会被视为抛弃部队，并立即触发失败结局。',
                    options: [
                        { label: '确认撤离', actionCmd: 'confirm_desertion', riskText: '不可逆：结束战役' },
                        { label: '坚守阵地', actionCmd: 'cancel_retreat' }
                    ]
                }
            };
        }
        // ENDING 4: Historical Retreat (Day 4+)
        if (currentStats.day >= 4) {
            return {
                narrative: '本局已开放奉命撤退。副官把确认单推到你面前：“再核一遍，确认后就离开这场防守。”当前尚未撤离。',
                updatedStats: { pendingRetreat: 'confirm_historical_retreat' },
                eventTriggered: 'none',
                dilemma: {
                    id: 'confirm_historical_retreat',
                    title: '确认奉命撤退？',
                    description: '这会立即结束当前战役并进入“孤军撤退”结局。',
                    options: [
                        { label: '奉命撤退', actionCmd: 'confirm_historical_retreat', riskText: '不可逆：结束战役' },
                        { label: '继续坚守', actionCmd: 'cancel_retreat' }
                    ]
                }
            };
        }

        narrativeParts.push('副官核对了命令：“第4天起才能奉命撤退。”当前尚未开放，本次未撤离。');
        return {
            narrative: narrativeParts.join(""),
            updatedStats: { pendingRetreat: null },
            eventTriggered: 'none'
        };
    }

    if (cmd === 'confirm_desertion' && currentStats.pendingRetreat === cmd && currentStats.day <= 1 && !currentStats.isGameOver) {
            calculatedStats.isGameOver = true;
            calculatedStats.gameResult = 'defeat_deserter';
            calculatedStats.gameOverReason = 'early_retreat';
            eventTriggered = 'game_over';
            const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_deserter');
            calculatedStats.finalRank = report.rank;
            return {
                narrative: `${ENDING_TEXTS.earlyRetreat}\n${report.text}`,
                updatedStats: calculatedStats,
                eventTriggered: 'game_over',
                visualEffect: 'heavy-damage'
            };
    }

    if (cmd === 'confirm_historical_retreat' && currentStats.pendingRetreat === cmd && currentStats.day >= 4 && !currentStats.isGameOver) {
            calculatedStats.isGameOver = true;
            calculatedStats.gameResult = 'victory_retreat';
            calculatedStats.gameOverReason = 'historical_retreat';
            eventTriggered = 'victory';
            const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'victory_retreat');
            calculatedStats.finalRank = report.rank;
            return {
                narrative: `${ENDING_TEXTS.orderedRetreat}\n${report.text}`,
                updatedStats: calculatedStats,
                eventTriggered: 'victory'
            };
    }

    // --- Start Game ---
    if (cmd === "start_game") {
        if (currentStats.tutorialStep!==0 || currentStats.turnCount!==0 || currentStats.day!==0) return {narrative:'本局已经开始，不能用内部文字重置防线。',updatedStats:{},eventTriggered:'none'};
         calculatedStats.tutorialStep = 1; 
        calculatedStats.day = 0;
        calculatedStats.location = '一楼入口';
        calculatedStats.currentTime = "19:00"; 
        calculatedStats.triggeredEvents = []; 
        calculatedStats.usedTacticalCards = []; 
        calculatedStats.lastStandUsed = false;
        calculatedStats.gameOverReason = undefined;
        calculatedStats.sectorIntegrity = {
            '一楼入口': 100,
            '二楼阵地': 100,
            '屋顶': 100,
            '地下室': 100,
        };
        calculatedStats.sealedApproaches = [];
        calculatedStats.consequenceFlags = [];
        calculatedStats.campaignHistory = [];
        calculatedStats.fatigue = 12;
        calculatedStats.searchExhaustion = 0;
        calculatedStats.speechStreak = 0;
        calculatedStats.reconBonus = 0;
        playSound('radio'); 
        
        return {
            narrative: "1937年10月26日，19:00。上海闸北，四行仓库。\n\n雨水顺着军帽往领口里淌。你接过防务记录，纸角已经软了，里面却清清楚楚写着人和弹药的数目。\n\n副官等你看完，才指向一楼入口：“这里先补牢。人得有个能站住的地方。”\n\n完成下方两步引导后正式开战。本作含具体伤势、死亡与战地创伤；对白、可变战况及结局为游戏演绎，不作史料。",
            updatedStats: calculatedStats,
            eventTriggered: 'none',
            enemyIntel: "具体来袭路线尚未确证，先完成布防。"
        };
    }
    
    // --- Contextual two-step tutorial ---
    if (currentStats.tutorialStep > 0 && currentStats.tutorialStep < 3) {
        if (cmd === 'skip_tutorial' || compactCommand(cmd) === '跳过教程') {
            calculatedStats.tutorialStep = 3;
            calculatedStats.day = 1;
            calculatedStats.currentTime = "08:00";
            calculatedStats.siegeMeter = 20;
            calculatedStats.morale = Math.min(100, currentStats.morale + 15);
            calculatedStats.health = Math.min(100, currentStats.health + 10);
            calculatedStats.fortificationLevel = { ...currentStats.fortificationLevel, '一楼入口': 2 };
            calculatedStats.fortificationBuildCounts = { ...currentStats.fortificationBuildCounts, '一楼入口': 4 };
            playSound('click');
            return {
                narrative: "【教程已跳过】\n\n一楼工事与守军状态已按教程完成后的标准配置。10月27日，第一天，正式战斗开始。",
                updatedStats: calculatedStats,
                eventTriggered: 'new_day',
                enemyIntel: "第一天防务开始，具体攻势请通过侦察确认。"
            };
        }

        if (!isExecutableLocalAction(cmd)) {
          const r=resolveNaturalCommand(currentStats,userCommand);
          return {narrative:(r?.narrative.join('') || '军令不明确，本次未执行。')+'\n【教程提示】'+(currentStats.tutorialStep===1?'下一步加固一楼。':'下一步休息整顿。'),updatedStats:r?.timeCost===0?r.updatedStats:{},eventTriggered:'none'};
        }
        if (currentStats.tutorialStep === 1) {
            if ((cmd.includes('加固') || cmd.includes('修')) && cmd.includes('一楼')) {
                 calculatedStats.tutorialStep = 2;
                 calculatedStats.fortificationLevel = { ...currentStats.fortificationLevel, '一楼入口': 2 };
                 calculatedStats.fortificationBuildCounts = { ...currentStats.fortificationBuildCounts, '一楼入口': 4 };
                 calculatedStats.currentTime = "21:00";
                 playSound('click');
                 statsLog.push("🔨 一楼入口：加固掩体完成");
                 return {
                     narrative: "【第 1/2 步完成】\n\n新补的掩体压实了，出入的通道仍留着。工兵直起腰揉了揉手，副官看了一眼队列：“接下来轮休。别等站不住才让人歇。”\n\n现在点击下方发光的【休息】。",
                     updatedStats: calculatedStats,
                     eventTriggered: 'none',
                     visualEffect: 'shake'
                 };
            }
            return { narrative: "【新手引导 1/2】请先点击下方发光的【加固】。需要直接开战，也可以选择“跳过教程”。", updatedStats: {} };
        }
        if (currentStats.tutorialStep === 2) {
             if (cmd.includes('休息') || cmd.includes('睡') || cmd.includes('整顿')) {
                 calculatedStats.tutorialStep = 3;
                 calculatedStats.day = 1;
                 calculatedStats.currentTime = "08:00";
                 calculatedStats.siegeMeter = 20;
                 calculatedStats.morale = Math.min(100, currentStats.morale + 15);
                 calculatedStats.health = Math.min(100, currentStats.health + 10);
                 statsLog.push("💤 士气 +15");
                 if (calculatedStats.health !== currentStats.health) {
                     statsLog.push(`🏥 总结构: ${currentStats.health}% → ${calculatedStats.health}%`);
                 }
                 
                 playSound('click');
                 return {
                     narrative: `【新手引导完成】\n\n轮休结束，接班的人揉着脸站起来，先找自己的阵位。天亮了——10月27日，第一天。仓库里那些还不熟悉的声音，从现在起要彼此认得。\n\n💤 士气 ${currentStats.morale} → ${calculatedStats.morale}`,
                     updatedStats: calculatedStats,
                     eventTriggered: 'new_day',
                     enemyIntel: "第一天防务开始，具体攻势请通过侦察确认。"
                 };
             }
             return { narrative: "【新手引导 2/2】请点击下方发光的【休息】。需要直接开战，也可以选择“跳过教程”。", updatedStats: {} };
        }
    }

    // --- TACTICAL CARD RESOLUTION ---
    // Cards resolve their advertised effects directly. They no longer borrow a
    // normal command whose balance, time cost or effect can silently differ.
    if (cmd === 'encounter_skip') {
        if (!currentStats.activeTacticalCard) return { narrative: '当前没有待处理的战地际遇，未执行。', updatedStats: {}, eventTriggered: 'none' };
        return { narrative: '你没有接受这次机会。没有领取物资或补员，也没有消耗行动时间。', updatedStats: { activeTacticalCard: null }, eventTriggered: 'none' };
    }
    if (/^card_resolve:[a-z_]+$/.test(cmd)) {
        const cardId = cmd.split(':')[1];
        const resolution = resolveTacticalCard(currentStats, cardId);
        if (resolution) {
            Object.assign(calculatedStats, resolution.updatedStats);
            appendCampaignHistory(currentStats, calculatedStats, resolution.historyTitle, resolution.historyDetail, 'good');
            return { narrative: resolution.narrative, updatedStats: calculatedStats, eventTriggered: 'none' };
        }
        return { narrative: '这张战术卡已经失效。', updatedStats: {}, eventTriggered: 'none' };
    }

    // --- DILEMMA RESOLUTION ---
    if (cmd.startsWith('evt_resolve:')) {
        const [, eventId, rawOption] = cmd.split(':');
        const event=ALL_DILEMMAS.find(e=>e.id===eventId);
        const flags=currentStats.consequenceFlags || [];
        if (!event || currentStats.pendingDilemmaId!==eventId || currentStats.triggeredEvents.includes(eventId)
          || !/^\d+$/.test(rawOption || '') || !event.options[Number(rawOption)]
          || event.options[Number(rawOption)].actionCmd.toLowerCase()!==cmd
          || (event.minDay!==undefined && currentStats.day<event.minDay)
          || (event.requiresFlag && !flags.includes(event.requiresFlag)) || (event.excludesFlag && flags.includes(event.excludesFlag))) {
          return {narrative:'该事件当前未等待这项选择，或已结算；本次未执行。',updatedStats:{},eventTriggered:'none'};
        }
        playSound('click');
        return resolveDilemma(
            currentStats,
            eventId,
            Number(rawOption),
            random,
            (updates, deaths, eventNarrative) => applyNamedSoldierDeaths(currentStats, updates, deaths, eventNarrative, random),
        );
    }

    const actionResolution = resolvePlayerAction(currentStats, cmd, random);
    Object.assign(calculatedStats, actionResolution.updatedStats);
    statsLog.push(...actionResolution.logs);
    narrativeParts.push(...actionResolution.narrative);
    const { timeCost, actionType, siegeIncrease } = actionResolution;
    if (actionResolution.visualEffect) visualEffect = actionResolution.visualEffect;
    // --- Time & Siege Update ---
    const campaignClock = advanceCampaignClock(currentStats.day, currentStats.currentTime, timeCost);
    const nextTimeStr = campaignClock.time;
    const totalMinutesPassed = timeCost;
    const currentSiege = calculatedStats.siegeMeter ?? currentStats.siegeMeter ?? 0;
    const dayProfile = getDayProfile(currentStats.day);
    const effectiveSiegeIncrease = Math.max(0, Math.ceil(siegeIncrease * dayProfile.threatMultiplier * 0.6));
    let newSiege = Math.min(100, currentSiege + effectiveSiegeIncrease);
    const strategicStateAfterAction: GameStats = {
        ...currentStats,
        ...calculatedStats,
        soldierDistribution: calculatedStats.soldierDistribution || currentStats.soldierDistribution,
        hmgSquads: calculatedStats.hmgSquads || currentStats.hmgSquads,
        fortificationLevel: calculatedStats.fortificationLevel || currentStats.fortificationLevel,
        sectorIntegrity: calculatedStats.sectorIntegrity || currentStats.sectorIntegrity,
        sealedApproaches: calculatedStats.sealedApproaches || currentStats.sealedApproaches,
    };

    // --- ATTACK TRIGGER LOGIC ---
    let attackTriggered = false;
    let damageType: DamageType = "INFANTRY";
    let attackScale: AttackScale = 'SMALL';
    const contactAllowed = currentStats.turnCount > (currentStats.lastAttackTurn ?? -99);
    let contactOperation = calculatedStats.enemyOperation
        ?? currentStats.enemyOperation
        ?? createEnemyOperation(strategicStateAfterAction, random);

    const turnAdvanced = timeCost > 0 && actionType !== 'idle';
    if (turnAdvanced) {
        // Enemy movement is now turn-based and forecastable. Every meaningful
        // action uses the same duration/pressure projection as the UI preview.
        contactOperation = projectEnemyOperation(contactOperation, timeCost, newSiege);
        calculatedStats.enemyOperation = contactOperation;
        if (contactAllowed && contactOperation.turnsRemaining <= 0) {
            attackTriggered = true;
            newSiege = Math.max(10, newSiege - 65);
            calculatedStats.lastAttackTurn = currentStats.turnCount + 1;
            attackScale = contactOperation.scale;
            damageType = contactOperation.attackType;
            // Aviation is unavailable at night; an already planned strike is
            // converted to artillery rather than disappearing.
            const currentH = parseInt(nextTimeStr.split(':')[0]);
            if (damageType === 'BOMBING' && (currentH < 7 || currentH > 18)) damageType = 'ARTILLERY';
        }
    }
    
    calculatedStats.siegeMeter = newSiege;

    // --- Wounded Passive Death ---
    const currentWoundedCount = calculatedStats.wounded ?? currentStats.wounded;
    let currentTimer = calculatedStats.woundedTimer ?? currentStats.woundedTimer;
    
    if (turnAdvanced && currentWoundedCount > 0) {
        const hospitalHeld = isSectorHeld(strategicStateAfterAction, '地下室');
        const treatmentWindow = hospitalHeld ? 720 : 360;
        currentTimer += totalMinutesPassed;
        if (currentTimer >= treatmentWindow) {
            const deathToll = hospitalHeld ? Math.floor(random() * 5) + 1 : Math.floor(random() * 7) + 3;
            const actualDeaths = Math.min(currentWoundedCount, deathToll);
            if (actualDeaths > 0) {
                calculatedStats.wounded = currentWoundedCount - actualDeaths;
                const moraleLoss = actualDeaths;
                const minM = calculatedStats.minMorale ?? currentStats.minMorale ?? 0;
                const moraleBeforeLoss = calculatedStats.morale ?? currentStats.morale;
                calculatedStats.morale = Math.max(minM, moraleBeforeLoss - moraleLoss);
                narrativeParts.push("\n\n" + pick(WOUNDED_DEATH_SCENES));
                if (!hospitalHeld) narrativeParts.push('\n地下室失守后，伤员只能分散在楼梯间，死亡速度明显加快。');
                statsLog.push(`⚰️ 重伤员不治: ${actualDeaths}人`);
                statsLog.push(`💔 伤员不治后的士气 ${moraleBeforeLoss} → ${calculatedStats.morale}`);
                currentTimer = hospitalHeld ? 660 : 300;
            }
        }
    } else if (turnAdvanced && currentWoundedCount <= 0) {
        currentTimer = 0;
    }
    calculatedStats.woundedTimer = currentTimer;


    if (attackTriggered) {
        const attackResolution = resolveAttack({
            currentStats,
            calculatedStats,
            strategicStateAfterAction,
            contactOperation,
            attackScale,
            damageType,
            narrativeParts,
            statsLog,
            random,
        });
        eventTriggered = attackResolution.eventTriggered;
        visualEffect = attackResolution.visualEffect;
        attackLocation = attackResolution.attackLocation;
    }

    if (!calculatedStats.currentTime) calculatedStats.currentTime = campaignClock.time;
    if (campaignClock.daysPassed > 0) {
        calculatedStats.day = campaignClock.day;
        // An attack that crosses midnight remains an attack result. Previously
        // "new_day" overwrote it, hiding combat settlement and causing confusing transitions.
        if (eventTriggered === 'none') eventTriggered = "new_day";
        const nextDayProfile = getDayProfile(campaignClock.day);
        narrativeParts.push(`\n\n【${formatCampaignDate(campaignClock.day)} · 第 ${campaignClock.day} 天 · ${nextDayProfile.title}】\n时间推进至 ${campaignClock.time}。${nextDayProfile.description}`);
    }

    const finalized = finalizeTurn({
        currentStats,
        calculatedStats,
        actionType,
        attackLocation,
        eventTriggered,
        visualEffect,
        narrativeParts,
        statsLog,
        random,
        allowRandomEvents: turnAdvanced,
    });

    return {
        narrative: finalized.narrative,
        updatedStats: calculatedStats,
        eventTriggered: finalized.eventTriggered,
        visualEffect: finalized.visualEffect,
        attackLocation, 
        dilemma: finalized.dilemma,
        turnAdvanced,
        enemyIntel: getOperationIntel(calculatedStats.enemyOperation ?? currentStats.enemyOperation)
    };
};

export const runGameTurn = (currentStats: GameStats, userCommand: string): GameTurnResult => {
    const seededRandom = createSeededRandom(currentStats.rngState);
    const previousRandomSource = activeRandomSource;
    activeRandomSource = seededRandom.next;

    try {
        const result = runGameTurnInternal(currentStats, userCommand);
        const updatedStats = {
            ...result.updatedStats,
            pendingRetreat: result.updatedStats.pendingRetreat ?? null,
            rngState: result.turnAdvanced || result.eventTriggered === 'attack' || Object.hasOwn(result.updatedStats, 'triggeredEvents') ? seededRandom.getState() : currentStats.rngState,
        };
        const afterStats: GameStats = { ...currentStats, ...updatedStats };
        return {
            ...result,
            updatedStats,
            summary: buildTurnSummary(currentStats, afterStats, result, userCommand),
        };
    } finally {
        activeRandomSource = previousRandomSource;
    }
};
