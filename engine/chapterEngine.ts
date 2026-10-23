import type { ActionPreview, ChapterMission, GameStats, GameTurnResult } from '../types';
import { CHAPTER_TIME_LIMIT, CIVILIAN_COUNT, CROSSING_TARGET, EVACUATION_TARGET, getChapter } from '../data/chapters';
import { CHAPTER_CHAT, MISSION_CONTACT, MISSION_DEATH, MISSION_INJURY } from '../data/text/chapterNarrative';
import { LOCAL_DIALOGUE } from '../data/text/localDialogue';
import { canonicalCommand, getLanguageGuard, isQuestion } from './commandLanguage';
import { detectDialogueTopic, replyOnTopic } from './localConversation';
import { advanceCampaignClock } from './time';
import { applyNamedSoldierDeaths } from './roster';

type Action = 'recon' | 'search' | 'escort' | 'inner' | 'river' | 'fire' | 'build' | 'rest' | 'heal' | 'extract';
interface MissionPlan {
  key: Action;
  label: string;
  minutes: number;
  pressure: number;
  available: boolean;
  reason: string;
  costs: string[];
}
const aliases: Record<string, Action> = {
  '侦察路线': 'recon', '观察桥面': 'recon', '侦察敌情': 'recon', '侦察': 'recon',
  '搜救街巷': 'search', '搜救': 'search', '护送民众': 'escort', '护送': 'escort',
  '选择内巷': 'inner', '选择内巷撤收线': 'inner', '选择沿河': 'river', '选择沿河撤收线': 'river',
  '压制射击': 'fire', '加固桥头': 'build', '加固': 'build',
  '轮换掩护': 'rest', '轮换休息': 'rest', '休息整顿': 'rest', '休息': 'rest',
  '救治伤员': 'heal', '治疗伤员': 'heal', '治疗': 'heal',
  '组织撤离': 'extract', '撤离': 'extract', '撤退': 'extract',
};
const normalize = (input: string) => canonicalCommand(input)
  .replace(/^(?:(?:副官|弟兄们|兄弟们|大家)[,，:：\s]*)/, '')
  .replace(/^(?:(?:请|立即|立刻|现在|下令|命令)\s*)+/, '').replace(/[!！。]+$/, '').trim();

export const getMissionPlan = (stats: GameStats, input: string): MissionPlan | null => {
  if (getLanguageGuard(input) || isQuestion(input)) return null;
  const key = aliases[normalize(input)];
  if (!key || !stats.mission) return null;
  const m = stats.mission, street = stats.chapterId === 'street';
  const plan: MissionPlan = { key, label: '', minutes: 0, pressure: 0, available: m.started && !stats.isGameOver, reason: '', costs: [] };
  switch (key) {
    case 'recon':
      Object.assign(plan, { label: street ? '侦察路线' : '观察桥面', minutes: street ? 15 : 10, pressure: 8,
        reason: street ? '查清两条撤收线，之后才能选择路线并护送' : '核实渡桥进度；观察期间友军仍继续过桥' }); break;
    case 'search':
      Object.assign(plan, { label: '搜救街巷', minutes: 20, pressure: 18,
        reason: '找到2—4名尚未接回的民众；找到后仍需护送，不能直接计为安全' });
      plan.available &&= street && m.found < CIVILIAN_COUNT;
      if (!street || m.found >= CIVILIAN_COUNT) plan.reason = street ? '十二名民众均已找到，接下来应安排护送' : '本关任务为桥头阻击，没有街巷搜救'; break;
    case 'escort':
      Object.assign(plan, { label: '护送民众', minutes: m.route === 'river' ? 15 : 25, pressure: m.route === 'river' ? 28 : 18,
        reason: '每次最多护送6人抵达安全区；沿河更快，但暴露压力更高' });
      plan.available &&= street && m.recon && m.route !== null && m.found > m.evacuated;
      if (!plan.available) plan.reason = !street ? '本关没有民众护送任务' : !m.route ? '先侦察路线，再明确选择内巷或沿河' : '眼下没有已经找到、仍待护送的民众'; break;
    case 'inner': case 'river':
      Object.assign(plan, { label: key === 'inner' ? '选择内巷' : '选择沿河',
        reason: key === 'inner' ? '护送每次25分钟，暴露压力较低；选路本身不耗时' : '护送每次15分钟，暴露压力较高；选路本身不耗时' });
      plan.available &&= street && m.recon;
      if (!plan.available) plan.reason = street ? '先侦察路线，不能凭空选定未查明的通路' : '桥头只需控制掩护与撤离，没有这项选路'; break;
    case 'fire':
      Object.assign(plan, { label: '压制射击', minutes: 20, pressure: 6, costs: ['七九弹30发'], reason: '压低本次压力增幅，掩护身后友军继续过桥' });
      plan.available &&= !street && stats.ammo >= 30;
      if (!plan.available) plan.reason = street ? '撤收小队没有桥头压制射击任务' : '压制射击需要至少30发七九弹'; break;
    case 'build':
      Object.assign(plan, { label: '加固桥头', minutes: 30, pressure: 22, costs: ['工事材料40份'], reason: '桥头掩体提高一级，最多三级；每级减少接敌伤亡' });
      plan.available &&= !street && m.cover < 3 && stats.sandbags >= 40;
      if (!plan.available) plan.reason = street ? '本章没有桥头工事' : m.cover >= 3 ? '桥头工事已经达到上限' : '工事材料不足40份'; break;
    case 'rest':
      Object.assign(plan, { label: street ? '轮换休息' : '轮换掩护', minutes: 20, pressure: 20, reason: '疲劳最多降低25点、士气最多提高4点；封锁时间仍在推进' }); break;
    case 'heal':
      Object.assign(plan, { label: '救治伤员', minutes: 20, pressure: 12, costs: ['按实际救回人数消耗急救包，最多2份'], reason: '最多让2名现有伤员恢复战斗力，不能救回已阵亡者' });
      plan.available &&= stats.wounded > 0 && stats.medkits > 0;
      if (!plan.available) plan.reason = stats.wounded <= 0 ? '目前没有待治伤员' : '急救包已经耗尽'; break;
    case 'extract':
      Object.assign(plan, { label: '组织撤离', minutes: 20, pressure: street ? 12 : 18,
        reason: '先显示确认窗口，本次不撤离；确认后耗时20分钟并结束本关。任务未完成时撤离会失败' }); break;
  }
  return plan;
};

