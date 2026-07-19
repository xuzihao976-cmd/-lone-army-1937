
import { GameStats, GameTurnResult, Dilemma, Location, EndingType } from "../types";
import { playSound } from "../utils/sound";
import { isExplicitRetreatCommand, isMoveCommand } from './intents';
import { getDayProfile } from '../data/dayProfiles';
import { buildTurnSummary } from './turnSummary';

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

const addMinutes = (timeStr: string, mins: number): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins, 0, 0);
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
};

const checkNewDay = (current: string, next: string) => {
    const h1 = parseInt(current.split(':')[0]);
    const h2 = parseInt(next.split(':')[0]);
    return h2 < h1;
};

// --- REBALANCED DEFENSE & DAMAGE LOGIC ---
const calculateCombatOutcomes = (
    attackScale: 'SMALL' | 'MEDIUM' | 'LARGE',
    avgFortLevel: number,
    activeHmgSquads: number,
    damageType: 'INFANTRY' | 'ARTILLERY' | 'BOMBING',
    isBayonet: boolean
) => {
    // 1. Determine Enemy Attack Power (Potential Casualties they can inflict)
    let baseEnemyPower = 0;
    // How many enemies are attacking?
    let enemyCount = 0; 

    if (attackScale === 'SMALL') {
        baseEnemyPower = 5 + random() * 5; // 5-10 dmg potential
        enemyCount = 5 + Math.floor(random() * 5);
    } else if (attackScale === 'MEDIUM') {
        baseEnemyPower = 15 + random() * 15; // 15-30 dmg potential
        enemyCount = 15 + Math.floor(random() * 25);
    } else { // LARGE
        baseEnemyPower = 40 + random() * 40; // 40-80 dmg potential
        enemyCount = 50 + Math.floor(random() * 100);
    }

    if (damageType === 'ARTILLERY') baseEnemyPower *= 1.5; // Artillery hits harder
    if (damageType === 'BOMBING') baseEnemyPower *= 2.0; // Bombs hit very hard

    // 2. Calculate Mitigation (Forts + HMG)
    // Formula: 0.1 (Base) + (AvgLevel * 0.25)
    // Lv0 = 10% mitigation (90% damage taken) -> Ruin
    // Lv1 = 35% mitigation (65% damage taken) -> Sandbags
    // Lv2 = 60% mitigation (40% damage taken) -> Reinforced
    // Lv3 = 85% mitigation (15% damage taken) -> Fortress
    let mitigation = 0.1 + (avgFortLevel * 0.25);
    
    // HMG Suppression: Each squad adds 5% mitigation
    mitigation += (activeHmgSquads * 0.05);

    // Cap mitigation at 95%
    mitigation = Math.min(0.95, mitigation);

    // 3. Calculate Friendly Casualties
    // If bayonet charge, ignore mitigation (0% mitigation)
    const effectiveMitigation = isBayonet ? 0 : mitigation;
    
    // Final Damage = BasePower * (1 - Mitigation)
    let casualtyCount = Math.ceil(baseEnemyPower * (1 - effectiveMitigation));
    
    // Random variance +/- 20%
    casualtyCount = Math.floor(casualtyCount * (0.8 + random() * 0.4));

    // 4. Calculate Enemies Killed
    // Better forts = better firing angles = more kills
    // HMGs = multiplier
    const killEfficiency = 0.5 + (avgFortLevel * 0.2) + (activeHmgSquads * 0.3);
    let enemiesKilled = Math.floor(enemyCount * killEfficiency);
    
    // Cap kills at actual enemy count (but sometimes we overestimate/kill reserves)
    if (enemiesKilled > enemyCount * 1.2) enemiesKilled = Math.floor(enemyCount * 1.2);

    return { casualtyCount, enemiesKilled, enemyCount, attackScale };
};


