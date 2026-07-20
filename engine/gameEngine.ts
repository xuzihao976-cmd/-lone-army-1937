
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

// Import Narrative Data Modules
import { WOUNDED_DEATH_SCENES } from "../data/text/combat";

import { 
    GENERAL_CHATTER 
} from "../data/text/chatter";

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
    
    let calculatedStats: Partial<GameStats> = {};
    let statsLog: string[] = []; 
    
    let eventTriggered: 'attack' | 'new_day' | 'none' | 'game_over' | 'victory' = "none";
    let visualEffect: 'shake' | 'heavy-damage' | 'none' = 'none';
    let attackLocation: Location | null = null;
    let narrativeParts: string[] = [];
    
    const cmd = userCommand.toLowerCase();

    // --- ENDING CHECK: RETREAT COMMANDS ---
    const isRetreat = isExplicitRetreatCommand(cmd);
    if (cmd === 'cancel_retreat') {
        return {
            narrative: '你收回了命令。副官松了一口气，阵地上的弟兄重新握紧了枪。',
            updatedStats: {},
            eventTriggered: 'none'
        };
    }

    if (isRetreat && !currentStats.isGameOver) {
        // ENDING 3: Deserter (Day 0-1)
        if (currentStats.day <= 1) {
            return {
                narrative: '撤离阵地将立即结束本次战役，而且无法撤销。副官盯着你，等待最后命令。',
                updatedStats: {},
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
                narrative: '师部的撤退命令已经送达。跨过新垃圾桥后，孤军的命运将进入另一个篇章。',
                updatedStats: {},
                eventTriggered: 'none',
                dilemma: {
                    id: 'confirm_historical_retreat',
                    title: '执行历史撤退？',
                    description: '这会立即结束当前战役并进入“孤军撤退”结局。',
                    options: [
                        { label: '奉命撤退', actionCmd: 'confirm_historical_retreat', riskText: '不可逆：结束战役' },
                        { label: '继续坚守', actionCmd: 'cancel_retreat' }
                    ]
                }
            };
        }

        narrativeParts.push(pick(GENERAL_CHATTER.DESERTION));
        return {
            narrative: narrativeParts.join(""),
            updatedStats: {},
            eventTriggered: 'none'
        };
    }

    if (cmd === 'confirm_desertion' && currentStats.day <= 1 && !currentStats.isGameOver) {
            calculatedStats.isGameOver = true;
            calculatedStats.gameResult = 'defeat_deserter';
            calculatedStats.gameOverReason = 'early_retreat';
            eventTriggered = 'game_over';
            const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_deserter');
            calculatedStats.finalRank = report.rank;
            return {
                narrative: "【懦夫的结局】\n你甚至没有等到日军发动总攻，就脱下了军装试图混入租界。在桥头，督战队的机枪对准了你...\n\n“只有战死的鬼，没有逃跑的人。”\n\n结局达成：【懦夫】",
                updatedStats: calculatedStats,
                eventTriggered: 'game_over',
                visualEffect: 'heavy-damage'
            };
    }

    if (cmd === 'confirm_historical_retreat' && currentStats.day >= 4 && !currentStats.isGameOver) {
            calculatedStats.isGameOver = true;
            calculatedStats.gameResult = 'victory_retreat';
            calculatedStats.gameOverReason = 'historical_retreat';
            eventTriggered = 'victory';
            const report = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'victory_retreat');
            calculatedStats.finalRank = report.rank;
            return {
                narrative: "【孤军撤退】\n10月31日凌晨，接上级命令，谢晋元团附含泪下令撤退。你们利用夜色冲过新垃圾桥，进入公共租界。虽然被英军缴械，但四百壮士的英名已震动世界。\n\n结局达成：【孤军撤退】",
                updatedStats: calculatedStats,
                eventTriggered: 'victory'
            };
    }

    // --- EASTER EGGS ---
    if (cmd.includes("88师万岁") || cmd.includes("八十八师万岁")) {
        playSound('alert');
        statsLog.push("💪 士气 +100");
        return {
            narrative: "【军魂觉醒】你的怒吼唤醒了所有人的记忆。这里是德械师，是国军精锐！无论结局如何，我们都将载入史册！",
            updatedStats: { morale: 100, health: Math.min(100, currentStats.health + 10) },
            eventTriggered: 'none',
            visualEffect: 'shake'
        };
    }
    if (cmd.includes("谢晋元")) {
        playSound('type');
        return {
            narrative: "【指挥官】谢晋元，字中民，广东梅县人。黄埔四期。他看着镜子里的自己，整理了一下军容。这场仗，是他人生的高光，也是他的绝唱。",
            updatedStats: {},
            eventTriggered: 'none'
        };
    }
    
    // --- Start Game ---
    if (cmd === "start_game") {
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
            narrative: "1937年10月26日，19:00。上海闸北，四行仓库。\n\n冷雨中，你刚刚接管防务。副官指向摇摇欲坠的大门：“团附，先把一楼入口加固起来！”\n\n按照下方的新手引导完成两步操作，随后正式开战。",
            updatedStats: calculatedStats,
            eventTriggered: 'none',
            enemyIntel: "侦察兵报告：日军正在集结步兵，似乎准备进行试探性进攻。"
        };
    }
    
    // --- Contextual two-step tutorial ---
    if (currentStats.tutorialStep > 0 && currentStats.tutorialStep < 3) {
        if (cmd === 'skip_tutorial' || cmd.includes('跳过教程')) {
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
                enemyIntel: "侦察兵报告：日军步兵已展开，主要威胁为冷枪和轻型迫击炮。"
            };
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
                     narrative: "【第 1/2 步完成】\n\n沙袋和钢板封住了一楼入口，加固掩体已经成形。副官提醒：“弟兄们两天没合眼了，该轮换休息。”\n\n现在点击下方发光的【休息】。",
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
                     narrative: "【新手引导完成】\n\n守军完成轮换，士气恢复。天亮了——10月27日，第一天，日军已在废墟中展开，真正的战斗开始。\n\n💤 士气 +15",
                     updatedStats: calculatedStats,
                     eventTriggered: 'new_day',
                     enemyIntel: "侦察兵报告：日军步兵已展开，主要威胁为冷枪和轻型迫击炮。"
                 };
             }
             return { narrative: "【新手引导 2/2】请点击下方发光的【休息】。需要直接开战，也可以选择“跳过教程”。", updatedStats: {} };
        }
    }

    // --- TACTICAL CARD RESOLUTION ---
    // Cards resolve their advertised effects directly. They no longer borrow a
    // normal command whose balance, time cost or effect can silently differ.
    if (cmd.startsWith('card_resolve:')) {
        const cardId = cmd.split(':')[1];
        const resolution = resolveTacticalCard(currentStats, cardId);
        if (resolution) {
            Object.assign(calculatedStats, resolution.updatedStats);
            appendCampaignHistory(currentStats, calculatedStats, resolution.historyTitle, resolution.historyDetail, 'good');
            return { narrative: resolution.narrative, updatedStats: calculatedStats, eventTriggered: 'none' };
        }
        return { narrative: '这张战术卡已经失效。', updatedStats: { activeTacticalCard: null }, eventTriggered: 'none' };
    }

    // --- DILEMMA RESOLUTION ---
    if (cmd.startsWith('evt_resolve:')) {
        const [, eventId, rawOption] = cmd.split(':');
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
                calculatedStats.morale = Math.max(minM, (calculatedStats.morale ?? currentStats.morale) - moraleLoss);
                narrativeParts.push("\n\n" + pick(WOUNDED_DEATH_SCENES));
                if (!hospitalHeld) narrativeParts.push('\n地下室失守后，伤员只能分散在楼梯间，死亡速度明显加快。');
                statsLog.push(`⚰️ 重伤员不治: ${actualDeaths}人`);
                statsLog.push(`💔 士气 -${moraleLoss}`);
                currentTimer = hospitalHeld ? 660 : 300;
            }
        }
    } else if (currentWoundedCount <= 0) {
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
            rngState: seededRandom.getState(),
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
