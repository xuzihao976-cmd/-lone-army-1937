
import { GameStats, GameTurnResult, Dilemma, Location, EndingType } from "../types";
import { playSound } from "../utils/sound";
import { isExplicitRetreatCommand, isMoveCommand } from './intents';
import { getDayProfile } from '../data/dayProfiles';
import { buildTurnSummary } from './turnSummary';
import { advanceCampaignClock, formatCampaignDate } from './time';
import { calculateCombatOutcomes, type AttackScale, type DamageType } from './combat';
import { createEnemyOperation, getOperationIntel, progressEnemyOperation, revealEnemyOperation } from './battlefield';
import { getFatigueCasualtyFactor, getRaidSuccessChance, getSearchYieldFactor, getSpeechMoraleGain } from './actionDynamics';
import { hasSpecialist } from './specialists';
import { resolveTacticalCard } from './tacticalCards';
import { addConsequenceFlag, appendCampaignHistory } from './campaignProgress';
import { resolveDilemma } from './dilemmaResolver';
import {
    calculateCommanderDeathRisk,
    canRecaptureSector,
    formatCommanderRisk,
    getGroundAttackTargets,
    getSectorDefenseProfile,
    getRecaptureStagingSectors,
    getRetreatDestination,
    isApproachExposed,
    isSectorHeld,
} from './strategicDefense';

// Import Narrative Data Modules
import { 
    RAID_SUCCESS_TEXTS, RAID_FAIL_TEXTS, BAYONET_FIGHT_TEXTS, ATTACK_TEXTS, 
    WOUNDED_DEATH_SCENES, FORT_DAMAGE_SCENES 
} from "../data/text/combat";

import { 
    COMMAND_RESPONSES, BUILD_SCENES, HEAL_SUCCESS_SCENES, SPEECH_SCENES 
} from "../data/text/commands";

import { 
    ALL_DILEMMAS, MUTINY_SCENES, TACTICAL_CARDS
} from "../data/text/events";

import { 
    GENERAL_CHATTER 
} from "../data/text/chatter";

// --- Helper Functions ---

type RandomSource = () => number;
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

const matchIntent = (input: string, keywords: string[]): boolean => {
    return keywords.some(k => input.includes(k));
};

const pick = <T>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

// Conversational logic kept ONLY as offline fallback
const getConversationalResponse = (input: string): string => {
    if (matchIntent(input, ['你是谁', '我是谁', '介绍', '名字', '身份', '穿越', '系统'])) return pick(GENERAL_CHATTER.META_IDENTITY);
    // Removed DESERTION generic talk to allow specific ending triggers, but keeping generic if conditions not met
    if (matchIntent(input, ['电报', '师部', '命令', '消息', '孙元良', '顾祝同', '蒋', '上级', '无线电', '信号'])) return pick(GENERAL_CHATTER.RADIO_INTEL);
    if (matchIntent(input, ['杀', '拼', '干', '弄死', '击退', '冲锋', '进攻', '灭', '宰', '打死', '反击', '血'])) return pick(GENERAL_CHATTER.BLOODTHIRST);
    if (matchIntent(input, ['快', '慢', '加速', '没时间', '速度', '抓紧', '磨蹭', '来不及', '迅速'])) return pick(GENERAL_CHATTER.URGENCY);
    if (matchIntent(input, ['太难', '猛', '守不住', '变态', '强', '怎么打', '太多', '受不了', '绝望', '不行'])) return pick(GENERAL_CHATTER.DIFFICULTY);
    if (matchIntent(input, ['副官', '参谋', '报告', '长官'])) return pick(GENERAL_CHATTER.ADJUTANT);
    if (matchIntent(input, ['机枪', '连长', '重火力', '弹药', '马克沁', '扫射'])) return pick(GENERAL_CHATTER.HMG_TALK);
    if (matchIntent(input, ['大家', '弟兄', '士兵', '战士', '人', '咱们', '队伍', '一营'])) return pick(GENERAL_CHATTER.SOLDIERS_TALK);
    if (matchIntent(input, ['看', '观察', '环境', '周围', '河', '租界', '桥', '灯', '外面'])) return pick(GENERAL_CHATTER.ENVIRONMENT);
    if (matchIntent(input, ['饿', '吃', '水', '渴', '饭', '粮'])) return pick(GENERAL_CHATTER.HUNGRY);
    if (matchIntent(input, ['鬼子', '日军', '日本', '敌人', '仇'])) return pick(GENERAL_CHATTER.ENEMY);
    if (matchIntent(input, ['你好', '在吗', '喂', '嗨', '收到', '好'])) return pick(GENERAL_CHATTER.GREETING);
    
    return pick(GENERAL_CHATTER.CONFUSED);
};

const LOCATIONS: Location[] = ['屋顶', '二楼阵地', '一楼入口', '地下室'];
const FORTIFICATION_NAMES = ['无掩体', '沙袋防线', '加固掩体', '堡垒化阵地'] as const;

const findLocations = (command: string): Location[] => LOCATIONS
    .map((location) => {
        const aliases = location === '屋顶' ? ['屋顶', '楼顶']
            : location === '二楼阵地' ? ['二楼阵地', '二楼']
                : location === '一楼入口' ? ['一楼入口', '一楼']
                    : ['地下室', '地下'];
        const indexes = aliases.map((alias) => command.indexOf(alias)).filter((index) => index >= 0);
        return { location, index: indexes.length ? Math.min(...indexes) : -1 };
    })
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.location);

const reconcileSoldierDistribution = (
    distribution: Record<string, number>,
    totalSoldiers: number,
    preferredLocation?: Location | null,
): Record<string, number> => {
    const next = Object.fromEntries(LOCATIONS.map((location) => [location, Math.max(0, Math.floor(distribution[location] || 0))]));
    let difference = LOCATIONS.reduce((sum, location) => sum + next[location], 0) - Math.max(0, Math.floor(totalSoldiers));

    while (difference > 0) {
        const candidates = preferredLocation && next[preferredLocation] > 0
            ? [preferredLocation, ...LOCATIONS.filter((location) => location !== preferredLocation)]
            : [...LOCATIONS].sort((a, b) => next[b] - next[a]);
        const target = candidates.find((location) => next[location] > 0);
        if (!target) break;
        const removed = Math.min(difference, next[target]);
        next[target] -= removed;
        difference -= removed;
    }

    if (difference < 0) next['地下室'] += Math.abs(difference);
    return next;
};

const calculateScore = (stats: GameStats, endingType: EndingType): { rank: string, text: string } => {
    let rank = "尽忠职守";
    let text = "你完成了基本的守备任务，但在惨烈的战斗中损失惨重。";
    
    if (endingType === 'defeat_deserter') {
        return { rank: "懦夫", text: "你在战斗初期抛弃了部队。你的名字将被钉在耻辱柱上，后世无人知晓你的下落。" };
    }
    
    if (endingType === 'defeat_assault') {
        return { rank: "勇猛的莽夫", text: "你的勇气令人敬佩，但连续出击耗尽了全营的成建制战力。作为指挥官，你选择了最壮烈也最惨痛的道路。" };
    }

    if (endingType === 'defeat_martyr') {
        return { rank: "民族英雄", text: "旗帜不倒，军魂永存！你们全员殉国，但那面旗帜在四行仓库上空飘扬的画面，将永远激励着中华民族！" };
    }

    if (endingType === 'defeat_commander') {
        return { rank: "阵前殉职", text: "你把指挥部放在了最危险的火线上。部队仍有人活着，但失去指挥官的瞬间让整条防线陷入混乱。" };
    }

    if (endingType === 'victory_retreat') {
        return { rank: "孤军", text: "你成功完成了掩护大部队撤退的任务，并按照命令撤入租界。虽然结局充满无奈（被英军缴械），但你保全了这支抗战的火种。" };
    }

    // Normal Victory / Generic Defeat calculations
    // Fix: Include HMG Squads and Wounded in calculation
    const hmgSurvivors = stats.hmgSquads ? stats.hmgSquads.reduce((acc, s) => acc + (s.status === 'active' ? s.count : 0), 0) : 0;
    const totalSurvivors = stats.soldiers + stats.wounded + hmgSurvivors;

    if (totalSurvivors > 300) { rank = "在此封神"; text = `奇迹！绝大多数弟兄都活了下来（${totalSurvivors}人）。击毙日军${stats.enemiesKilled}人。你的指挥艺术将被写进教科书！`; }
    else if (totalSurvivors > 200) { rank = "民族脊梁"; text = `你保全了主力部队（${totalSurvivors}人），打出了国军的威风。击毙日军${stats.enemiesKilled}人。`; }
    else if (totalSurvivors > 100) { rank = "血战到底"; text = `虽然伤亡过半（剩余${totalSurvivors}人），但那面旗帜始终飘扬。击毙日军${stats.enemiesKilled}人。`; }
    
    if (endingType === 'defeat_generic') {
         text = "仓库已经失守，但你们的抵抗让日军付出了沉重代价，幸存者仍会记住这场战斗。";
    }

    return { rank, text };
};

