import type { GameStats } from '../types';
import { CHAPTER_CHAT, CHAPTER_CONTEXT, CHAPTER_UNVOICED, type ChapterLine, type ChapterVoice } from '../data/text/chapterNarrative';
import type { DialogueTopic } from '../data/text/localDialogue';
import { canonicalCommand, getLanguageGuard, isQuestion } from './commandLanguage';
import { detectDialogueTopic, rotateDialogueLines } from './localConversation';
import { CHAPTER_TIME_LIMIT, CROSSING_TARGET } from '../data/chapters';

type ChapterTopic = keyof typeof CHAPTER_CHAT.street;
const translated: Partial<Record<DialogueTopic, ChapterTopic>> = {
  praise: 'thanks', apology: 'concern', distrust: 'frustration', sarcasm: 'frustration', insult: 'frustration', enemy: 'frustration',
};
const actionWords = /搜救|护送|射击|撤|轮换|加固|侦察|观察|治疗|救治|休息|使用|选择/;
export const isChapterActionMention = (input: string) => actionWords.test(input);
const roleTraits: Partial<Record<ChapterVoice, string>> = { leader: '老班长', runner: '传令兵', medic: '救护兵' };

const topicFor = (input: string): ChapterTopic | null => {
  if (/怕不怕|怕吗/.test(input)) return 'fear';
  if (/累不累|困不困|累吗|困吗/.test(input)) return 'fatigue';
  const detected = detectDialogueTopic(input);
  if (!detected) return null;
  return Object.hasOwn(CHAPTER_CHAT.street, detected) ? detected as ChapterTopic : translated[detected] ?? 'unclear';
};

export const isChapterInformationQuery = (stats: GameStats, raw: string): boolean => {
  const input = canonicalCommand(raw);
  if (/^(?:(?:副官|长官)[,，:：\s]*)?(?:请|麻烦|帮我)?(?:报告|查询|查看|查一下|查查)/.test(input)) return true;
  if (/名册|都有谁|谁还活着|谁阵亡|谁死了/.test(input)) return true;
  const named = stats.roster.some(person => input.includes(person.name));
  if (named && (isQuestion(input) || /是谁|谁是|呢|在哪|怎么样|还好|活着|阵亡|死/.test(input))) return true;
  if (!isQuestion(input)) return false;
  return actionWords.test(input) || /多少|还剩|几个人|几发|几点|第几天|时间|日期|兵力|人数|伤亡|伤员|伤兵|急救包|药品|弹药|子弹|七九弹|材料|压力|进度|目标|路线|名册|战果|击毙|士气|敌军|敌情|敌人|日军|接敌|攻势|封锁|过桥|安全区|抵达/.test(input)
    || topicFor(input) === null;
};

const contextualTopics = new Set<ChapterTopic>(['greeting', 'attention', 'concern', 'fear', 'fatigue', 'frustration', 'urgency']);
const linesFor = (stats: GameStats, topic: ChapterTopic): readonly ChapterLine[] => {
  const id = stats.chapterId === 'bridge' ? 'bridge' : 'street';
  const banks = CHAPTER_CONTEXT[id];
  const mission = stats.mission!;
  if (contextualTopics.has(topic)) {
    if (stats.ammo === 0) return banks.low_ammo;
    if (stats.wounded > 0 && stats.medkits === 0) return banks.no_meds;
    if (CHAPTER_TIME_LIMIT - mission.elapsedMinutes <= 40) return banks.deadline;
    if (id === 'bridge' && mission.crossed >= CROSSING_TARGET) return CHAPTER_CONTEXT.bridge.goal;
    if (stats.wounded > 0 && ['concern', 'fear', 'fatigue'].includes(topic)) return banks.wounded;
    if (id === 'street' && mission.found > mission.evacuated && ['attention', 'urgency', 'frustration'].includes(topic)) return CHAPTER_CONTEXT.street.waiting;
  }
  return CHAPTER_CHAT[id][topic];
};

/** Returns text plus display-only memory. No mutation, time, rewards or RNG. */
export const chapterConversation = (stats: GameStats, raw: string) => {
  if (!['street', 'bridge'].includes(stats.chapterId) || !stats.mission || stats.isGameOver || raw.length > 500 || getLanguageGuard(raw)
    || isChapterInformationQuery(stats, raw) || actionWords.test(raw)) return null;
  const id = stats.chapterId === 'bridge' ? 'bridge' : 'street';
  const topic = topicFor(raw) ?? 'unclear';
  const reply = rotateDialogueLines(stats, raw, topic, linesFor(stats, topic));
  if (reply.line.voice === 'narrator') return { text: reply.line.text, memory: reply.memory };
  const speaker = stats.roster.find(person => person.status === 'alive' && person.origin === '虚构人物'
    && typeof person.id === 'string' && person.id.startsWith(`${id}-`) && person.trait === roleTraits[reply.line.voice]);
  if (!speaker) return { text: CHAPTER_UNVOICED[id][reply.memory.variant % CHAPTER_UNVOICED[id].length].text, memory: reply.memory };
  return { text: `${speaker.name}（${speaker.trait}）${reply.line.text}`, memory: reply.memory };
};