const calculateScore = (stats: GameStats, endingType: EndingType): { rank: string, text: string } => {
    let rank = "尽忠职守";
    let text = "你完成了基本的守备任务，但在惨烈的战斗中损失惨重。";
    
    if (endingType === 'defeat_deserter') {
        return { rank: "懦夫", text: "你在战斗初期抛弃了部队。你的名字将被钉在耻辱柱上，后世无人知晓你的下落。" };
    }
    
    if (endingType === 'defeat_assault') {
        return { rank: "勇猛的莽夫", text: "你的勇气令人敬佩，但你的鲁莽葬送了全营。作为指挥官，你选择了最壮烈但也最惨痛的毁灭方式。" };
    }

    if (endingType === 'defeat_martyr') {
        return { rank: "民族英雄", text: "旗帜不倒，军魂永存！你们全员殉国，但那面旗帜在四行仓库上空飘扬的画面，将永远激励着中华民族！" };
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
         text = "仓库失守，全军覆没。但你们让日军付出了沉重的代价。";
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
    
    // --- Start Game (RESTORED TUTORIAL TEXT) ---
    if (cmd === "start_game") {
         calculatedStats.tutorialStep = 1; 
        calculatedStats.day = 0;
        calculatedStats.location = '一楼入口';
        calculatedStats.currentTime = "19:00"; 
        calculatedStats.triggeredEvents = []; 
        calculatedStats.usedTacticalCards = []; 
        playSound('radio'); 
        
        return {
            narrative: "1937年10月26日，19:00。上海闸北，四行仓库。\n\n冷雨凄迷，苏州河水在黑暗中静静流淌。你刚刚接管防务。\n\n【战场仪表盘说明】\n● 兵力：你的核心生命值，低于20人判定失败。\n● 士气：影响战斗力。过低会导致逃兵或哗变。\n● 威胁值：顶部红条。充满时日军将发动进攻。\n● 战地顾问：右下角绿色按钮，不懂就问他。\n\n“团附！”副官冲过来，“一楼大门工事太薄弱了！鬼子坦克一炮就能轰开！请立即下令【加固一楼】！”",
            updatedStats: calculatedStats,
            eventTriggered: 'none',
            enemyIntel: "侦察兵报告：日军正在集结步兵，似乎准备进行试探性进攻。"
        };
    }
    
    // --- Tutorial Logic (RESTORED TUTORIAL TEXT) ---
    if (currentStats.tutorialStep > 0 && currentStats.tutorialStep < 3) {
        if (currentStats.tutorialStep === 1) {
            if (cmd.includes('加固') || cmd.includes('修')) {
                 calculatedStats.tutorialStep = 2;
                 calculatedStats.fortificationLevel = { ...currentStats.fortificationLevel, '一楼入口': 2 };
                 calculatedStats.currentTime = "21:00";
                 playSound('click');
                 statsLog.push("🔨 一楼工事等级 Lv.2");
                 return {
                     narrative: "你组织人手疯狂堆砌沙袋，大门终于被封死了。安全感稍微提升了一些。\n\n“呼...”副官瘫坐在地上，“团附，弟兄们从撤退到现在两天没合眼了，士气低落。如果不【休息】，这仗没法打。请下令【休息整顿】（恢复士气与体力）。”\n\n🔨 一楼工事等级 Lv.2",
                     updatedStats: calculatedStats,
                     eventTriggered: 'none',
                     visualEffect: 'shake'
                 };
            }
            return { narrative: "副官急得直跺脚：“团附！大门要紧啊！鬼子马上就到了！快下令【加固一楼】吧！”", updatedStats: {} };
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
                 statsLog.push("🏥 阵地状态 +10");
                 
                 playSound('click');
                 return {
                     narrative: "你下令全营轮流休息。鼾声在仓库里此起彼伏。这一觉让大家的精神恢复了不少。\n\n不知不觉，天亮了。\n\n10月27日，第一天。\n晨雾散去，日军的膏药旗在废墟中若隐若现。真正的恶战，开始了。\n\n💤 士气 +15\n🏥 阵地状态 +10",
                     updatedStats: calculatedStats,
                     eventTriggered: 'new_day',
                     enemyIntel: "侦察兵报告：日军步兵已展开，主要威胁为冷枪和轻型迫击炮。"
                 };
             }
             return { narrative: "“团附，弟兄们站着都要睡着了！请下令【休息】！”", updatedStats: {} };
        }
    }

    // --- DILEMMA RESOLUTION ---
    if (cmd.startsWith("evt_resolve:")) {
        const parts = cmd.split(':');
        const evtId = parts[1];
        const optionIdx = parseInt(parts[2]);
        let resolveText = "";
        
        const prevEvents = calculatedStats.triggeredEvents || currentStats.triggeredEvents || [];
        if (!prevEvents.includes(evtId)) calculatedStats.triggeredEvents = [...prevEvents, evtId];
        
        playSound('click');

        // ... (Dilemma logic largely same, just ensuring statsLog is used)
        if (evtId === 'student_run') {
            if (optionIdx === 0) { 
                const died = Math.floor(random() * 16); 
                calculatedStats.medkits = currentStats.medkits + 10;
                calculatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
                handleSoldierDeaths(currentStats, calculatedStats, died, narrativeParts);
                resolveText = `【惨烈接应】你下令机枪全线开火压制！在弹雨中，学生们把药品扔进了窗口。但日军的掷弹筒也砸了过来...`;
                statsLog.push("📦 获得急救包 +10");
                if (died > 0) {
                     statsLog.push(`🔴 阵亡: ${died}人`);
                     statsLog.push(`💔 士气 -${died * 2}`); // Penalty per death
                     calculatedStats.morale = Math.max(0, currentStats.morale - (died * 2));
                }
                visualEffect = 'heavy-damage';
            } else { 
                calculatedStats.morale = Math.max(0, currentStats.morale - 3);
                resolveText = "你痛苦地闭上了眼睛，没有下令开火。眼睁睁看着那几个年轻的身影倒在桥头。";
                statsLog.push("💔 士气 -3");
            }
        } 
        else if (evtId === 'smuggler_boat') {
            if (optionIdx === 0) {
                const isTrap = random() < 0.5;
                if (isTrap) {
                    const died = 10 + Math.floor(random() * 10);
                    calculatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
                    handleSoldierDeaths(currentStats, calculatedStats, died, narrativeParts);
                    resolveText = "【中计！】船刚靠岸，帆布揭开，露出的不是弹药，而是黑洞洞的机枪口！";
                    statsLog.push(`🔴 伏击阵亡: ${died}人`);
                    statsLog.push(`💔 士气 -${died * 2}`);
                    calculatedStats.morale = Math.max(0, currentStats.morale - (died * 2));
                    visualEffect = 'heavy-damage';
                } else {
                    calculatedStats.ammo = currentStats.ammo + 3000;
                    resolveText = "【惊险交易】对方收了“金条”，把几个沉重的木箱推上了岸。里面是崭新的重机枪子弹！";
                    statsLog.push("📦 获得七九弹 +3000");
                }
            } else {
                resolveText = "“滚！”你朝天鸣枪。小船迅速消失在迷雾中。";
            }
        }
        else if (evtId === 'puppet_defector') {
             if (optionIdx === 0) {
                const isTrap = random() < 0.3;
                if (isTrap) {
                     resolveText = "【自杀袭击】“板载！”那几个伪军突然拉响了身上的炸药包！巨大的爆炸震塌了仓库的一角。";
                     const oldLv = currentStats.fortificationLevel['一楼入口'];
                     calculatedStats.fortificationLevel = { ...currentStats.fortificationLevel, '一楼入口': Math.max(0, oldLv - 1) };
                     statsLog.push("🏚️ 一楼工事等级 -1");
                     visualEffect = 'heavy-damage';
                     playSound('explosion');
                } else {
                    calculatedStats.grenades = currentStats.grenades + 50;
                    resolveText = "他们是真的投诚。这几名伪军哭着跪在地上，把带来的手榴弹交给了我们。";
                    statsLog.push("📦 获得手榴弹 +50");
                }
             } else {
                 calculatedStats.morale = Math.max(0, currentStats.morale - 2);
                 resolveText = "为了安全起见，你下令射击。几具尸体倒在门外。";
             }
        }
        // NEW EVENT RESOLUTIONS
        else if (evtId === 'wrecked_truck') {
            if (optionIdx === 0) {
                // High Risk, High Reward
                const died = Math.floor(random() * 5) + 1;
                calculatedStats.ammo = currentStats.ammo + 2000;
                calculatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
                handleSoldierDeaths(currentStats, calculatedStats, died, narrativeParts);
                
                resolveText = "【生死抢运】烟雾弹掩护下，突击小组冲了出去。日军的狙击手盲射击倒了几名兄弟，但我们成功拖回了弹药箱。";
                statsLog.push("📦 获得七九弹 +2000");
                statsLog.push(`🔴 阵亡: ${died}人`);
                statsLog.push(`💔 士气 -${died * 2}`);
                calculatedStats.morale = Math.max(0, currentStats.morale - (died * 2));
            } else {
                calculatedStats.morale = Math.max(0, currentStats.morale - 2);
                resolveText = "你放下了望远镜。那几箱弹药不值得用人命去填。";
                statsLog.push("💔 士气 -2");
            }
        }
        else if (evtId === 'stray_airdrop') {
            if (optionIdx === 0) {
                // Skill Check
                const isSuccess = random() > 0.3; 
                if (isSuccess) {
                    calculatedStats.medkits = currentStats.medkits + 5;
                    calculatedStats.sandbags = currentStats.sandbags + 100;
                    resolveText = "【绝技】这名四川籍的小战士像猴子一样灵活，徒手爬上了避雷针，割断绳索，带着物资包安全滑下。大家爆发出欢呼！";
                    statsLog.push("📦 获得急救包 +5");
                    statsLog.push("📦 获得粮包 +100");
                    statsLog.push("💪 士气 +5");
                    calculatedStats.morale = Math.min(100, currentStats.morale + 5);
                } else {
                    calculatedStats.soldiers = Math.max(0, currentStats.soldiers - 1);
                    resolveText = "【坠落】一阵横风吹过，战士脚下一滑，从三楼坠落... 物资包也随之掉落摔散。";
                    statsLog.push("🔴 意外坠亡: 1人");
                    statsLog.push("💔 士气 -5");
                    calculatedStats.morale = Math.max(0, currentStats.morale - 5);
                }
            } else {
                // Safe but less
                calculatedStats.sandbags = currentStats.sandbags + 50;
                resolveText = "神枪手一枪打断了绳索。包裹重重摔在地上，里面的药品碎了，只捡回一些干粮。";
                statsLog.push("📦 获得粮包 +50");
            }
        }
        else if (evtId === 'brit_ceasefire') {
            if (optionIdx === 0) {
                calculatedStats.morale = Math.max(0, currentStats.morale - 5);
                calculatedStats.medkits = currentStats.medkits + 5;
                resolveText = "【妥协】你咬着牙下令：“朝南面打的枪，都给我停了！”英军对此表示赞赏。";
                statsLog.push("💔 士气 -5");
                statsLog.push("📦 获得急救包 +5");
            } else {
                calculatedStats.morale = Math.min(100, currentStats.morale + 5);
                resolveText = "【强硬】“这也是中国领土！”你拒绝了英军的要求。";
                statsLog.push("💪 士气 +5");
            }
        }

        let fullNarrative = narrativeParts.length > 0 ? (resolveText + "\n" + narrativeParts.join("")) : resolveText;
        if (statsLog.length > 0) {
            fullNarrative += "\n\n" + statsLog.join("\n");
        }

        return {
            narrative: fullNarrative,
            updatedStats: calculatedStats,
            eventTriggered: 'none'
        };
    }

    // --- Command Parsing & Action Logic ---
    let timeCost = 5; 
    let actionType = "idle";
    let siegeIncrease = 5; 
    
    // 1. RAID (Aggressive Action for Ending 2)
    if (cmd.includes('突袭') || cmd.includes('夜袭') || cmd.includes('偷袭') || cmd.includes('反击') || cmd.includes('进攻')) {
        const currentH = parseInt(currentStats.currentTime.split(':')[0]);
        
        if (currentH >= 0 && currentH < 5) {
            // Only a raid that actually leaves the warehouse counts as aggression.
            calculatedStats.aggressiveCount = (currentStats.aggressiveCount || 0) + 1;
            timeCost = 60; 
            const isSuccess = random() < 0.4; 
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
        
        const roll = random();
        if (roll < 0.4) {
            // Success: Ammo
            const gain = Math.floor(random() * 100) + 50;
            calculatedStats.ammo = currentStats.ammo + gain;
            narrativeParts.push("你在仓库深处的废墟里翻找，在一个被压扁的木箱里发现了一些散落的子弹。虽然不多，但聊胜于无。");
            statsLog.push(`📦 搜寻获得: 七九弹 +${gain}`);
        } else if (roll < 0.6) {
             // Success: Meds or Sandbags
             if (random() > 0.5) {
                 calculatedStats.medkits = currentStats.medkits + 2;
                 narrativeParts.push("在一个角落里，你找到了几卷还没受潮的绷带。");
                 statsLog.push(`📦 搜寻获得: 急救包 +2`);
             } else {
                 calculatedStats.sandbags = currentStats.sandbags + 50;
                 narrativeParts.push("这里还有几袋面粉！虽然有点发霉，但用来当沙袋正合适。");
                 statsLog.push(`📦 搜寻获得: 粮包 +50`);
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
    }
    // NEW ACTION: SCOUT
    else if (cmd.includes('侦察') || cmd.includes('观察')) {
        timeCost = 15;
        siegeIncrease = 5;
        actionType = "scout";
        const intel = pick([
            "日军正在搬运尸体，看来刚才的战斗让他们也伤筋动骨了。",
            "西侧的日军机枪阵地似乎在换班，这可能是个射击的好机会。",
            "苏州河对岸有很多百姓在挂出标语支持我们。这让弟兄们很受鼓舞。",
            "有一小队日军正在挖掘战壕，似乎企图向大门逼近。",
        ]);
        narrativeParts.push(`你举起望远镜仔细观察敌情。\n\n“团附，看那边。”\n${intel}`);
        // Small chance to find a target
        if (random() < 0.2) {
             const gain = 10;
             calculatedStats.enemiesKilled = currentStats.enemiesKilled + gain;
             narrativeParts.push("\n\n砰！神枪手抓住了机会，一枪击毙了敌军的指挥官。日军顿时乱作一团。");
             statsLog.push(`💀 狙击战果: 击毙 ${gain} 人`);
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
        timeCost = 15;
        actionType = "move";
        if (cmd.includes('顶')) calculatedStats.location = '屋顶';
        else if (cmd.includes('二楼')) calculatedStats.location = '二楼阵地';
        else if (cmd.includes('一楼')) calculatedStats.location = '一楼入口';
        else if (cmd.includes('地下')) calculatedStats.location = '地下室';
        playSound('click');
    }
    // 4. Build
    else if (cmd.includes('加固') || cmd.includes('修') || cmd.includes('工事')) {
        let targetLoc = currentStats.location;
        if (cmd.includes('一楼')) targetLoc = '一楼入口';
        else if (cmd.includes('二楼')) targetLoc = '二楼阵地';
        else if (cmd.includes('屋顶')) targetLoc = '屋顶';
        else if (cmd.includes('地下')) targetLoc = '地下室';

        const currentLevel = calculatedStats.fortificationLevel?.[targetLoc] ?? currentStats.fortificationLevel[targetLoc] ?? 0;
        
        if (currentLevel >= 3) {
            actionType = "build_max";
            timeCost = 5; 
        } else {
            if (currentStats.sandbags >= 200) {
                timeCost = 120; // 2 hours
                actionType = "build";
                const currentCount = currentStats.fortificationBuildCounts?.[targetLoc] || 0;
                const newCount = currentCount + 1;
                const newLevel = Math.floor(newCount / 2);
                
                calculatedStats.sandbags = currentStats.sandbags - 200;
                calculatedStats.fortificationBuildCounts = { ...currentStats.fortificationBuildCounts, [targetLoc]: newCount };
                calculatedStats.fortificationLevel = { ...currentStats.fortificationLevel, [targetLoc]: Math.min(3, newLevel) };
                
                if (random() < 0.3) {
                    const fatigueLoss = Math.floor(random() * 6);
                    if (fatigueLoss > 0) {
                        const minM = currentStats.minMorale || 0;
                        calculatedStats.morale = Math.max(minM, currentStats.morale - fatigueLoss);
                        statsLog.push(`💔 劳累: 士气 -${fatigueLoss}`);
                    }
                }
                statsLog.push(`🧱 消耗粮包: 200`);
                statsLog.push(`🔨 ${targetLoc}工事进度 +1`);
                siegeIncrease = 15;
            } else {
                actionType = "fail";
                timeCost = 0;
                siegeIncrease = 0;
                narrativeParts.push('工兵摊开空空的物资袋：“团附，筑垒用的粮包不够了，至少还需要200份。”');
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
        siegeIncrease = 35; 
        statsLog.push("💤 士气 +10");
        statsLog.push("🏥 阵地状态 +5");
    }
    // 6. Heal
    else if (cmd.includes('治疗') || cmd.includes('抢救') || cmd.includes('救') || cmd.includes('医')) {
        timeCost = 60; 
        const currentWounded = currentStats.wounded || 0;
        if (currentWounded > 0 && currentStats.medkits > 0) {
            actionType = "heal";
            const healPotential = Math.floor(random() * 4) + 2; 
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
        if (!currentStats.hasFlagRaised) {
            if (currentStats.location === '屋顶') {
                if (!currentStats.flagWarned) {
                    timeCost = 5;
                    calculatedStats.flagWarned = true;
                    actionType = "flag_warn";
                } else {
                    timeCost = 30;
                    actionType = "flag_success";
                    calculatedStats.hasFlagRaised = true;
                    calculatedStats.morale = Math.min(100, currentStats.morale + 30);
                    calculatedStats.minMorale = 30;
                    statsLog.push("💪 士气 +30");
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
        calculatedStats.morale = Math.min(100, currentStats.morale + 3);
        statsLog.push("💪 士气 +3");
        siegeIncrease = 10;
    }
    
    // --- IMMERSIVE CHAT FALLBACK ---
    if (actionType === 'idle') {
        const chatResponse = getConversationalResponse(cmd);
        narrativeParts.push(chatResponse);
        timeCost = 0;
        siegeIncrease = 0;
    }

    // --- Time & Siege Update ---
    const nextTimeStr = addMinutes(currentStats.currentTime, timeCost);
    const totalMinutesPassed = timeCost;
    const currentSiege = calculatedStats.siegeMeter ?? currentStats.siegeMeter ?? 0;
    const dayProfile = getDayProfile(currentStats.day);
    const effectiveSiegeIncrease = Math.max(0, Math.ceil(siegeIncrease * dayProfile.threatMultiplier));
    let newSiege = Math.min(100, currentSiege + effectiveSiegeIncrease);

    // --- ATTACK TRIGGER LOGIC ---
    let attackTriggered = false;
    let damageType: 'INFANTRY' | 'ARTILLERY' | 'BOMBING' = "INFANTRY";
    let attackScale: 'SMALL' | 'MEDIUM' | 'LARGE' = 'SMALL';
    
    if (newSiege > 10 && actionType !== 'idle') {
        const riskRoll = random() * 100;
        if (riskRoll < newSiege) {
            attackTriggered = true;
            const threatAtContact = newSiege;
            newSiege = Math.max(0, newSiege - 50); 
            
            // Determine Scale and Type
            const currentH = parseInt(nextTimeStr.split(':')[0]);
            const isHeavyTime = currentH >= 8 && currentH <= 18;
            
            if (threatAtContact > 85 || random() < dayProfile.largeAttackBonus) {
                attackScale = 'LARGE'; // Massive wave
            } else if (threatAtContact > 48) {
                attackScale = 'MEDIUM';
            } else {
                attackScale = 'SMALL';
            }

            if (isHeavyTime && random() < dayProfile.artilleryChance) damageType = "ARTILLERY";
            else damageType = "INFANTRY";
        }
    }
    
    calculatedStats.siegeMeter = newSiege;

    // Bombing (Separate check)
    const flagActive = calculatedStats.hasFlagRaised ?? currentStats.hasFlagRaised;
    const currentHour = parseInt(nextTimeStr.split(':')[0]);
    
    if (!attackTriggered && actionType !== 'idle') {
        const bombingChance = Math.min(0.65, dayProfile.bombingChance + (flagActive ? 0.15 : 0));
        if (currentHour >= 6 && currentHour <= 17 && random() < bombingChance) {
             attackTriggered = true;
             damageType = "BOMBING";
             attackScale = flagActive || currentStats.day >= 4 ? 'MEDIUM' : 'SMALL';
        }
    }

    // --- Wounded Passive Death ---
    const currentWoundedCount = calculatedStats.wounded ?? currentStats.wounded;
    let currentTimer = calculatedStats.woundedTimer ?? currentStats.woundedTimer;
    
    if (currentWoundedCount > 0) {
        currentTimer += totalMinutesPassed;
        if (currentTimer >= 720) {
            const deathToll = Math.floor(random() * 5) + 1; 
            const actualDeaths = Math.min(currentWoundedCount, deathToll);
            if (actualDeaths > 0) {
                calculatedStats.wounded = currentWoundedCount - actualDeaths;
                const moraleLoss = actualDeaths;
                const minM = calculatedStats.minMorale ?? currentStats.minMorale ?? 0;
                calculatedStats.morale = Math.max(minM, (calculatedStats.morale ?? currentStats.morale) - moraleLoss);
                narrativeParts.push("\n\n" + pick(WOUNDED_DEATH_SCENES));
                statsLog.push(`⚰️ 重伤员不治: ${actualDeaths}人`);
                statsLog.push(`💔 士气 -${moraleLoss}`);
                currentTimer = 660; 
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
        let bayonetMode = false;
        let ammoCheckSoldiers = calculatedStats.soldiers ?? currentStats.soldiers;
        let ammoCheckSquads = [...(calculatedStats.hmgSquads || currentStats.hmgSquads)];
        let currentAmmo = calculatedStats.ammo ?? currentStats.ammo;
        let currentMgAmmo = calculatedStats.machineGunAmmo ?? currentStats.machineGunAmmo;
        // Added this line
        let currentGrenades = calculatedStats.grenades ?? currentStats.grenades; 
        
        let currentMorale = calculatedStats.morale ?? currentStats.morale;

        // Check for Bayonet Charge Condition
        if (currentAmmo <= 0 && currentMgAmmo <= 0) {
            bayonetMode = true;
            narrativeParts.push("\n\n" + pick(BAYONET_FIGHT_TEXTS));
            statsLog.push(`⚔️ 弹尽粮绝! 刺刀冲锋!`);
        }

        // 2. Get Defense Levels (Combined 1F + 2F)
        const lv1 = calculatedStats.fortificationLevel?.['一楼入口'] ?? currentStats.fortificationLevel['一楼入口'];
        const lv2 = calculatedStats.fortificationLevel?.['二楼阵地'] ?? currentStats.fortificationLevel['二楼阵地'];
        const lvRoof = calculatedStats.fortificationLevel?.['屋顶'] ?? currentStats.fortificationLevel['屋顶'];
        
        // Combined Defense Logic
        const avgDef = (lv1 + lv2) / 2; 

        // 3. HMG Status
        const activeSquadsCount = ammoCheckSquads.filter(s => s.status === 'active').length;

        // 4. CALCULATE OUTCOME
        const outcome = calculateCombatOutcomes(attackScale, avgDef, activeSquadsCount, damageType, bayonetMode);
        
        // Set Narrative Header
        if (damageType === 'BOMBING') {
            narrativeParts.push("\n\n" + pick(ATTACK_TEXTS.BOMBING));
            attackLocation = '屋顶';
        } else if (damageType === 'ARTILLERY') {
            narrativeParts.push("\n\n" + pick(ATTACK_TEXTS.ARTILLERY));
            attackLocation = random() > 0.5 ? '一楼入口' : '二楼阵地';
        } else {
            // Infantry
            if (attackScale === 'LARGE') narrativeParts.push("\n\n【日军总攻】鬼子发疯了！满山遍野的黄皮狗涌了上来！");
            else if (attackScale === 'MEDIUM') narrativeParts.push("\n\n【日军强攻】日军组织了一个中队的兵力，试图强行突破一楼大门。");
            else narrativeParts.push("\n\n" + pick(ATTACK_TEXTS.INFANTRY));
            attackLocation = '一楼入口';
        }

        if (outcome.attackScale === 'LARGE' || damageType === 'BOMBING') visualEffect = "heavy-damage";

        // 5. Apply Results
        // 5.1 Ammo Usage
        let ammoDemand = outcome.enemiesKilled * (40 + random() * 40); 
        let mgAmmoDemand = activeSquadsCount * (500 + random() * 1000) * (attackScale === 'LARGE' ? 2 : 1);
        let grenadesDemand = outcome.enemyCount * (1 + random()); 

        if (bayonetMode) { ammoDemand = 0; mgAmmoDemand = 0; grenadesDemand *= 0.5; }

        // Calculate actual consumption based on available stock
        const actualAmmoUsed = Math.floor(Math.min(currentAmmo, ammoDemand));
        const actualMgAmmoUsed = Math.floor(Math.min(currentMgAmmo, mgAmmoDemand));
        const actualGrenadesUsed = Math.floor(Math.min(currentGrenades, grenadesDemand));

        calculatedStats.ammo = currentAmmo - actualAmmoUsed;
        calculatedStats.machineGunAmmo = currentMgAmmo - actualMgAmmoUsed;
        calculatedStats.grenades = currentGrenades - actualGrenadesUsed;

        if (actualAmmoUsed > 0) statsLog.push(`🔻 消耗七九弹: ${actualAmmoUsed}`);
        if (actualMgAmmoUsed > 0) statsLog.push(`🔻 消耗机枪弹: ${actualMgAmmoUsed}`);
        if (actualGrenadesUsed > 0) statsLog.push(`🔻 消耗手榴弹: ${actualGrenadesUsed}`);

        // 5.2 Casualties
        const currentHealthy = calculatedStats.soldiers ?? currentStats.soldiers;
        const currentWounded = calculatedStats.wounded ?? currentStats.wounded;
        
        let totalDamage = outcome.casualtyCount;
        let deaths = 0;
        let injuries = 0;

        if (totalDamage > 0) {
            const woundedDeaths = Math.min(currentWounded, Math.ceil(totalDamage * 0.3));
            deaths += woundedDeaths;
            totalDamage -= woundedDeaths;

            if (totalDamage > 0) {
                const healthyDeaths = Math.floor(totalDamage * 0.4); 
                const healthyInjuries = totalDamage - healthyDeaths;
                
                deaths += Math.min(currentHealthy, healthyDeaths);
                injuries += Math.min(currentHealthy - deaths, healthyInjuries);
            }
        }

        calculatedStats.wounded = Math.max(0, currentWounded - Math.min(currentWounded, Math.ceil(outcome.casualtyCount * 0.3)) + injuries);
        calculatedStats.soldiers = Math.max(0, currentHealthy - (deaths - (Math.min(currentWounded, Math.ceil(outcome.casualtyCount * 0.3)))) - injuries);
        
        // HMG Destruction Risk 
        if (activeSquadsCount > 0 && (attackScale === 'LARGE' || damageType !== 'INFANTRY')) {
            if (random() < 0.3) {
                const targetIdx = ammoCheckSquads.findIndex(s => s.status === 'active');
                if (targetIdx !== -1) {
                    ammoCheckSquads[targetIdx] = { ...ammoCheckSquads[targetIdx], status: 'destroyed', count: 0 };
                    statsLog.push(`🔴 ${ammoCheckSquads[targetIdx].name}被毁!`);
                    
                    // Morale Penalty for HMG Loss
                    currentMorale = Math.max(0, currentMorale - 15);
                    statsLog.push(`💔 重火力折损: 士气 -15`);
                    
                    deaths += 5; // Extra deaths from crew
                }
                calculatedStats.hmgSquads = ammoCheckSquads;
            }
        }

        // Structure Damage
        const structureDmg = (attackScale === 'LARGE' ? 10 : 2) + (damageType === 'BOMBING' ? 15 : 0);
        calculatedStats.health = Math.max(0, (calculatedStats.health ?? currentStats.health) - structureDmg);

        // Fortification Degradation
        if (random() < (attackScale === 'LARGE' ? 0.7 : 0.2)) {
            const target = attackLocation || '一楼入口';
            const curLv = calculatedStats.fortificationLevel?.[target] ?? currentStats.fortificationLevel[target];
            if (curLv > 0) {
                const newLv = curLv - 1;
                calculatedStats.fortificationLevel = { ...(calculatedStats.fortificationLevel || currentStats.fortificationLevel), [target]: newLv };
                narrativeParts.push("\n\n" + pick(FORT_DAMAGE_SCENES));
                statsLog.push(`🏚️ ${target}工事损毁 (Lv.${newLv})`);
            }
        }

        // Apply Kills
        const prevKills = calculatedStats.enemiesKilled ?? currentStats.enemiesKilled ?? 0;
        calculatedStats.enemiesKilled = prevKills + outcome.enemiesKilled;
        
        // Logs for Casualties/Kills
        if (deaths > 0) {
            handleSoldierDeaths(currentStats, calculatedStats, deaths, narrativeParts);
            statsLog.push(`🔴 阵亡: ${deaths}人`);
        }
        if (injuries > 0) statsLog.push(`🩹 新增伤员: ${injuries}人`);
        statsLog.push(`💀 击毙日军: ${outcome.enemiesKilled}人`);
        
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
    }

    // --- Mutiny & Finalize (Preserved) ---
    const finalMorale = calculatedStats.morale ?? currentStats.morale;
    if (finalMorale < 30 && random() < 0.4) {
        narrativeParts.push("\n\n" + pick(MUTINY_SCENES));
        const lost = Math.floor(random() * 10) + 5; 
        calculatedStats.soldiers = Math.max(0, (calculatedStats.soldiers ?? currentStats.soldiers) - lost);
        statsLog.push(`🏃 逃兵/失踪: ${lost}人`);
    }

    if (!calculatedStats.currentTime) calculatedStats.currentTime = nextTimeStr; 
    if (checkNewDay(currentStats.currentTime, nextTimeStr)) {
        calculatedStats.day = currentStats.day + 1;
        eventTriggered = "new_day";
        const nextDayProfile = getDayProfile(calculatedStats.day);
        narrativeParts.push(`\n\n【第 ${calculatedStats.day} 天 · ${nextDayProfile.title}】\n夜色褪去，新的枪声从废墟间响起。${nextDayProfile.description}`);
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
    const finalHealth = calculatedStats.health ?? currentStats.health;
    const finalDay = calculatedStats.day ?? currentStats.day;
    const aggression = calculatedStats.aggressiveCount ?? currentStats.aggressiveCount ?? 0;
    const flagRaised = calculatedStats.hasFlagRaised ?? currentStats.hasFlagRaised ?? false;
    
    // --- GAME OVER CHECKS (VICTORY / DEFEAT) ---
    if (finalSoldiers < 20 || finalHealth <= 0) {
        calculatedStats.isGameOver = true;
        eventTriggered = 'game_over';
        visualEffect = 'heavy-damage';
        
        // CHECK ENDING 2: Counter-Attack
        // Threshold: Aggressive actions > 3
        if (aggression > 3) {
            calculatedStats.gameResult = 'defeat_assault';
            const report = calculateScore({ ...currentStats, ...calculatedStats }, 'defeat_assault');
            calculatedStats.finalRank = report.rank;
            narrativeParts.push(`\n\n【全军覆没】\n在无休止的反击中，最后一名士兵也倒在了冲锋的路上。你的勇猛令人动容，但四行仓库最终失守。\n\n结局达成：【反攻的号角】\n${report.text}`);
        }
        // CHECK ENDING 5: Martyr (Flag Raised + Death)
        else if (flagRaised) {
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
            narrativeParts.push(`\n\n【战役结束】\n最终军衔评价：${report.rank}\n${report.text}`);
        }

    } else if (finalDay > 5) {
        // ENDING 1: Normal Hold
        calculatedStats.isGameOver = true;
        calculatedStats.gameResult = 'victory_hold';
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
        const potentialDilemmas = ALL_DILEMMAS.filter(d => !alreadyTriggered.includes(d.id));
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
        enemyIntel: getDayProfile(finalDay).intel
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