export const missionReport = (stats: GameStats): string => {
  const m = stats.mission!;
  return `${getChapter(stats.chapterId).title}：已用${m.elapsedMinutes}分钟，距封锁${Math.max(0, CHAPTER_TIME_LIMIT - m.elapsedMinutes)}分钟。\n`
    + (stats.chapterId === 'street'
      ? `民众登记${CIVILIAN_COUNT}人，已找到${m.found}人，已护送到安全区${m.evacuated}人，找到后仍待护送${m.found - m.evacuated}人。目标至少${EVACUATION_TARGET}人。\n撤收线：${m.route === 'inner' ? '内巷' : m.route === 'river' ? '沿河' : '尚未选择'}。`
      : `友军已过桥${m.crossed}/${CROSSING_TARGET}人，桥头掩体${m.cover}/3级；达标后仍须撤出掩护小队。`)
    + `\n小队可战${stats.soldiers}人，待治伤员${stats.wounded}人，七九弹${stats.ammo}发，急救包${stats.medkits}份。\n士气${stats.morale}/100，疲劳${stats.fatigue}/100，敌军压力${stats.siegeMeter}/100。`;
};

export const missionReadOnly = (stats: GameStats, input: string): string => {
  const guard = getLanguageGuard(input);
  if (guard) return LOCAL_DIALOGUE[guard][0];
  if (isQuestion(input)) {
    const named = stats.roster.filter(person => input.includes(person.name));
    if (named.length) return named.map(person => `${person.name}：${person.status === 'alive' ? '名册登记存活' : '本局已阵亡'}，${person.trait}。本章为虚构人物。`).join('\n');
  }
  if (isQuestion(input) || /报告|查询/.test(input)) return `${missionReport(stats)}\n\n${getChapter(stats.chapterId).objective}\n普通问答不耗时。需要操作，请一次明确下达一条本关军令。`;
  const topic = detectDialogueTopic(input);
  const lines = topic === 'homesick' ? CHAPTER_CHAT.homesick : topic === 'fear' ? CHAPTER_CHAT.fear : CHAPTER_CHAT.other;
  return lines[(stats.localDialogue?.sequence ?? 0) % lines.length];
};