// --- DYNAMIC ROSTER LOGIC ---
const handleSoldierDeaths = (stats: GameStats, calcStats: Partial<GameStats>, deaths: number, narrative: string[]): void => {
    if (deaths <= 0) return;
    
    const currentRoster = calcStats.roster || stats.roster || [];
    const livingNamed = currentRoster.filter(s => s.status === 'alive');
    
    // Chance to kill a named soldier
    const namedDeathChance = Math.min(1.0, deaths * 0.1); // Increased chance
    
    let newRoster = [...currentRoster];
    
    if (random() < namedDeathChance && livingNamed.length > 0) {
        const victimIndex = Math.floor(random() * livingNamed.length);
        const victim = livingNamed[victimIndex];
        
        newRoster = newRoster.map(s => s.id === victim.id ? { ...s, status: 'dead', deathReason: 'combat' } : s);
        
        const flavor = pick([
            `【噩耗】混战中，${victim.name}被流弹击中。这个${victim.origin}汉子死前手里还紧紧攥着那封没写完的家书。`,
            `【牺牲】一声巨响，${victim.name}所在的掩体被炸平。我们再也听不到他${victim.trait === '暴躁' ? '骂娘' : '吹牛'}的声音了。`,
            `【悲歌】为了掩护新兵，${victim.name}冲出了掩体，瞬间被机枪扫倒。`,
        ]);
        narrative.push("\n" + flavor);
    }
    
    calcStats.roster = newRoster;
};


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
    let dilemmaToTrigger: Dilemma | undefined = undefined;
    
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
            const report = calculateScore({ ...currentStats, ...calculatedStats }, 'defeat_deserter');
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
            const report = calculateScore({ ...currentStats, ...calculatedStats }, 'victory_retreat');
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
            (updates, deaths, eventNarrative) => handleSoldierDeaths(currentStats, updates, deaths, eventNarrative),
        );
    }

    // --- Command Parsing & Action Logic ---
    let timeCost = 5; 
    let actionType = "idle";
    let siegeIncrease = 5; 
    
    // STRATEGIC ACTION: retake a lost sector from an adjacent held floor.
    if ((cmd.includes('夺回') || cmd.includes('反冲锋')) && findLocations(cmd).length > 0) {
        const target = findLocations(cmd).at(-1)!;
        const donor = getRecaptureStagingSectors(currentStats, target)
            .map((location) => ({ location, soldiers: currentStats.soldierDistribution[location] || 0 }))
            .sort((a, b) => b.soldiers - a.soldiers)[0];
        const assaultForce = donor ? Math.min(40, Math.max(0, donor.soldiers - 20)) : 0;

        if (!canRecaptureSector(currentStats, target)) {
            actionType = 'recapture_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push(`${target}尚未失守，或当前没有相邻防区可以作为反冲锋出发点。`);
        } else if (!donor || assaultForce < 20) {
            actionType = 'recapture_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('反冲锋无法发动：相邻防区至少要能抽调20名步兵。');
        } else {
            timeCost = 60;
            siegeIncrease = 20;
            const recaptureAmmoUsed = Math.min(800, currentStats.ammo);
            const recaptureGrenadesUsed = Math.min(40, currentStats.grenades);
            const fireSupport = recaptureAmmoUsed / 800 * 0.65 + recaptureGrenadesUsed / 40 * 0.35;
            const bayonetAssault = recaptureAmmoUsed < 200;
            calculatedStats.ammo = currentStats.ammo - recaptureAmmoUsed;
            calculatedStats.grenades = currentStats.grenades - recaptureGrenadesUsed;

            const assaultTeamReady = hasSpecialist(currentStats, 'assault', donor.location);
            const successChance = Math.min(
                0.85,
                0.22 + currentStats.morale / 300 + (currentStats.fortificationLevel[donor.location] || 0) * 0.03 + fireSupport * 0.23 + (assaultTeamReady ? 0.12 : 0),
            );
            const success = random() < successChance;
            const supplyCasualtyPenalty = Math.round((1 - fireSupport) * 7);
            const casualties = success
                ? 2 + Math.floor(random() * 5) + supplyCasualtyPenalty
                : 8 + Math.floor(random() * 11) + supplyCasualtyPenalty;
            const actualCasualties = Math.min(assaultForce, Math.max(0, casualties - (assaultTeamReady ? 2 : 0)));
            const distribution = { ...currentStats.soldierDistribution };
            distribution[donor.location] = Math.max(0, donor.soldiers - (success ? assaultForce : actualCasualties));
            if (success) distribution[target] = Math.max(0, assaultForce - actualCasualties);

            calculatedStats.soldiers = Math.max(0, currentStats.soldiers - actualCasualties);
            calculatedStats.soldierDistribution = distribution;
            handleSoldierDeaths(currentStats, calculatedStats, actualCasualties, narrativeParts);
            if (recaptureAmmoUsed > 0 || recaptureGrenadesUsed > 0) {
                statsLog.push(`🔻 反冲锋消耗: 七九弹${recaptureAmmoUsed} / 手榴弹${recaptureGrenadesUsed}`);
            }
            if (bayonetAssault) statsLog.push('⚔️ 火力不足：突击队以手榴弹、刺刀和工兵铲近战夺楼');
            if (assaultTeamReady) statsLog.push('🗡 敢死突击组带队：成功率提高 / 伤亡降低');
            statsLog.push(`🔴 反冲锋伤亡: ${actualCasualties}人`);

            if (success) {
                actionType = 'recapture_success';
                calculatedStats.sectorIntegrity = { ...currentStats.sectorIntegrity, [target]: 30 };
                calculatedStats.sealedApproaches = currentStats.sealedApproaches.filter((location) => location !== target);
                calculatedStats.morale = Math.min(100, currentStats.morale + 6);
                narrativeParts.push(`【反冲锋成功】${assaultForce}名弟兄从${donor.location}冲入${target}，${bayonetAssault ? '在楼梯和房间里与敌军刺刀见血，逐屋夺回阵地' : '以步枪和手榴弹压住突破口，逐屋清剿'}。防区恢复到30%完整度，必须尽快加固。`);
                statsLog.push(`↗ 夺回${target}: 防区完整度30% / 士气+6`);
                appendCampaignHistory(currentStats, calculatedStats, `夺回${target}`, `${actualCasualties}人伤亡后重新建立30%完整度的防线。`, 'good');
            } else {
                actionType = 'recapture_failed';
                calculatedStats.morale = Math.max(0, currentStats.morale - 10);
                narrativeParts.push(`【反冲锋受挫】从${donor.location}出发的突击队被敌军交叉火力压回。${target}仍在敌军手中，士气受到沉重打击。`);
                statsLog.push('💔 反冲锋失败: 士气-10');
            }
        }
    }
    // STRATEGIC ACTION: prepare a one-use choke point before the next advance.
    else if (cmd.includes('封锁') && (cmd.includes('楼梯') || cmd.includes('通道'))) {
        const target = findLocations(cmd).at(-1);
        if (!target || !isApproachExposed(currentStats, target)) {
            actionType = 'seal_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('这里暂时没有暴露在敌军推进路线上的楼梯需要封锁。');
        } else if (currentStats.sealedApproaches.includes(target)) {
            actionType = 'seal_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push(`通往${target}的楼梯已经布置好炸药和障碍物。`);
        } else if (currentStats.sandbags < 150 || currentStats.grenades < 20) {
            actionType = 'seal_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('封锁楼梯需要150份工事材料和20枚手榴弹，当前库存不足。');
        } else {
            actionType = 'seal_approach';
            timeCost = 60;
            siegeIncrease = 15;
            calculatedStats.sandbags = currentStats.sandbags - 150;
            calculatedStats.grenades = currentStats.grenades - 20;
            calculatedStats.sealedApproaches = [...currentStats.sealedApproaches, target];
            narrativeParts.push(`工兵用沙袋、木箱和手榴弹封死通往${target}的楼梯。敌军下一次从这里推进时，进攻规模会被削弱；障碍触发后即会失效。`);
            statsLog.push(`⛓ 封锁通往${target}的楼梯: 工事材料-150 / 手榴弹-20`);
        }
    }
    // 1. RAID (Aggressive Action for Ending 2)
    else if (cmd.includes('突袭') || cmd.includes('夜袭') || cmd.includes('偷袭') || cmd.includes('反击') || cmd.includes('进攻')) {
        const currentH = parseInt(currentStats.currentTime.split(':')[0]);
        
        if (currentH >= 0 && currentH < 5) {
            // Only a raid that actually leaves the warehouse counts as aggression.
            calculatedStats.aggressiveCount = (currentStats.aggressiveCount || 0) + 1;
            timeCost = 60; 
            const reconBonus = Math.max(0, currentStats.reconBonus || 0);
            const successChance = getRaidSuccessChance(currentStats);
            const isSuccess = random() < successChance;
            calculatedStats.reconBonus = 0;
            if (isSuccess) {
                const died = Math.floor(random() * 6); 
                const ammoGain = random() > 0.3 ? Math.floor(random() * 600) : 0;
                const medGain = random() > 0.5 ? Math.floor(random() * 30) : 0;
                
                calculatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
                calculatedStats.ammo = currentStats.ammo + ammoGain;
                calculatedStats.medkits = currentStats.medkits + medGain;
                
                handleSoldierDeaths(currentStats, calculatedStats, died, narrativeParts);
                
                narrativeParts.push(pick(RAID_SUCCESS_TEXTS));
                if (died > 0) {
                     statsLog.push(`🔴 阵亡: ${died}人`);
                     statsLog.push(`💔 士气 -${died * 2}`);
                }
                if (ammoGain) statsLog.push(`📦 缴获七九弹 +${ammoGain}`);
                if (medGain) statsLog.push(`📦 缴获急救包 +${medGain}`);
                
                let newMorale = (calculatedStats.morale ?? currentStats.morale) + 10;
                if (died > 0) newMorale -= (died * 2);
                calculatedStats.morale = Math.max(0, Math.min(100, newMorale));
                statsLog.push("💪 突袭成功: 士气 +10");
                if (reconBonus > 0) statsLog.push(`👁 侦察引导生效: 成功率提升${reconBonus}%`);
            } else {
                const died = 10 + Math.floor(random() * 11);
                calculatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
                calculatedStats.morale = Math.max(0, currentStats.morale - 15 - (died * 2));
                
                handleSoldierDeaths(currentStats, calculatedStats, died, narrativeParts);
                narrativeParts.push(pick(RAID_FAIL_TEXTS));
                statsLog.push(`🔴 阵亡: ${died}人`);
                statsLog.push(`💔 突袭惨败: 士气 -15`);
                statsLog.push(`💔 伤亡惩罚: 士气 -${died * 2}`);
                visualEffect = 'heavy-damage';
            }
            actionType = "raid";
        } else {
            narrativeParts.push("副官拦住了你：“团附！现在天还亮着，外面全是鬼子的狙击手和观察哨。请等到深夜（00:00-05:00）再行动。”");
            actionType = "raid_blocked";
            timeCost = 0;
            siegeIncrease = 0;
        }
    }
    // NEW ACTION: SCAVENGE (SEARCH)
    else if (cmd.includes('搜寻') || cmd.includes('寻找') || cmd.includes('搜')) {
        timeCost = 30; // 30 mins
        actionType = "scavenge";
        siegeIncrease = 10;
        
        const exhaustion = Math.max(0, currentStats.searchExhaustion || 0);
        const yieldFactor = getSearchYieldFactor(exhaustion);
        calculatedStats.searchExhaustion = Math.min(6, exhaustion + 1);
        const roll = random();
        if (roll < 0.4 * yieldFactor) {
            // Success: Ammo
            const gain = Math.max(20, Math.floor((Math.floor(random() * 100) + 50) * yieldFactor));
            calculatedStats.ammo = currentStats.ammo + gain;
            narrativeParts.push("你在仓库深处的废墟里翻找，在一个被压扁的木箱里发现了一些散落的子弹。虽然不多，但聊胜于无。");
            statsLog.push(`📦 搜寻获得: 七九弹 +${gain}`);
        } else if (roll < 0.4 * yieldFactor + 0.2 * yieldFactor) {
             // Success: Meds or Sandbags
             if (random() > 0.5) {
                 calculatedStats.medkits = currentStats.medkits + 2;
                 narrativeParts.push("在一个角落里，你找到了几卷还没受潮的绷带。");
                 statsLog.push(`📦 搜寻获得: 急救包 +2`);
             } else {
                 const materialGain = Math.max(15, Math.floor(50 * yieldFactor));
                 calculatedStats.sandbags = currentStats.sandbags + materialGain;
                 narrativeParts.push("工兵从废墟里拆出一批还能使用的木料、铁皮和空沙袋。");
                 statsLog.push(`📦 搜寻获得: 工事材料 +${materialGain}`);
             }
        } else if (roll < 0.9) {
            // Nothing
            narrativeParts.push("你带着几个人翻遍了地下室的杂物间，除了一身灰和几只老鼠，什么也没找到。");
        } else {
            // Bad luck
            calculatedStats.morale = Math.max(0, currentStats.morale - 1);
            narrativeParts.push("一无所获。看着空空如也的箱子，大家的眼神里流露出一丝失望。");
            statsLog.push("💔 徒劳无功: 士气 -1");
        }
        if (exhaustion >= 2) statsLog.push(`⌛ 仓库已被反复搜索：本次收益降至${Math.round(yieldFactor * 100)}%`);
    }
    // NEW ACTION: SCOUT
    else if (cmd.includes('侦察') || cmd.includes('观察')) {
        timeCost = 15;
        siegeIncrease = 5;
        actionType = "scout";
        const operation = currentStats.enemyOperation || createEnemyOperation(currentStats, random);
        calculatedStats.enemyOperation = revealEnemyOperation(operation);
        calculatedStats.reconBonus = Math.min(30, (currentStats.reconBonus || 0) + 20);
        const intel = pick([
            "日军正在搬运尸体，看来刚才的战斗让他们也伤筋动骨了。",
            "西侧的日军机枪阵地似乎在换班，这可能是个射击的好机会。",
            "苏州河对岸有很多百姓在挂出标语支持我们。这让弟兄们很受鼓舞。",
            "有一小队日军正在挖掘战壕，似乎企图向大门逼近。",
        ]);
        narrativeParts.push(`你举起望远镜仔细观察敌情。\n\n“团附，看那边。”\n${intel}`);
        narrativeParts.push(`\n\n【敌情确证】${getOperationIntel(calculatedStats.enemyOperation)}`);
        statsLog.push('👁 侦察标记：下一次夜袭成功率 +20%');
        // Small chance to find a target
        if (random() < 0.2) {
             if (currentStats.ammo > 0) {
                 const roundsUsed = Math.min(3, currentStats.ammo);
                 calculatedStats.ammo = currentStats.ammo - roundsUsed;
                 calculatedStats.enemiesKilled = currentStats.enemiesKilled + 1;
                 narrativeParts.push("\n\n神枪手等到敌军军官探出掩体才扣下扳机。枪响后，那个人应声倒地，周围日军立刻缩回废墟。");
                 statsLog.push(`💀 狙击战果: 击毙敌军军官1人 / 七九弹-${roundsUsed}`);
             } else {
                 narrativeParts.push("\n\n望远镜里出现了一个极好的射击目标，可七九弹已经耗尽。神枪手只能记下敌军军官的位置，等待下一次机会。");
                 statsLog.push('⚠ 发现高价值目标，但无七九弹可供射击');
             }
        }
    }
    // STRATEGIC ACTION: move 30 riflemen between sectors.
    else if (cmd.includes('调派30人') || cmd.includes('增援30人')) {
        const locations = findLocations(cmd);
        const source = locations[0];
        const target = locations[1];
        const distribution = { ...currentStats.soldierDistribution };

        if (!source || !target || source === target) {
            actionType = 'redeploy_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('副官没有看懂调兵路线。请从战略地图选择目标区域。');
        } else if (!isSectorHeld(currentStats, source) || !isSectorHeld(currentStats, target)) {
            actionType = 'redeploy_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('失守防区无法直接调兵，必须先组织反冲锋夺回。');
        } else {
            const movable = Math.max(0, (distribution[source] || 0) - 20);
            const transfer = Math.min(30, movable);
            if (transfer <= 0) {
                actionType = 'redeploy_fail';
                timeCost = 0;
                siegeIncrease = 0;
                narrativeParts.push(`${source}的守军已经低于安全线，无法继续抽调。`);
            } else {
                actionType = 'redeploy';
                timeCost = 30;
                siegeIncrease = 8;
                distribution[source] = Math.max(0, (distribution[source] || 0) - transfer);
                distribution[target] = (distribution[target] || 0) + transfer;
                calculatedStats.soldierDistribution = distribution;
                narrativeParts.push(`你命令传令兵带队穿过仓库内部通道，将${transfer}名步兵从${source}调往${target}。新的交叉火力正在形成。`);
                statsLog.push(`↔ 调兵: ${source} → ${target} (${transfer}人)`);
            }
        }
    }
    // STRATEGIC ACTION: redeploy one surviving HMG squad.
    else if (cmd.includes('部署机枪') && cmd.includes('至')) {
        const target = findLocations(cmd).at(-1);
        const squads = [...currentStats.hmgSquads];
        const squadIndex = squads.findIndex((squad) => cmd.includes(squad.name));
        const squad = squadIndex >= 0 ? squads[squadIndex] : undefined;

        if (!target || !squad || squad.status !== 'active' || squad.location === target || !isSectorHeld(currentStats, target)) {
            actionType = 'hmg_redeploy_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('机枪部署命令无法执行：请确认机枪组仍可作战，且目标阵位不同。');
        } else {
            actionType = 'hmg_redeploy';
            timeCost = 20;
            siegeIncrease = 6;
            const previousLocation = squad.location;
            squads[squadIndex] = { ...squad, location: target };
            calculatedStats.hmgSquads = squads;
            narrativeParts.push(`${squad.name}拆下枪架和水冷套筒，从${previousLocation}迅速转移到${target}。这支机枪组只会支援它所在的防区。`);
            statsLog.push(`♜ ${squad.name}: ${previousLocation} → ${target}`);
        }
    }
    // STRATEGIC ACTION: redeploy one specialist squad without changing total manpower.
    else if (cmd.includes('部署小队') && cmd.includes('至')) {
        const target = findLocations(cmd).at(-1);
        const squads = [...currentStats.specialistSquads];
        const squadIndex = squads.findIndex((squad) => cmd.includes(squad.name));
        const squad = squadIndex >= 0 ? squads[squadIndex] : undefined;
        if (!target || !squad || squad.status !== 'active' || squad.location === target || !isSectorHeld(currentStats, target)) {
            actionType = 'specialist_redeploy_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('小队部署命令无法执行：请确认目标防区仍由我军控制。');
        } else {
            actionType = 'specialist_redeploy';
            timeCost = 20;
            siegeIncrease = 6;
            const previousLocation = squad.location;
            squads[squadIndex] = { ...squad, location: target };
            calculatedStats.specialistSquads = squads;
            narrativeParts.push(`${squad.name}从${previousLocation}转移到${target}。他们的专长只会在当前防区生效。`);
            statsLog.push(`◆ ${squad.name}: ${previousLocation} → ${target}`);
        }
    }
    // ... (Supply blocked, Move logic preserved) ...
    else if (cmd.includes('补给') || cmd.includes('物资') && !cmd.includes('整理')) {
        narrativeParts.push("通讯兵无奈地摇摇头：“团附，租界那边被封锁了，上面也没有空投计划。只能靠自己了。”");
        actionType = "supply_blocked";
        timeCost = 0;
        siegeIncrease = 0;
    }
    else if (isMoveCommand(cmd)) {
        const target = cmd.includes('顶') ? '屋顶'
            : cmd.includes('二楼') ? '二楼阵地'
                : cmd.includes('一楼') ? '一楼入口'
                    : cmd.includes('地下') ? '地下室'
                        : null;
        if (!target || !isSectorHeld(currentStats, target)) {
            timeCost = 0;
            siegeIncrease = 0;
            actionType = 'move_blocked';
            narrativeParts.push('该防区已经失守，指挥官不能直接进入。请先组织反冲锋夺回。');
        } else {
            timeCost = 15;
            actionType = "move";
            calculatedStats.location = target;
            playSound('click');
        }
    }
    // 4. Build
    else if (cmd.includes('加固') || cmd.includes('修') || cmd.includes('工事')) {
        let targetLoc = currentStats.location;
        if (cmd.includes('一楼')) targetLoc = '一楼入口';
        else if (cmd.includes('二楼')) targetLoc = '二楼阵地';
        else if (cmd.includes('屋顶')) targetLoc = '屋顶';
        else if (cmd.includes('地下')) targetLoc = '地下室';

        const currentLevel = calculatedStats.fortificationLevel?.[targetLoc] ?? currentStats.fortificationLevel[targetLoc] ?? 0;
        const currentSectorIntegrity = calculatedStats.sectorIntegrity?.[targetLoc] ?? currentStats.sectorIntegrity[targetLoc] ?? 100;
        
        if (!isSectorHeld(currentStats, targetLoc)) {
            actionType = 'build_lost';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push(`${targetLoc}仍在敌军控制下，工兵无法进入施工。必须先夺回防区。`);
        } else if (currentLevel >= 3 && currentSectorIntegrity >= 100) {
            actionType = "build_max";
            timeCost = 5; 
        } else {
            const engineerReady = hasSpecialist(currentStats, 'engineer', targetLoc);
            const materialCost = engineerReady ? 170 : 200;
            const integrityGain = engineerReady ? 24 : 18;
            if (currentStats.sandbags >= materialCost) {
                timeCost = 120; // 2 hours
                actionType = "build";
                const currentCount = currentStats.fortificationBuildCounts?.[targetLoc] || 0;
                const newCount = currentCount + 1;
                const newLevel = Math.min(3, Math.floor(newCount / 2));
                const newSectorIntegrity = Math.min(100, currentSectorIntegrity + integrityGain);
                const mitigationBeforeBuild = Math.round(getSectorDefenseProfile(currentStats, targetLoc).mitigation * 100);
                
                calculatedStats.sandbags = currentStats.sandbags - materialCost;
                calculatedStats.fortificationBuildCounts = { ...currentStats.fortificationBuildCounts, [targetLoc]: newCount };
                calculatedStats.fortificationLevel = { ...currentStats.fortificationLevel, [targetLoc]: newLevel };
                calculatedStats.sectorIntegrity = {
                    ...currentStats.sectorIntegrity,
                    [targetLoc]: newSectorIntegrity,
                };
                const stateAfterBuild: GameStats = {
                    ...currentStats,
                    ...calculatedStats,
                    fortificationLevel: calculatedStats.fortificationLevel,
                    fortificationBuildCounts: calculatedStats.fortificationBuildCounts,
                    sectorIntegrity: calculatedStats.sectorIntegrity,
                };
                const mitigationAfterBuild = Math.round(getSectorDefenseProfile(stateAfterBuild, targetLoc).mitigation * 100);
                if (currentStats.health < 100) {
                    calculatedStats.health = Math.min(100, currentStats.health + 4);
                    statsLog.push(`🏥 抢修承重结构: ${currentStats.health}% → ${calculatedStats.health}%`);
                }
                
                if (random() < 0.3) {
                    const fatigueLoss = Math.floor(random() * 6);
                    if (fatigueLoss > 0) {
                        const minM = currentStats.minMorale || 0;
                        calculatedStats.morale = Math.max(minM, currentStats.morale - fatigueLoss);
                        statsLog.push(`💔 劳累: 士气 -${fatigueLoss}`);
                    }
                }
                statsLog.push(`🧱 工事材料 -${materialCost}${engineerReady ? '（工兵组节省30）' : ''}`);
                statsLog.push(`🏢 ${targetLoc}完整度: ${currentSectorIntegrity}% → ${newSectorIntegrity}%`);
                if (mitigationAfterBuild !== mitigationBeforeBuild) {
                    statsLog.push(`🛡 ${FORTIFICATION_NAMES[newLevel]}: 实际减伤 ${mitigationBeforeBuild}% → ${mitigationAfterBuild}%`);
                } else {
                    statsLog.push(newLevel >= 3
                        ? '🔨 堡垒化阵地完成修补，实际减伤保持不变'
                        : `🔨 ${FORTIFICATION_NAMES[newLevel]}继续加厚，下一次施工将强化防护`);
                }
                siegeIncrease = 15;
            } else {
                actionType = "fail";
                timeCost = 0;
                siegeIncrease = 0;
                narrativeParts.push(`工兵检查库存后摇头：“团附，工事材料不足，至少需要${hasSpecialist(currentStats, 'engineer', targetLoc) ? 170 : 200}份。”`);
            }
        }
    }
    // 5. Rest
    else if (cmd.includes('休息') || cmd.includes('睡') || cmd.includes('整顿')) {
        timeCost = 120; 
        actionType = "rest";
        calculatedStats.morale = Math.min(100, currentStats.morale + 10);
        calculatedStats.health = Math.min(100, currentStats.health + 5);
        calculatedStats.lastRestTurn = currentStats.turnCount + 1;
        calculatedStats.fatigue = Math.max(0, currentStats.fatigue - 35);
        calculatedStats.speechStreak = 0;
        siegeIncrease = 35; 
        statsLog.push("💤 士气 +10");
        statsLog.push(`🛏 疲劳 ${currentStats.fatigue}% → ${calculatedStats.fatigue}%`);
        if (calculatedStats.health !== currentStats.health) {
            statsLog.push(`🏥 总结构: ${currentStats.health}% → ${calculatedStats.health}%`);
        }
    }
    // 6. Heal
    else if (cmd.includes('治疗') || cmd.includes('抢救') || cmd.includes('救') || cmd.includes('医')) {
        timeCost = 60; 
        const currentWounded = currentStats.wounded || 0;
        if (!isSectorHeld(currentStats, '地下室')) {
            actionType = 'heal_fail';
            timeCost = 0;
            siegeIncrease = 0;
            narrativeParts.push('地下室医院已经失守，伤员无法接受成体系救治。必须先夺回地下室。');
        } else if (currentWounded > 0 && currentStats.medkits > 0) {
            actionType = "heal";
            const medicReady = hasSpecialist(currentStats, 'medic', '地下室');
            const healPotential = Math.floor(random() * 4) + 2 + (medicReady ? 2 : 0);
            const actualHeal = Math.min(currentWounded, currentStats.medkits, healPotential);
            if (actualHeal > 0) {
                calculatedStats.medkits = currentStats.medkits - actualHeal;
                calculatedStats.wounded = currentWounded - actualHeal;
                calculatedStats.soldiers = currentStats.soldiers + actualHeal;
                const moraleBoost = actualHeal * 2;
                calculatedStats.morale = Math.min(100, currentStats.morale + moraleBoost);
                calculatedStats.woundedTimer = Math.max(0, (currentStats.woundedTimer || 0) - (actualHeal * 90));
                statsLog.push(`🩹 消耗急救包: ${actualHeal}`);
                statsLog.push(`💚 治愈伤员: ${actualHeal}人`);
                if (medicReady) statsLog.push('✚ 战地救护组：本次额外救回2人上限');
                statsLog.push(`💪 士气 +${moraleBoost}`);
                siegeIncrease = 10;
            } else {
                narrativeParts.push('军医尽力了，但条件太差，这次没能让伤员恢复战斗力。');
            }
        } else {
            actionType = "heal_fail"; 
            timeCost = 0;
            siegeIncrease = 0;
        }
    }
    // 7. Flag
    else if (cmd.includes('升旗')) {
        if (!isSectorHeld(currentStats, '屋顶')) {
            narrativeParts.push('屋顶已经失守，国旗无法升起。必须先夺回屋顶阵地。');
            actionType = 'flag_blocked';
            timeCost = 0;
            siegeIncrease = 0;
        } else if (!currentStats.hasFlagRaised) {
            if (currentStats.location === '屋顶') {
                if (!currentStats.flagWarned) {
                    timeCost = 5;
                    calculatedStats.flagWarned = true;
                    actionType = "flag_warn";
                } else {
                    timeCost = 30;
                    actionType = "flag_success";
                    calculatedStats.hasFlagRaised = true;
                    calculatedStats.consequenceFlags = addConsequenceFlag(currentStats.consequenceFlags, 'roof_flag_beacon');
                    calculatedStats.morale = Math.min(100, currentStats.morale + 30);
                    calculatedStats.minMorale = 30;
                    statsLog.push("💪 士气 +30");
                    appendCampaignHistory(currentStats, calculatedStats, '屋顶升旗', '全军士气大振，但屋顶成为敌军航空兵的优先目标。', 'neutral');
                    siegeIncrease = 50; 
                }
            } else {
                narrativeParts.push("副官：‘长官，升旗必须去【屋顶】！’");
                actionType = 'flag_blocked';
                timeCost = 5;
            }
        } else {
            narrativeParts.push("青天白日满地红已经在楼顶飘扬了。");
            actionType = 'flag_already';
            timeCost = 5;
        }
    }
    // 8. Speech
    else if (['演讲', '训话', '鼓舞', '动员', '坚持', '顶住', '拼了', '万岁'].some(k => cmd.includes(k))) {
        timeCost = 60; 
        actionType = "speech";
        const recentBattle = currentStats.turnCount - currentStats.lastAttackTurn <= 2;
        const streak = currentStats.speechStreak || 0;
        const moraleGain = getSpeechMoraleGain(currentStats);
        calculatedStats.morale = Math.min(100, currentStats.morale + moraleGain);
        calculatedStats.speechStreak = streak + 1;
        statsLog.push(`💪 士气 +${moraleGain}${recentBattle ? '（战后动员）' : ''}`);
        if (streak > 0) statsLog.push('⌛ 连续演讲效果递减，休整后恢复');
        siegeIncrease = 10;
    }
    
    // --- IMMERSIVE CHAT FALLBACK ---
    if (actionType === 'idle') {
        const chatResponse = getConversationalResponse(cmd);
        narrativeParts.push(chatResponse);
        timeCost = 0;
        siegeIncrease = 0;
    }

    if (timeCost > 0 && actionType !== 'rest') {
        const fatigueGain = Math.max(1, Math.ceil(timeCost / 45)) + (actionType === 'raid' || actionType.startsWith('recapture') ? 4 : 0);
        calculatedStats.fatigue = Math.min(100, (calculatedStats.fatigue ?? currentStats.fatigue) + fatigueGain);
        if (actionType !== 'speech') calculatedStats.speechStreak = 0;
    }

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

    if (timeCost > 0 && actionType !== 'idle') {
        // Enemy movement is now turn-based and forecastable. Every meaningful
        // action advances the visible operation one step; 100% threat compresses
        // the countdown to one final warning action so old saves cannot stall.
        contactOperation = progressEnemyOperation(contactOperation);
        if (newSiege >= 100 && contactOperation.turnsRemaining > 1) {
            contactOperation = { ...contactOperation, turnsRemaining: 1 };
        }
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
    
    if (currentWoundedCount > 0) {
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
    } else {
        currentTimer = 0;
    }
    calculatedStats.woundedTimer = currentTimer;


    // --- COMBAT RESOLUTION (NEW STRICT LOGIC & SPECIFIC MORALE) ---
    if (attackTriggered) {
        eventTriggered = "attack";
        visualEffect = "shake";
        playSound('explosion');
        
        // 1. Prepare Combat Variables
        let ammoCheckSquads = [...(calculatedStats.hmgSquads || currentStats.hmgSquads)];
        let currentAmmo = calculatedStats.ammo ?? currentStats.ammo;
        let currentMgAmmo = calculatedStats.machineGunAmmo ?? currentStats.machineGunAmmo;
        let currentGrenades = calculatedStats.grenades ?? currentStats.grenades; 
        
        let currentMorale = calculatedStats.morale ?? currentStats.morale;

        // 2. Resolve the attacked sector. Lost floors permanently change the
        // enemy's route: after 1F falls, ground troops split toward 2F/B1.
        if (damageType === 'BOMBING') {
            narrativeParts.push("\n\n" + pick(ATTACK_TEXTS.BOMBING));
            attackLocation = isSectorHeld(strategicStateAfterAction, contactOperation.target)
                ? contactOperation.target
                : (['屋顶', '二楼阵地', '一楼入口', '地下室'] as Location[])
                    .find((location) => isSectorHeld(strategicStateAfterAction, location)) ?? strategicStateAfterAction.location;
        } else if (damageType === 'ARTILLERY') {
            narrativeParts.push("\n\n" + pick(ATTACK_TEXTS.ARTILLERY));
            const artilleryTargets = (['一楼入口', '二楼阵地'] as Location[])
                .filter((location) => isSectorHeld(strategicStateAfterAction, location));
            const fallbackTargets = getGroundAttackTargets(strategicStateAfterAction);
            const candidates = artilleryTargets.length > 0 ? artilleryTargets : fallbackTargets;
            attackLocation = candidates.includes(contactOperation.target)
                ? contactOperation.target
                : candidates[0] ?? strategicStateAfterAction.location;
        } else {
            const groundTargets = getGroundAttackTargets(strategicStateAfterAction);
            attackLocation = groundTargets.includes(contactOperation.target)
                ? contactOperation.target
                : groundTargets[0] ?? strategicStateAfterAction.location;
            if (attackScale === 'LARGE') narrativeParts.push("\n\n【日军总攻】鬼子发疯了！满山遍野的黄皮狗涌了上来！");
            else if (attackScale === 'MEDIUM') narrativeParts.push(`\n\n【日军强攻】日军组织了一个中队的兵力，沿突破口向${attackLocation}强行推进。`);
            else narrativeParts.push("\n\n" + pick(ATTACK_TEXTS.INFANTRY));
        }

        let barrierKills = 0;
        let sealedBarrierTriggered = false;
        const activeSeals = calculatedStats.sealedApproaches ?? strategicStateAfterAction.sealedApproaches;
        if (damageType === 'INFANTRY' && activeSeals.includes(attackLocation)) {
            sealedBarrierTriggered = true;
            attackScale = attackScale === 'LARGE' ? 'MEDIUM' : 'SMALL';
            barrierKills = 5 + Math.floor(random() * 8);
            calculatedStats.sealedApproaches = activeSeals.filter((location) => location !== attackLocation);
            narrativeParts.push(`\n\n【楼梯封锁触发】通往${attackLocation}的障碍物和预埋手榴弹同时爆炸，敌军进攻队形被截断，本次攻势规模下降。`);
            statsLog.push(`⛓ 楼梯封锁生效: 额外毙敌${barrierKills}人 / 障碍已耗尽`);
        }

        const defenseProfile = getSectorDefenseProfile(strategicStateAfterAction, attackLocation);
        const currentDistribution = strategicStateAfterAction.soldierDistribution;
        const targetFort = defenseProfile.localFortLevel;
        const effectiveDefense = defenseProfile.effectiveFortLevel;
        const targetGarrison = defenseProfile.garrison;

        const activeSquadsCount = defenseProfile.activeHmgSquads;
        const fireReadySquadsCount = defenseProfile.fireReadyHmgSquads;

        // 4. CALCULATE OUTCOME
        const outcome = calculateCombatOutcomes({
            attackScale,
            effectiveFortLevel: effectiveDefense,
            fireReadyHmgSquads: fireReadySquadsCount,
            garrisonStrength: targetGarrison,
            morale: currentMorale,
            damageType,
            supply: {
                rifleAmmo: currentAmmo,
                machineGunAmmo: currentMgAmmo,
                grenades: currentGrenades,
            },
        }, random);
        const sectorIntegrityAtContact = strategicStateAfterAction.sectorIntegrity[attackLocation] ?? 100;
        const mitigationAtContact = Math.round(defenseProfile.mitigation * 100);
        statsLog.push(`🛡️ ${attackLocation}: 驻军${targetGarrison}人 / 实际减伤${mitigationAtContact}% / 完整度${sectorIntegrityAtContact}%`);

        if (outcome.closeCombat) {
            const eligibleBayonetScenes = BAYONET_FIGHT_TEXTS.filter((scene) =>
                (currentGrenades > 0 || (!scene.includes('手榴弹') && !scene.includes('光荣弹') && !scene.includes('炸药包')))
                && (activeSquadsCount > 0 || !scene.includes('机枪')),
            );
            narrativeParts.push(currentAmmo <= 0
                ? "\n\n" + pick(eligibleBayonetScenes.length > 0 ? eligibleBayonetScenes : BAYONET_FIGHT_TEXTS)
                : '\n\n【弹药见底】零星枪声很快沉寂，日军已经冲进掩体。守军被迫上刺刀，在楼梯和破墙间展开白刃战。');
            statsLog.push(currentAmmo <= 0
                ? '⚔️ 七九弹耗尽且本层无可用机枪：转入刺刀见血的白刃防守'
                : `⚔️ 七九弹仅余${currentAmmo}发，无法维持火力：转入白刃防守`);
        } else if (currentAmmo <= 0 && damageType === 'INFANTRY') {
            statsLog.push(`⚠️ 七九弹耗尽：本层仅靠${fireReadySquadsCount > 0 ? '重机枪与手榴弹' : '手榴弹'}支撑`);
        }

        if (outcome.attackScale === 'LARGE' || damageType === 'BOMBING') visualEffect = "heavy-damage";

        // 5. Apply Results
        // 5.1 Ammunition limits kills before the result is produced. Consumption
        // is returned by the same calculation, so zero rounds can never create
        // rifle or machine-gun kills.
        const actualAmmoUsed = outcome.rifleAmmoUsed;
        const actualMgAmmoUsed = outcome.machineGunAmmoUsed;
        const actualGrenadesUsed = outcome.grenadesUsed;

        calculatedStats.ammo = currentAmmo - actualAmmoUsed;
        calculatedStats.machineGunAmmo = currentMgAmmo - actualMgAmmoUsed;
        calculatedStats.grenades = currentGrenades - actualGrenadesUsed;

        if (actualAmmoUsed > 0) statsLog.push(`🔻 消耗七九弹: ${actualAmmoUsed}`);
        if (actualMgAmmoUsed > 0) statsLog.push(`🔻 消耗机枪弹: ${actualMgAmmoUsed}`);
        if (actualGrenadesUsed > 0) statsLog.push(`🔻 消耗手榴弹: ${actualGrenadesUsed}`);
        const killBreakdown = [
            outcome.rifleKills > 0 ? `步枪${outcome.rifleKills}` : '',
            outcome.machineGunKills > 0 ? `机枪${outcome.machineGunKills}` : '',
            outcome.grenadeKills > 0 ? `手榴弹${outcome.grenadeKills}` : '',
            outcome.closeCombatKills > 0 ? `白刃${outcome.closeCombatKills}` : '',
        ].filter(Boolean).join(' / ');
        if (killBreakdown) statsLog.push(`🔥 杀伤来源: ${killBreakdown}`);

        // 5.2 Casualties
        const currentHealthy = calculatedStats.soldiers ?? currentStats.soldiers;
        const currentWounded = calculatedStats.wounded ?? currentStats.wounded;
        
        const veteranReady = hasSpecialist(strategicStateAfterAction, 'veteran', attackLocation);
        const fatigueAtContact = calculatedStats.fatigue ?? currentStats.fatigue;
        const casualtyFactor = (veteranReady ? 0.85 : 1) * getFatigueCasualtyFactor(fatigueAtContact);
        let totalDamage = Math.max(0, Math.ceil(outcome.casualtyCount * casualtyFactor));
        if (veteranReady) statsLog.push('◆ 湖北老兵班稳住火线：本层伤亡降低15%');
        if (fatigueAtContact >= 55) statsLog.push(`⚠ 守军疲劳${fatigueAtContact}%：战斗伤亡上升`);
        let deaths = 0;
        let injuries = 0;

        let woundedDeaths = 0;
        let healthyDeaths = 0;
        const exposedHealthy = Math.min(currentHealthy, targetGarrison);

        if (totalDamage > 0) {
            // Wounded are sheltered in the basement; only air raids have a
            // small chance to reach them unless that sector is directly hit.
            const woundedExposureRate = attackLocation === '地下室' ? 0.25 : damageType === 'BOMBING' ? 0.1 : 0;
            woundedDeaths = Math.min(currentWounded, Math.ceil(totalDamage * woundedExposureRate));
            deaths += woundedDeaths;
            totalDamage -= woundedDeaths;

            if (totalDamage > 0) {
                healthyDeaths = Math.min(exposedHealthy, Math.floor(totalDamage * 0.4));
                const healthyInjuries = Math.min(exposedHealthy - healthyDeaths, totalDamage - healthyDeaths);
                deaths += healthyDeaths;
                injuries += healthyInjuries;
            }
        }

        calculatedStats.wounded = Math.max(0, currentWounded - woundedDeaths + injuries);
        calculatedStats.soldiers = Math.max(0, currentHealthy - healthyDeaths - injuries);
        
        // HMG Destruction Risk 
        if (activeSquadsCount > 0 && (attackScale === 'LARGE' || damageType !== 'INFANTRY')) {
            if (random() < 0.3) {
                const targetIdx = ammoCheckSquads.findIndex((squad) => squad.status === 'active' && squad.location === attackLocation);
                if (targetIdx !== -1) {
                    const destroyedSquad = ammoCheckSquads[targetIdx];
                    const crewDeaths = Math.min(5, destroyedSquad.count);
                    const survivingCrew = Math.max(0, destroyedSquad.count - crewDeaths);
                    ammoCheckSquads[targetIdx] = { ...destroyedSquad, status: 'destroyed', count: 0 };
                    statsLog.push(`🔴 ${ammoCheckSquads[targetIdx].name}被毁!`);
                    
                    // Morale Penalty for HMG Loss
                    currentMorale = Math.max(0, currentMorale - 15);
                    statsLog.push(`💔 重火力折损: 士气 -15`);
                    
                    deaths += crewDeaths;
                    if (survivingCrew > 0) {
                        calculatedStats.soldiers = (calculatedStats.soldiers ?? currentStats.soldiers) + survivingCrew;
                        const distributionAfterLoss = calculatedStats.soldierDistribution || currentStats.soldierDistribution;
                        calculatedStats.soldierDistribution = {
                            ...distributionAfterLoss,
                            [attackLocation]: (distributionAfterLoss[attackLocation] || 0) + survivingCrew,
                        };
                        statsLog.push(`↪ ${survivingCrew}名幸存机枪手转为步兵`);
                    }
                }
                calculatedStats.hmgSquads = ammoCheckSquads;
            }
        }

        // Structure and sector damage. Global integrity measures the whole
        // warehouse; sector integrity drives the floor-by-floor butterfly effects.
        let structureDmg = (attackScale === 'LARGE' ? 10 : 2) + (damageType === 'BOMBING' ? 15 : 0);
        structureDmg = Math.max(1, structureDmg - Math.floor(targetFort * 2));
        if (targetGarrison < 30) structureDmg += 4;
        const structureBefore = calculatedStats.health ?? currentStats.health;
        const structureAfter = Math.max(0, structureBefore - structureDmg);
        calculatedStats.health = structureAfter;
        statsLog.push(`🏚 总结构: ${structureBefore}% → ${structureAfter}%`);

        const baseSectorDamage = attackScale === 'LARGE' ? 42 : attackScale === 'MEDIUM' ? 24 : 10;
        const typeSectorDamage = damageType === 'BOMBING' ? 12 : damageType === 'ARTILLERY' ? 6 : 0;
        let sectorDamage = Math.max(
            3,
            baseSectorDamage + typeSectorDamage - targetFort * 4 - Math.min(6, Math.floor(targetGarrison / 30)),
        );
        if (targetGarrison < 30) sectorDamage += 8;
        if (structureAfter <= 0) sectorDamage += 6;
        if (sealedBarrierTriggered) sectorDamage = Math.max(2, Math.floor(sectorDamage * 0.6));

        const sectorIntegrityBefore = strategicStateAfterAction.sectorIntegrity[attackLocation] ?? 100;
        const sectorIntegrityAfter = Math.max(0, sectorIntegrityBefore - sectorDamage);
        calculatedStats.sectorIntegrity = {
            ...(calculatedStats.sectorIntegrity || strategicStateAfterAction.sectorIntegrity),
            [attackLocation]: sectorIntegrityAfter,
        };
        statsLog.push(`🏢 ${attackLocation}完整度: ${sectorIntegrityBefore}% → ${sectorIntegrityAfter}%`);

        const commanderLocationAtContact = calculatedStats.location ?? currentStats.location;
        const sectorLostThisAttack = sectorIntegrityBefore > 0 && sectorIntegrityAfter <= 0;
        if (sectorLostThisAttack) {
            const sealsAtLoss = calculatedStats.sealedApproaches ?? strategicStateAfterAction.sealedApproaches;
            calculatedStats.sealedApproaches = sealsAtLoss.filter((location) => location !== attackLocation);
            const stateAtLoss: GameStats = {
                ...strategicStateAfterAction,
                ...calculatedStats,
                sectorIntegrity: calculatedStats.sectorIntegrity,
                soldierDistribution: calculatedStats.soldierDistribution || currentDistribution,
                hmgSquads: ammoCheckSquads,
            };
            const retreatDestination = getRetreatDestination(stateAtLoss, attackLocation);
            const distributionAfterCombat = { ...(calculatedStats.soldierDistribution || currentDistribution) };
            const retreatingRiflemen = Math.max(0, (distributionAfterCombat[attackLocation] || 0) - healthyDeaths - injuries);
            distributionAfterCombat[attackLocation] = 0;
            if (retreatDestination) {
                distributionAfterCombat[retreatDestination] = (distributionAfterCombat[retreatDestination] || 0) + retreatingRiflemen;
            } else if (retreatingRiflemen > 0) {
                calculatedStats.soldiers = Math.max(0, (calculatedStats.soldiers ?? currentStats.soldiers) - retreatingRiflemen);
                statsLog.push(`⚠ ${retreatingRiflemen}名守军被切断，失散或被俘`);
            }
            calculatedStats.soldierDistribution = distributionAfterCombat;

            const evacuationChance = Math.min(0.9, 0.55 + targetFort * 0.05 + (commanderLocationAtContact === attackLocation ? 0.15 : 0));
            ammoCheckSquads = ammoCheckSquads.map((squad) => {
                if (squad.status !== 'active' || squad.location !== attackLocation) return squad;
                if (retreatDestination && random() < evacuationChance) {
                    statsLog.push(`♜ ${squad.name}抢救成功，后撤至${retreatDestination}`);
                    return { ...squad, location: retreatDestination };
                }

                const crewDeaths = Math.min(squad.count, 8 + Math.floor(random() * 8));
                const survivingCrew = Math.max(0, squad.count - crewDeaths);
                deaths += crewDeaths;
                if (retreatDestination && survivingCrew > 0) {
                    calculatedStats.soldiers = (calculatedStats.soldiers ?? currentStats.soldiers) + survivingCrew;
                    distributionAfterCombat[retreatDestination] = (distributionAfterCombat[retreatDestination] || 0) + survivingCrew;
                    statsLog.push(`🔴 ${squad.name}重机枪被弃置，${survivingCrew}名幸存机枪手转为步兵`);
                } else {
                    statsLog.push(`🔴 ${squad.name}被敌军截断，整组失联`);
                }
                return { ...squad, status: 'destroyed', count: 0 };
            });
            calculatedStats.hmgSquads = ammoCheckSquads;
            calculatedStats.soldierDistribution = distributionAfterCombat;
            calculatedStats.specialistSquads = (calculatedStats.specialistSquads || currentStats.specialistSquads).map((squad) => {
                if (squad.status !== 'active' || squad.location !== attackLocation) return squad;
                if (retreatDestination) {
                    statsLog.push(`◆ ${squad.name}后撤至${retreatDestination}`);
                    return { ...squad, location: retreatDestination };
                }
                statsLog.push(`◆ ${squad.name}被切断，失去专长作用`);
                return { ...squad, status: 'depleted' };
            });

            if (commanderLocationAtContact === attackLocation && retreatDestination) {
                calculatedStats.location = retreatDestination;
                statsLog.push(`🎖 指挥部紧急后撤至${retreatDestination}`);
            }
            if (attackLocation === '屋顶' && (calculatedStats.hasFlagRaised ?? currentStats.hasFlagRaised)) {
                calculatedStats.hasFlagRaised = false;
                narrativeParts.push('\n屋顶被突破，旗杆在爆炸中折断，国旗由敢死队抢下带走。');
                statsLog.push('⚑ 屋顶失守: 国旗撤下');
            }
            if (attackLocation === '地下室') {
                const woundedAtLoss = calculatedStats.wounded ?? currentStats.wounded;
                const hospitalDeaths = Math.min(woundedAtLoss, Math.ceil(woundedAtLoss * 0.25));
                calculatedStats.wounded = Math.max(0, woundedAtLoss - hospitalDeaths);
                calculatedStats.medkits = Math.floor((calculatedStats.medkits ?? currentStats.medkits) * 0.75);
                calculatedStats.ammo = Math.floor((calculatedStats.ammo ?? currentStats.ammo) * 0.9);
                deaths += hospitalDeaths;
                calculatedStats.consequenceFlags = addConsequenceFlag(calculatedStats.consequenceFlags || currentStats.consequenceFlags, 'hospital_lost');
                statsLog.push(`⚕ 地下室医院失守: 重伤员死亡${hospitalDeaths}人 / 药品与弹药部分丢失`);
            }

            calculatedStats.health = Math.max(0, (calculatedStats.health ?? currentStats.health) - 8);
            currentMorale = Math.max(0, currentMorale - 12);
            narrativeParts.push(`\n\n【防区失守：${attackLocation}】\n敌军突破最后一道掩体。${retreatDestination ? `残余守军沿内部通道撤往${retreatDestination}。` : '所有退路均被切断，防线已经被分割。'}从现在起，敌军会沿新的突破口继续向仓库纵深推进。`);
            statsLog.push(`▼ ${attackLocation}失守: 总结构额外-8 / 士气-12`);
            appendCampaignHistory(currentStats, calculatedStats, `${attackLocation}失守`, `${retreatingRiflemen}名残余守军${retreatDestination ? `撤往${retreatDestination}` : '被切断'}。`, 'bad');
        }

        if (commanderLocationAtContact === attackLocation) {
            const commanderRisk = calculateCommanderDeathRisk(strategicStateAfterAction, attackLocation);
            const commanderKilled = random() < commanderRisk;
            statsLog.push(`🎖 指挥官处于交战区: 阵亡风险${formatCommanderRisk(commanderRisk)}${commanderKilled ? '（判定命中）' : '（幸存）'}`);
            if (commanderKilled) {
                calculatedStats.isGameOver = true;
                calculatedStats.gameResult = 'defeat_commander';
                calculatedStats.gameOverReason = 'commander_killed';
                calculatedStats.finalRank = calculateScore({ ...currentStats, ...calculatedStats }, 'defeat_commander').rank;
                eventTriggered = 'game_over';
                visualEffect = 'heavy-damage';
                narrativeParts.push(`\n\n【将星陨落】\n一发炮弹击穿${attackLocation}的指挥掩体。副官扑过来时，你已经倒在碎砖和硝烟之中。部队尚未死光，但失去最高指挥后，各防区通信迅速中断，成建制防守无法继续。\n\n结局达成：【阵前殉职】`);
            }
        }

        // Fortification degradation is reported as the percentage of real
        // mitigation lost, rather than exposing an abstract level number.
        const integrityAfterCombat = calculatedStats.sectorIntegrity?.[attackLocation]
            ?? strategicStateAfterAction.sectorIntegrity[attackLocation];
        if (integrityAfterCombat > 0 && random() < (attackScale === 'LARGE' ? 0.7 : 0.2)) {
            const target = attackLocation || '一楼入口';
            const curLv = calculatedStats.fortificationLevel?.[target] ?? currentStats.fortificationLevel[target];
            if (curLv > 0) {
                const newLv = curLv - 1;
                const fortificationBefore = { ...(calculatedStats.fortificationLevel || currentStats.fortificationLevel) };
                const stateBeforeDamage: GameStats = {
                    ...strategicStateAfterAction,
                    ...calculatedStats,
                    fortificationLevel: fortificationBefore,
                    sectorIntegrity: calculatedStats.sectorIntegrity || strategicStateAfterAction.sectorIntegrity,
                    soldierDistribution: calculatedStats.soldierDistribution || currentDistribution,
                    hmgSquads: ammoCheckSquads,
                };
                const mitigationBeforeDamage = Math.round(getSectorDefenseProfile(stateBeforeDamage, target).mitigation * 100);
                calculatedStats.fortificationLevel = { ...fortificationBefore, [target]: newLv };
                const currentBuildCount = calculatedStats.fortificationBuildCounts?.[target]
                    ?? currentStats.fortificationBuildCounts[target]
                    ?? curLv * 2;
                calculatedStats.fortificationBuildCounts = {
                    ...(calculatedStats.fortificationBuildCounts || currentStats.fortificationBuildCounts),
                    [target]: Math.min(currentBuildCount, newLv * 2 + 1),
                };
                const stateAfterDamage: GameStats = {
                    ...stateBeforeDamage,
                    fortificationLevel: calculatedStats.fortificationLevel,
                    fortificationBuildCounts: calculatedStats.fortificationBuildCounts,
                };
                const mitigationAfterDamage = Math.round(getSectorDefenseProfile(stateAfterDamage, target).mitigation * 100);
                narrativeParts.push("\n\n" + pick(FORT_DAMAGE_SCENES));
                statsLog.push(`🏚️ ${target}掩体被炸开: 实际减伤 ${mitigationBeforeDamage}% → ${mitigationAfterDamage}%`);
            }
        }

        // Apply Kills
        const prevKills = calculatedStats.enemiesKilled ?? currentStats.enemiesKilled ?? 0;
        calculatedStats.enemiesKilled = prevKills + outcome.enemiesKilled + barrierKills;
        
        // Logs for Casualties/Kills
        if (deaths > 0) {
            handleSoldierDeaths(currentStats, calculatedStats, deaths, narrativeParts);
            statsLog.push(`🔴 阵亡: ${deaths}人`);
        }
        if (injuries > 0) statsLog.push(`🩹 新增伤员: ${injuries}人`);
        statsLog.push(`💀 击毙日军: ${outcome.enemiesKilled + barrierKills}人`);
        
        // --- MORALE CALCULATION (NEW) ---
        // 1. Gain from Kills: +1 per 8 kills
        let moraleGain = Math.floor(outcome.enemiesKilled / 8);
        
        // Bonus for holding well
        if (outcome.attackScale === 'LARGE' && deaths < 5) moraleGain += 8; // Heroic hold
        else if (outcome.attackScale === 'MEDIUM' && deaths === 0) moraleGain += 3; // Perfect hold

        // 2. Loss from Deaths: -2 per death
        const moraleLoss = deaths * 2;
        
        const netChange = moraleGain - moraleLoss;
        currentMorale = Math.max(0, Math.min(100, currentMorale + netChange));
        calculatedStats.morale = currentMorale;

        if (moraleGain > 0) statsLog.push(`💪 战果振奋: 士气 +${moraleGain}`);
        if (moraleLoss > 0) statsLog.push(`💔 伤亡惨重: 士气 -${moraleLoss}`);

        const stateAfterContact: GameStats = {
            ...strategicStateAfterAction,
            ...calculatedStats,
            soldierDistribution: calculatedStats.soldierDistribution || strategicStateAfterAction.soldierDistribution,
            sectorIntegrity: calculatedStats.sectorIntegrity || strategicStateAfterAction.sectorIntegrity,
            hmgSquads: calculatedStats.hmgSquads || strategicStateAfterAction.hmgSquads,
            specialistSquads: calculatedStats.specialistSquads || strategicStateAfterAction.specialistSquads,
            consequenceFlags: calculatedStats.consequenceFlags || strategicStateAfterAction.consequenceFlags,
        };
        calculatedStats.enemyOperation = createEnemyOperation(stateAfterContact, random, contactOperation.id + 1);
    }

    // --- Mutiny & Finalize (Preserved) ---
    const finalMorale = calculatedStats.morale ?? currentStats.morale;
    if (!calculatedStats.isGameOver && finalMorale < 30 && random() < 0.4) {
        narrativeParts.push("\n\n" + pick(MUTINY_SCENES));
        const lost = Math.floor(random() * 10) + 5; 
        calculatedStats.soldiers = Math.max(0, (calculatedStats.soldiers ?? currentStats.soldiers) - lost);
        statsLog.push(`🏃 逃兵/失踪: ${lost}人`);
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

    // ... (Tactical Card, Game Over, Narrative Gen Preserved) ...
    if (!currentStats.activeTacticalCard && random() < 0.1 && !calculatedStats.isGameOver) {
        const used = calculatedStats.usedTacticalCards || currentStats.usedTacticalCards || [];
        const availableCards = TACTICAL_CARDS.filter(c => !used.includes(c.id));
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
    const activeHmgCrew = finalHmgSquads.reduce((sum, squad) => sum + (squad.status === 'active' ? squad.count : 0), 0);
    const finalCombatants = finalSoldiers + activeHmgCrew;
    const finalWounded = calculatedStats.wounded ?? currentStats.wounded;
    const forceCollapsed = finalCombatants < 20;
    const finalSectorIntegrity = calculatedStats.sectorIntegrity || currentStats.sectorIntegrity;
    const corePositionsLost = finalSectorIntegrity['一楼入口'] <= 0
        && finalSectorIntegrity['二楼阵地'] <= 0
        && finalSectorIntegrity['地下室'] <= 0;
    // Global structure at 0% makes every following hit more dangerous, but it
    // does not erase surviving floor garrisons. Defeat requires the connected
    // core positions to be lost or the actual combat force to collapse.
    const positionCollapsed = corePositionsLost;
    const collapseDetected = forceCollapsed || positionCollapsed;
    const immediateCollapse = finalCombatants <= 0;
    const lastStandAlreadyUsed = calculatedStats.lastStandUsed ?? currentStats.lastStandUsed ?? false;
    
    // --- GAME OVER CHECKS (VICTORY / DEFEAT) ---
    // The old build ended immediately when riflemen fell below 20, even while
    // two HMG crews and wounded survivors were still visible in the UI. The
    // first collapse now becomes an explicit, recoverable last-stand warning.
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
        calculatedStats.gameOverReason = forceCollapsed && positionCollapsed
            ? 'total_collapse'
            : forceCollapsed
                ? 'combat_force_collapsed'
                : 'position_collapsed';
        
        // CHECK ENDING 2: Counter-Attack
        // Threshold: Aggressive actions > 3
        if (aggression > 3) {
            calculatedStats.gameResult = 'defeat_assault';
            const report = calculateScore({ ...currentStats, ...calculatedStats }, 'defeat_assault');
            calculatedStats.finalRank = report.rank;
            narrativeParts.push(`\n\n【反攻失败】\n连续主动出击耗尽了最后的成建制战斗力量。仍有伤员和失散士兵活着，但四行仓库已经无法继续防守。\n\n结局达成：【反攻的号角】\n${report.text}`);
        }
        // CHECK ENDING 5: Martyr (Flag Raised + Death)
        else if (flagRaised && immediateCollapse && finalWounded <= 0) {
            calculatedStats.gameResult = 'defeat_martyr';
            const report = calculateScore({ ...currentStats, ...calculatedStats }, 'defeat_martyr');
            calculatedStats.finalRank = report.rank;
            narrativeParts.push(`\n\n【壮烈殉国】\n四行仓库被攻破了。但在顶楼，那面旗帜依然在硝烟中飘扬。日军指挥官看着旗帜，久久没有下令降旗。\n\n结局达成：【血染孤旗】\n${report.text}`);
        }
        // DEFAULT DEFEAT
        else {
            calculatedStats.gameResult = 'defeat_generic';
            const report = calculateScore({ ...currentStats, ...calculatedStats }, 'defeat_generic');
            calculatedStats.finalRank = report.rank;
            const collapseText = forceCollapsed && positionCollapsed
                ? `可战兵力只剩 ${finalCombatants} 人，核心楼层也已全部失守。残余人员被迫停止成建制抵抗。`
                : forceCollapsed
                    ? `可战兵力只剩 ${finalCombatants} 人，已经无法覆盖各处防线。伤员和幸存者仍在，但成建制防守宣告结束。`
                    : corePositionsLost
                        ? `一楼、二楼与地下室相继失守，仓库纵深已被敌军切断。仍有 ${finalCombatants} 名可战人员与伤员幸存，但阵地已经无法恢复。`
                        : `核心防区已被完全切断。仍有 ${finalCombatants} 名可战人员与伤员幸存，但阵地已经失守。`;
            narrativeParts.push(`\n\n【战役结束】\n${collapseText}\n\n最终军衔评价：${report.rank}\n${report.text}`);
        }

    } else if (finalDay > 5) {
        // ENDING 1: Normal Hold
        calculatedStats.isGameOver = true;
        calculatedStats.gameResult = 'victory_hold';
        calculatedStats.gameOverReason = 'mission_complete';
        eventTriggered = 'victory';
        const report = calculateScore({ ...currentStats, ...calculatedStats }, 'victory_hold');
        calculatedStats.finalRank = report.rank;
        narrativeParts.push(`\n\n【战役胜利】\n你坚守了整整六天。在全世界的注视下，孤军完成了不可能的任务。\n\n结局达成：【固若金汤】\n${report.text}`);
    }

    let responseText = "";
    if (actionType === 'move') responseText = pick(COMMAND_RESPONSES.MOVE).replace('{dest}', calculatedStats.location || "");
    else if (actionType === 'build') responseText = pick(BUILD_SCENES);
    else if (actionType === 'build_max') responseText = pick(COMMAND_RESPONSES.BUILD_MAX);
    else if (actionType === 'rest') responseText = pick(COMMAND_RESPONSES.REST);
    else if (actionType === 'heal') responseText = pick(HEAL_SUCCESS_SCENES);
    else if (actionType === 'heal_fail') responseText = pick(COMMAND_RESPONSES.HEAL_FAIL);
    else if (actionType === 'flag_warn') responseText = pick(COMMAND_RESPONSES.FLAG_WARN);
    else if (actionType === 'flag_success') responseText = pick(COMMAND_RESPONSES.FLAG_SUCCESS);
    else if (actionType === 'speech') responseText = pick(SPEECH_SCENES);
    
    if (responseText) narrativeParts.unshift(responseText);
    
    let finalNarrative = narrativeParts.join("");

    if (!calculatedStats.isGameOver && !eventTriggered.includes('attack') && random() < 0.2) {
        const alreadyTriggered = calculatedStats.triggeredEvents || currentStats.triggeredEvents || [];
        const flags = calculatedStats.consequenceFlags || currentStats.consequenceFlags || [];
        const potentialDilemmas = ALL_DILEMMAS.filter(d =>
            !alreadyTriggered.includes(d.id)
            && (!d.requiresFlag || flags.includes(d.requiresFlag))
            && (!d.excludesFlag || !flags.includes(d.excludesFlag))
            && (d.minDay === undefined || finalDay >= d.minDay));
        if (potentialDilemmas.length > 0) {
            dilemmaToTrigger = pick(potentialDilemmas);
        }
    }

    // FINAL FORMATTING: Append Stats Log at the VERY END, separated
    if (statsLog.length > 0) {
        finalNarrative += "\n\n━━━━━━━━━━━━━━\n" + statsLog.join("\n");
    }

    return {
        narrative: finalNarrative,
        updatedStats: calculatedStats,
        eventTriggered,
        visualEffect,
        attackLocation, 
        dilemma: dilemmaToTrigger,
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
