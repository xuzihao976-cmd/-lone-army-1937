import type { GameStats, LocalDialogueMemory } from '../types';
import { LOCAL_DIALOGUE, CONTEXT_DIALOGUE, type DialogueTopic } from '../data/text/localDialogue';
import { canonicalCommand, compactCommand, isQuestion } from './commandLanguage';
import { getOperationIntel } from './battlefield';
import { findLocations } from './commandUtils';
const hashText = (text: string): number => { let hash = 2166136261; for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return hash >>> 0; };
/** Pure display selection for chapter-owned text. Existing warehouse dialogue
 * keeps its own selection behavior; neither path consumes battlefield RNG. */
export const rotateDialogueLines = <T>(s: GameStats, input: string, topic: DialogueTopic, lines: readonly T[]) => {
  if (lines.length === 0) throw new Error('Dialogue pool must not be empty');
  const previous = sanitizeDialogueMemory(s.localDialogue);
  const inputHash = hashText(compactCommand(input));
  const repeats = previous?.inputHash === inputHash ? Math.min(100, previous.repeats + 1) : 0;
  const variant = previous?.topic === topic ? (previous.variant + 1) % lines.length
    : (hashText(topic) + (previous?.sequence ?? 0)) % lines.length;
  const memory: LocalDialogueMemory = { sequence: ((previous?.sequence ?? 0) + 1) % 1000001, topic, variant, inputHash, repeats };
  return { line: lines[variant], memory };
};
export const sanitizeDialogueMemory = (value: unknown): LocalDialogueMemory | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const m = value as Record<string, unknown>;
  if (typeof m.topic !== 'string' || !Object.hasOwn(LOCAL_DIALOGUE, m.topic)) return undefined;
  const valid = (key: string, max: number) => typeof m[key] === 'number' && Number.isSafeInteger(m[key]) && (m[key] as number) >= 0 && (m[key] as number) <= max;
  if (!valid('sequence', 1000000) || !valid('variant', 1000) || !valid('inputHash', 0xffffffff) || !valid('repeats', 100)) return undefined;
  return { sequence: m.sequence as number, topic: m.topic, variant: m.variant as number, inputHash: m.inputHash as number, repeats: m.repeats as number };
};
const contextual = new Set<DialogueTopic>(['greeting', 'attention', 'concern', 'fear', 'fatigue', 'praise', 'thanks']);
const contextLines = (s: GameStats, topic: DialogueTopic, input: string): readonly string[] | null => {
  if (!contextual.has(topic)) return null;
  if (s.sectorIntegrity[s.location] <= 0) return CONTEXT_DIALOGUE.lost_position;
  if (!s.soldierDistribution[s.location]) return CONTEXT_DIALOGUE.empty_position;
  if (/机枪/.test(input) && !s.hmgSquads.some(q => q.status === 'active' && !q.jammed && q.count > 0 && q.location !== '待命' && s.sectorIntegrity[q.location] > 0 && s.machineGunAmmo >= 200)) return CONTEXT_DIALOGUE.no_hmg;
  if (/伤员|军医|医务/.test(input) && s.wounded === 0) return CONTEXT_DIALOGUE.no_wounded;
  if (/伤员|军医|医务/.test(input) && s.wounded > 0 && s.medkits === 0) return CONTEXT_DIALOGUE.no_medkits;
  if (s.ammo === 0) return CONTEXT_DIALOGUE.no_ammo;
  if (s.morale < 35) return CONTEXT_DIALOGUE.low_morale;
  if (s.fatigue >= 70) return CONTEXT_DIALOGUE.high_fatigue;
  if (s.enemyOperation?.revealed && s.enemyOperation.turnsRemaining <= 1) return CONTEXT_DIALOGUE.endangered;
  if (s.turnCount > 0 && s.turnCount - s.lastAttackTurn >= 0 && s.turnCount - s.lastAttackTurn <= 1) return CONTEXT_DIALOGUE.recent_battle;
  if (s.morale >= 85) return CONTEXT_DIALOGUE.high_morale;
  if (s.day >= 4) return CONTEXT_DIALOGUE.late_campaign;
  const hour = Number(s.currentTime.split(':')[0]);
  return hour < 5 || hour >= 20 ? CONTEXT_DIALOGUE.night : null;
};
export const replyOnTopic = (s: GameStats, input: string, topic: DialogueTopic) => {
  const previous = sanitizeDialogueMemory(s.localDialogue);
  const inputHash = hashText(compactCommand(input));
  const repeats = previous?.inputHash === inputHash ? Math.min(100, previous.repeats + 1) : 0;
  const selected: DialogueTopic = repeats >= 2 && ['greeting', 'attention', 'thanks', 'acknowledgment', 'off_topic'].includes(topic) ? 'repeat' : topic;
  const lines: readonly string[] = contextLines(s, selected, input) || LOCAL_DIALOGUE[selected];
  let variant = previous?.topic === selected ? (previous.variant + 1) % lines.length : (hashText(selected) + (previous?.sequence || 0)) % lines.length;
  if (previous?.topic === selected && previous.variant === variant) variant = (variant + 1) % lines.length;
  const memory: LocalDialogueMemory = { sequence: ((previous?.sequence || 0) + 1) % 1000001, topic: selected, variant, inputHash, repeats };
  return { text: lines[variant], memory, topic: selected };
};
export const detectDialogueTopic = (raw: string): DialogueTopic | null => {
  const t = canonicalCommand(raw);
  if (/真(?:厉害|棒|行|聪明|牛).{0,12}(?:个屁|个鬼|呵呵)|(?:厉害|漂亮|聪明).{0,8}死.{0,5}(?:人|弟兄)|你可真行|真有你的|好一个|你行你上|可真(?:棒|厉害)/.test(t)) return 'sarcasm';
  if (/对不起|抱歉|怪我|我的错|我错了|不该怪你|不好意思|sorry/.test(t)) return 'apology';
  if (/谢谢|多谢|辛苦了|感谢|thank/.test(t)) return 'thanks';
  if (/谁敢.{0,10}(?:退|逃|跑)|军法|督战|违令|杀鸡儆猴|不听.{0,8}(?:毙|杀)|纪律/.test(t)) return 'discipline';
  if (/投降|求饶|求求.{0,6}(?:放|饶)|叛变|当汉奸|投敌|叛徒|放下武器/.test(t)) return 'surrender';
  if (/俘虏|审讯|拷问|口供/.test(t)) return 'prisoners';
  if (/害怕|我怕|怕死|会死|不想死|怕了|吓死|好慌|恐惧|撑不下去|活不下去|想死|自杀|崩溃/.test(t)) return 'fear';
  if (/想家|回家|妈妈|爹|老娘|父母|家乡|家里|故乡|媳妇|老婆|女朋友|家书|遗书|桂花/.test(t)) return 'homesick';
  if (/纪念|悼念|默哀|牺牲的|死去的|阵亡的|兄弟.{0,4}死了|安息/.test(t)) return 'grief';
  if (/累(?:了|死|啊|得|吗)|困(?:了|死|啊)|疲惫|好困|撑不住眼|想睡/.test(t)) return 'fatigue';
  if (/厕所|拉屎|拉尿|大小便|憋不住|洗澡|洗脸|刷牙|卫生|如厕/.test(t)) return 'hygiene';
  if (/饿|好吃|吃饭|干饭|喝水|口渴|渴了|米饭|面条|馒头|干粮|炊事|伙食|红烧肉|饭菜/.test(t)) return 'food';
  if (/傻逼|傻比|蠢货|废物|垃圾|狗东西|你妈|操你|他妈的|妈的|去你|滚蛋|滚开|sb\b|nt\b|idiot|fuck|笨蛋/.test(t)) return 'insult';
  if (/骗我|骗人|吹牛|扯淡|不信|信不过|有用吗|靠不靠谱|别糊弄|瞎说|胡说/.test(t)) return 'distrust';
  if (/赏钱|发钱|奖赏|赏.{0,4}(?:块|元)|升官|加薪|贿赂|买通|收买|给.{0,8}金条/.test(t)) return 'bargaining';
  if (/太难|难打|打不过|守不住|太猛|没救了|没用了|玩不下去|不公平|怎么又|离谱|无语|破游戏/.test(t)) return 'frustration';
  if (/笑话|哈哈|嘿嘿|笑死|233|666|乐子|开个玩笑|开玩笑|搞笑/.test(t)) return 'humor';
  if (/干得好|打得好|好样的|真棒|真厉害|了不起|牛逼|牛啊|佩服|漂亮/.test(t)) return 'praise';
  if (/唱歌|唱首|哼歌|唱一段/.test(t)) return 'humor';
  if (/亲我|亲一|接吻|抱抱|我爱你|喜欢你|谈恋爱|搞对象|爱我|结婚|色色|涩涩|黄段子|色情|裸体/.test(t)) return 'romance';
  if (/坦克|原子弹|核弹|核武器|高达|歼[0-9]|无人机|航空母舰|激光|魔法|召唤|导弹|时光机|复活|传送|变身|外挂/.test(t)) return 'absurd';
  if (/以后|未来|结局之后|新中国|1949|一九四九|穿越|现代|后世|改革开放/.test(t)) return 'future';
  if (/我是谁|你是谁|名字|身份|真人|机器人|人工智能|你是ai|你是人|你叫什么/.test(t)) return 'identity';
  if (/谢晋元|谢团长|谢长官/.test(t)) return 'commander';
  if (/电报|师部|上级|无线电|援军|孙元良|顾祝同|蒋介石|通讯兵/.test(t)) return 'radio';
  if (/鬼子|日军|敌军|敌人|报仇|复仇/.test(t)) return 'enemy';
  if (/风景|四周|环境|苏州河|对岸|租界|窗外|夜色|仓库里面/.test(t)) return 'environment';
  if (/还好吗|还好吧|受得了吗|保重|照顾好|注意安全|别受伤|别硬撑|辛苦吗|身体|爱你们|真不容易/.test(t)) return 'concern';
  if (/快点|快啊|来不及|没时间|抓紧|磨蹭/.test(t)) return 'urgency';
  if (/^(?:副官|参谋|长官|弟兄们|兄弟们|兄弟|各位|全体|有人在吗|在不在|有人吗|喂|喂喂)[!！。?？,，\s]*$/.test(t)) return 'attention';
  if (/你好|您好|大家好|你们好|早上好|早安|晚上好|晚安|嗨|哈喽|hello|hi\b|在吗|早啊/.test(t)) return 'greeting';
  if (/^(?:收到|明白|知道了|好|好的|嗯|嗯嗯|行|可以|没问题|ok|了解|再见|拜拜|拜)[!！。,，\s]*$/.test(t)) return 'acknowledgment';
  if (/手机|电脑|互联网|微信|抖音|steam|gpt|api|充值|奶茶|游戏设计|写代码|作业|论文|天气|星座|彩票|篮球|足球|外卖/.test(t)) return 'off_topic';
  return null;
};
export const getLocalDialogue = (s: GameStats, input: string, fallback = false) => {
  const topic = detectDialogueTopic(input) || (fallback ? 'unclear' : null);
  return topic ? replyOnTopic(s, input, topic) : null;
};
export const getBattlefieldQuery = (s: GameStats, raw: string): string | null => {
  const t = canonicalCommand(raw);
  if (!isQuestion(t)) return null;
  const roster = s.roster.filter(q => t.includes(q.name));
  if (roster.length) return roster.map(q => `${q.name}：${q.status === 'alive' ? '名册登记存活' : `已阵亡${q.deathReason ? `（${q.deathReason === 'combat' ? '战斗阵亡' : q.deathReason}）` : ''}`}，籍贯 ${q.origin}，特点 ${q.trait}。`).join('\n');
  if (/我是谁|你是谁|你叫什么|名字|身份|真人|人工智能|机器人/.test(t)) return null;
  const lines: string[] = [];
  if (/弹药|子弹|七九弹|机枪弹|手榴弹|弹夹|弹匣/.test(t)) lines.push(`七九弹 ${s.ammo} 发，机枪弹 ${s.machineGunAmmo} 发，手榴弹 ${s.grenades} 枚。`);
  if (/物资|药品|急救包|沙袋|材料|补给/.test(t)) lines.push(`药品 ${s.medkits}，工事材料 ${s.sandbags}，手榴弹 ${s.grenades}。饮食没有独立数值。`);
  if (/伤亡|伤员|伤兵|兵力|人数|弟兄|战士|士兵|几个人|死了|阵亡/.test(t)) {
    const crew = s.hmgSquads.reduce((n,q) => n + (q.status === 'active' ? q.count : 0), 0);
    lines.push(`步兵 ${s.soldiers} 人，现役机枪人员 ${crew} 人，伤员 ${s.wounded} 人；合计可战人员 ${s.soldiers + crew} 人。专业小队包含在步兵中，不重复计算。`);
    if (/死了|阵亡|伤亡/.test(t)) lines.push(`具名名册记录 ${s.roster.filter(q => q.status === 'dead').length} 人阵亡；它只覆盖部分人物，不能当作全军累计阵亡数。名册命运属于本局游戏演绎，不作史实。`);
  }
  if (/士气|信心|能守住|撑得住|能赢/.test(t)) lines.push(`士气 ${s.morale}/100。${s.morale < 35 ? '士气低落，要留意逃兵风险。' : '士气不能保证下一战结果，仍需看兵力、资源和防线。'}`);
  if (/疲劳|精神|累不累|困不困|多累/.test(t)) lines.push(`疲劳 ${s.fatigue}/100。轮换休息才会实际降低疲劳。`);
  if (/军令|命令|预备/.test(t)) lines.push(Object.entries(s.preparedOrders || {}).map(([l,o]) => `${l}：${({ rapid:'猛烈射击',conserve:'节约弹药',close:'近距开火',bayonet:'刺刀准备',hold:'死守阵位' })[o!]}`).join('；') || '目前没有待执行的预备军令。');
  if (/敌|接敌|压力|进攻方向/.test(t)) lines.push(`敌军压力 ${s.siegeMeter}/100。${getOperationIntel(s.enemyOperation)}`);
  if (/结构|仓库还|建筑|承重/.test(t)) lines.push(`仓库总结构 ${s.health}/100；总结构与各层完整度分别计算。`);
  if (/机枪/.test(t)) lines.push(s.hmgSquads.map(q => `${q.name}：${q.location}，${q.count}人，${q.status === 'active' ? q.jammed ? `现役，枪械故障；可下令“检修${q.name}”` : '现役' : '已失效'}`).join('；'));
  if (/小队|专业|特长/.test(t)) lines.push(s.specialistSquads.map(q => `${q.name}：${q.location}，编制${q.count}人，${q.status === 'active' ? '效能受本层驻军约束' : '失效'}`).join('；'));
  for (const l of findLocations(t)) lines.push(`${l}：${s.sectorIntegrity[l] > 0 ? '我军控制' : '已失守'}，步兵 ${s.soldierDistribution[l] || 0} 人，完整度 ${s.sectorIntegrity[l]}%，工事 ${s.fortificationLevel[l]} 级。`);
  if (/国旗|升旗/.test(t)) lines.push(s.hasFlagRaised ? '国旗当前已经升起。' : '国旗当前未升起。');
  if (/杀敌|击杀|战果/.test(t)) lines.push(`战报累计击毙敌军 ${s.enemiesKilled} 人。`);
  if (/几点|第几天|日期|时间/.test(t)) lines.push(`当前第 ${s.day} 天 ${s.currentTime}。交谈不耗时，有效行动才推进时间。`);
  return lines.length ? lines.join('\n') : null;
};