export const getMissionPreview = (stats: GameStats, input: string): ActionPreview | null => {
  if (!input.trim()) return null;
  const plan = getMissionPlan(stats, input);
  const minutes = plan?.available && plan.key !== 'extract' ? plan.minutes : 0;
  const pressure = minutes > 0 ? Math.min(100, stats.siegeMeter + (plan?.pressure ?? 0)) : stats.siegeMeter;
  const due = minutes > 0 && pressure >= 70;
  const late = minutes > 0 && (stats.mission?.elapsedMinutes ?? 0) + minutes >= CHAPTER_TIME_LIMIT;
  return { action: plan?.label ?? '交谈 / 询问', durationMinutes: minutes, durationLabel: minutes > 0 ? `${minutes}分钟` : '不耗时',
    threatIncrease: pressure - stats.siegeMeter, predictedThreat: pressure, attackChance: due ? 1 : 0,
    enemyAdvanceSteps: minutes > 0 ? 1 : 0, projectedContactTurns: null,
    risk: late ? 'critical' : due ? 'high' : 'safe', riskLabel: late ? '本次行动将赶上封锁' : due ? '本次行动将接敌' : '留意封锁剩余时间',
    costs: plan?.available ? plan.costs : [], available: plan?.available ?? true,
    reason: plan?.reason ?? missionReadOnly(stats, input), short: plan ? `${minutes}分钟 · ${plan.label}` : '问答不耗时' };
};

export const missionAdvisor = (stats: GameStats, input: string): string => {
  const plan = getMissionPlan(stats, input);
  return plan ? `【顾问窗口 · 尚未执行】\n${plan.label}：${plan.key === 'extract' ? '确认后' : ''}${plan.minutes}分钟。\n${plan.reason}\n这里只回答与预览，实际执行请回主界面。` : missionReadOnly(stats, input);
};

