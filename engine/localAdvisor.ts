import type { GameStats } from '../types';
import { LOCAL_DIALOGUE } from '../data/text/localDialogue';
import { canonicalCommand, getLanguageGuard, isExecutableLocalAction } from './commandLanguage';
import { resolveNaturalCommand } from './naturalCommands';
import { getActionPreview } from './actionPreview';
import { detectDialogueTopic } from './localConversation';
import { getLocalRuleHelp } from '../data/text/localRules';
import { isShortChapter } from '../data/chapters';
import { missionAdvisor } from './chapterEngine';
export const localAdvisorResponse = (input: string, stats?: GameStats, sequence=0): {text:string; known:boolean} => {
  if (stats && isShortChapter(stats)) return { text: missionAdvisor(stats, input), known: true };
  const cmd=canonicalCommand(input), guard=getLanguageGuard(input);
  if (guard) { const lines=LOCAL_DIALOGUE[guard]; return {text:lines[sequence%lines.length],known:true}; }
  if (stats) {
    const r=resolveNaturalCommand(stats,input);
    if (isExecutableLocalAction(cmd) || (r && (r.timeCost>0 || Object.keys(r.updatedStats).some(k=>k!=='localDialogue')))) {
      const preview=getActionPreview(stats,input);
      return {text:`【顾问窗口 · 尚未执行】\n${preview?.short || '这条输入属于可执行行动。'}\n${preview?.reason || ''}\n需要执行，请回到主界面军令栏。这里不改变兵力、资源或时间。`,known:true};
    }
    if (r) return {text:r.narrative.join(''),known:true};
  }
  const rule=getLocalRuleHelp(cmd); if (rule) return {text:rule,known:true};
  const topic=detectDialogueTopic(cmd); const lines=LOCAL_DIALOGUE[topic || 'unclear'];
  return {text:lines[sequence%lines.length],known:topic!==null};
};