export const resolveChapterTurn = (stats: GameStats, raw: string, random: () => number): GameTurnResult => {
  const m = stats.mission;
  const say = (text: string): GameTurnResult => ({ narrative: text, updatedStats: {}, eventTriggered: 'none' });
  if (!m) return say('关卡记录不完整，未执行。请从已有档案恢复本关。');
  if (stats.isGameOver) return say('本关已经结束，可复盘或选择另一章。');
  if (raw.length > 500) return say(LOCAL_DIALOGUE.too_long[0]);
  const canonical = canonicalCommand(raw);
  const cmd = canonical === '确认撤出小队' ? 'confirm_chapter_retreat' : canonical;
  if (cmd === 'start_game') {
    if (m.started || stats.turnCount > 0) return say('本关已经开始，不能用内部文字重置进度。');
    return { narrative: getChapter(stats.chapterId).opening, updatedStats: { mission: { ...m, started: true } }, eventTriggered: 'none' };
  }
  if (cmd === 'cancel_retreat') return { ...say('待确认的撤离命令已取消，没有耗时。'), updatedStats: { pendingRetreat: null } };
  const confirming = cmd === 'confirm_chapter_retreat';
  if (cmd.startsWith('confirm_') && (!confirming || stats.pendingRetreat !== cmd)) return say('没有当前有效的撤离确认，未执行。');
  if (!m.started) return say('本关尚未接防，请从选关页开始。');
  const plan = confirming ? getMissionPlan(stats, '组织撤离') : getMissionPlan(stats, raw);
  if (!plan) {
    const guard = getLanguageGuard(raw);
    if (guard || isQuestion(raw) || /报告|查询/.test(raw)) return say(missionReadOnly(stats, raw));
    if (/搜救|护送|射击|撤|轮换|加固|侦察|治疗|救治/.test(raw)) return say('军令没有完整对应本关的一项行动，本次未执行。请一次明确下达一条本关命令，也可使用下方按钮。');
    const reply = replyOnTopic(stats, raw, detectDialogueTopic(raw) ?? 'unclear');
    return { ...say(missionReadOnly(stats, raw)), updatedStats: { localDialogue: reply.memory } };
  }
  if (!plan.available) return say(`未执行：${plan.reason}`);
  if (plan.key === 'extract' && !confirming) {
    const met = stats.chapterId === 'street' ? m.evacuated >= EVACUATION_TARGET : m.crossed >= CROSSING_TARGET;
    return { ...say('副官核对撤离名单，等待你最后确认。当前还没有撤离。'), updatedStats: { pendingRetreat: 'confirm_chapter_retreat' },
      dilemma: { id: 'confirm_chapter_retreat', title: '确认撤出小队？', description: `${missionReport(stats)}\n\n${met ? '人数目标已达成。' : '人数目标尚未达成，此时撤离将判定任务失败。'}确认后耗时20分钟并结束本关；若抵达180分钟封锁时点，也会失败。`,
        options: [{ label: '确认撤出小队', actionCmd: 'confirm_chapter_retreat', riskText: '耗时20分钟，本关结局不可撤销' },
          { label: '继续执行任务', actionCmd: 'cancel_retreat' }] } };
  }

  const next: GameStats = { ...stats, mission: { ...m }, roster: [...stats.roster], pendingRetreat: null };
  const mission = next.mission!;
  const narrative: string[] = [];
  const logs: string[] = [];
  const street = stats.chapterId === 'street';
  if (plan.key === 'inner' || plan.key === 'river') {
    mission.route = plan.key;
    return { ...say(plan.key === 'inner' ? '内巷撤收线已选定。路更绕，遮蔽也更多；护送每次25分钟，尚未有人因此抵达安全区。'
      : '沿河撤收线已选定。护送每次15分钟，但暴露压力更高；选路没有替任何人完成撤收。'), updatedStats: { mission } };
  }
  if (plan.key === 'recon') {
    mission.recon = true;
    narrative.push(street ? '观察员沿掩蔽物核对了通路。内巷较慢，沿河较快却更暴露。路线查清了，要走哪一条，仍等你的明确命令。'
      : '传令兵与桥面接应者对过人数，回来重新报数：“一个个过，别把还站在桥头的也算进去。”');
  } else if (plan.key === 'search') {
    const found = Math.min(CIVILIAN_COUNT - mission.found, 2 + Math.floor(random() * 3));
    mission.found += found;
    narrative.push(`在破损的门后找到${found}名民众。有人一直扶着身边人的胳膊，听到招呼才敢松一点。班长点过名字：“跟住我们，还没到能坐下的地方。”`);
    logs.push(`找到民众 +${found}，仍待护送${mission.found - mission.evacuated}人`);
  } else if (plan.key === 'escort') {
    const count = Math.min(6, mission.found - mission.evacuated);
    mission.evacuated += count;
    narrative.push(`${count}名民众抵达安全接应区。接应者点到最后一个人，才向你示意。有人松开一路攥着的袖口，过了好一会儿才想起道谢；登记纸上，尚未接出的名字还没有勾去。`);
    logs.push(`安全撤收 ${mission.evacuated}/${CIVILIAN_COUNT}人`);
  } else if (plan.key === 'fire') {
    next.ammo -= 30;
    const kills = 2 + Math.floor(random() * 4);
    next.enemiesKilled += kills;
    narrative.push('压制射击展开，桥头的喊话得凑近了才能听清。前面的兵缩低身体，后面的人继续过桥；枪声的意义落在身后那些脚步上。');
    logs.push(`七九弹 -30，确认毙敌${kills}人`);
  } else if (plan.key === 'build') {
    next.sandbags -= 40;
    mission.cover += 1;
    narrative.push('木料与沙袋压进缺口，搬运的人把肩膀换了个位置才继续抬。掩体确实加厚了，桥面上的人也仍在往后走。');
    logs.push(`工事材料 -40，桥头掩体 ${mission.cover}/3级`);
  } else if (plan.key === 'rest') {
    next.fatigue = Math.max(0, next.fatigue - 25);
    next.morale = Math.min(100, next.morale + 4);
    narrative.push('小队轮换位置。有人坐下后先把手松开，才发现指节一直攥得发酸。休息的人喘一口气，外头的封锁却没有跟着停。');
  } else if (plan.key === 'heal') {
    const count = Math.min(2, next.wounded, next.medkits);
    next.wounded -= count; next.soldiers += count; next.medkits -= count;
    narrative.push('救护兵润开粘住的旧包扎，一点点处理伤处。能重新归队的人先靠墙试着站稳，没有人把活下来当成必须立刻逞强。');
    logs.push(`救回战斗力${count}人，急救包 -${count}`);
  } else if (plan.key === 'extract') {
    narrative.push('撤出命令确认，队伍沿接应通路收拢。最后的人仍在回看，班长低声催他：“点过了。走。”');
  }

  mission.elapsedMinutes += plan.minutes;
  const clock = advanceCampaignClock(stats.day, stats.currentTime, plan.minutes);
  next.day = clock.day; next.currentTime = clock.time;
  next.fatigue = Math.min(100, next.fatigue + (plan.key === 'rest' ? 0 : Math.ceil(plan.minutes / 10)));
  next.siegeMeter = Math.min(100, next.siegeMeter + plan.pressure);
  if (!street && plan.key !== 'extract') {
    const crossed = Math.min(CROSSING_TARGET - mission.crossed, Math.floor(plan.minutes / 2));
    mission.crossed += crossed;
    logs.push(`友军过桥 +${crossed}，累计${mission.crossed}/${CROSSING_TARGET}人`);
  }

  let attacked = false;
  if (next.siegeMeter >= 70 && next.soldiers > 0) {
    attacked = true;
    const ammunition = Math.min(next.ammo, 18);
    next.ammo -= ammunition;
    const protection = street ? (mission.route === 'inner' ? 1 : 0) : mission.cover;
    const casualties = Math.min(next.soldiers, Math.max(0, 2 + Math.floor(random() * 4)
      + (ammunition === 0 ? 2 : 0) + (next.fatigue >= 65 ? 1 : 0) - protection));
    const injuries = Math.ceil(casualties * 0.6), deaths = casualties - injuries;
    next.soldiers -= casualties; next.wounded += injuries;
    const kills = Math.floor(ammunition / 8);
    next.enemiesKilled += kills;
    next.morale = Math.max(0, next.morale - deaths * 3);
    next.siegeMeter = Math.max(15, next.siegeMeter - 45);
    next.lastAttackTurn = stats.turnCount + 1;
    narrative.push(MISSION_CONTACT);
    if (injuries > 0) narrative.push(MISSION_INJURY);
    if (deaths > 0) {
      narrative.push(MISSION_DEATH);
      const updates: Partial<GameStats> = {};
      applyNamedSoldierDeaths(next, updates, deaths, narrative, random);
      if (updates.roster) next.roster = updates.roster;
    }
    logs.push(`接敌消耗七九弹${ammunition}，新增伤员${injuries}人，阵亡${deaths}人，确认毙敌${kills}人`);
  }
  next.soldierDistribution = { '一楼入口': next.soldiers, '二楼阵地': 0, '地下室': 0, '屋顶': 0 };
  const deadline = mission.elapsedMinutes >= CHAPTER_TIME_LIMIT;
  const extracted = plan.key === 'extract';
  if (deadline || next.soldiers <= 0 || extracted) {
    const met = street ? mission.evacuated >= EVACUATION_TARGET : mission.crossed >= CROSSING_TARGET;
    const won = extracted && met && !deadline && next.soldiers > 0;
    next.isGameOver = true;
    next.gameResult = won ? (street ? 'victory_evacuation' : 'victory_cover') : 'defeat_mission';
    next.gameOverReason = won ? 'chapter_complete' : 'chapter_failed';
    next.finalRank = won ? (street ? '把人带回来' : '最后走的人') : deadline ? '通路封锁' : extracted ? '任务未竟' : '小队失去战斗力';
    narrative.push(won
      ? street ? `【撤收完成】${mission.evacuated}名民众已抵达安全区，小队也已撤出。接应者把登记递回来，漏下的名字没有被改写成死讯。有人问可以坐下了吗，你终于能答一句“可以”。`
        : `【掩护完成】${mission.crossed}名友军过桥，小队随后撤出。脚下换成接应一侧的地面时，班长仍回头数了一遍。轮到最后走的人被人点清，这项任务才真正结束。`
      : `【本章结束】${deadline ? '封锁时点已到，小队未能在期限内完成撤收。' : extracted ? '小队撤出了，但人数目标尚未完成。' : '小队已没有可战人员，行动无法继续。'}\n${street ? `已护送到安全区${mission.evacuated}人，另有${CIVILIAN_COUNT - mission.evacuated}人未确认安全抵达。` : `已过桥友军${mission.crossed}人，其余${CROSSING_TARGET - mission.crossed}人的后续未定。`}未确认的人不直接记作死亡；小队现存兵力与伤员见结算。`);
  }
  logs.push(`士气 ${stats.morale} → ${next.morale}`, `疲劳 ${stats.fatigue} → ${next.fatigue}`,
    `已用${mission.elapsedMinutes}/${CHAPTER_TIME_LIMIT}分钟`);
  // Return only changed chapter-owned fields; no warehouse event or card settlement.
  const updatedStats: Partial<GameStats> = { mission, soldiers: next.soldiers, wounded: next.wounded,
    ammo: next.ammo, enemiesKilled: next.enemiesKilled, medkits: next.medkits, sandbags: next.sandbags, morale: next.morale,
    fatigue: next.fatigue, siegeMeter: next.siegeMeter, day: next.day, currentTime: next.currentTime,
    soldierDistribution: next.soldierDistribution, roster: next.roster, lastAttackTurn: next.lastAttackTurn,
    isGameOver: next.isGameOver, gameResult: next.gameResult, gameOverReason: next.gameOverReason, finalRank: next.finalRank };
  return { narrative: narrative.join('\n\n') + '\n\n━━━━━━━━━━━━━━\n' + logs.join('\n'), updatedStats,
    turnAdvanced: true, eventTriggered: next.isGameOver ? (next.gameResult.startsWith('victory_') ? 'victory' : 'game_over') : attacked ? 'attack' : 'none',
    visualEffect: attacked ? 'shake' : 'none', enemyIntel: `敌军压力${next.siegeMeter}/100，距封锁${Math.max(0, CHAPTER_TIME_LIMIT - mission.elapsedMinutes)}分钟` };
};
