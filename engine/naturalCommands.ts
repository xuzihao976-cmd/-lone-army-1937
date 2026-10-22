import type { GameStats, Location } from '../types';
import type { PlayerActionResolution } from './actions/resolvePlayerAction';
import { findLocations } from './commandUtils';
import { canonicalCommand, directiveCore, getLanguageGuard, isQuestion, isExecutableLocalAction } from './commandLanguage';
import { getBattlefieldQuery, getLocalDialogue, replyOnTopic } from './localConversation';
import { getLocalRuleHelp } from '../data/text/localRules';
export { canonicalCommand } from './commandLanguage';
export const ORDER_LABELS = { rapid: '猛烈射击', conserve: '节约弹药', close: '近距开火', bayonet: '刺刀准备', hold: '死守阵位' } as const;
export const ORDER_HELP = { rapid: '步枪杀伤潜力提高25%，每次击杀耗弹提高35%（受弹药限制）', conserve: '步枪杀伤潜力降低20%，每次击杀耗弹降低30%', close: '步枪杀伤潜力提高15%，步兵接战伤亡提高15%', bayonet: '白刃杀伤潜力提高25%，白刃伤亡降低15%', hold: '本次伤亡降低10%，疲劳增加5' } as const;
export function resolveNaturalCommand(stats: GameStats, input: string): PlayerActionResolution | null {
  const cmd = canonicalCommand(input);
  const result: PlayerActionResolution = { updatedStats: {}, logs: [], narrative: [], timeCost: 0, siegeIncrease: 0, actionType: 'idle' };
  const say = (text: string) => { result.narrative.push(text); return result; };
  const topic = (name: Parameters<typeof replyOnTopic>[2]) => { const reply = replyOnTopic(stats,input,name); result.updatedStats.localDialogue = reply.memory; return say(reply.text); };
  const guard = getLanguageGuard(input);
  if (guard) return topic(guard);
  const rule = getLocalRuleHelp(cmd);
  if (rule) return say(rule);
  if (isQuestion(cmd)) {
    const fact = getBattlefieldQuery(stats, cmd);
    if (fact) return say(fact);
    const reply = getLocalDialogue(stats,input);
    if (reply) { result.updatedStats.localDialogue=reply.memory; return say(reply.text); }
    if (/报告|查询|情况|状态/.test(cmd)) return say(`第 ${stats.day} 天 ${stats.currentTime}，士气 ${stats.morale}/100，步兵 ${stats.soldiers} 人，伤员 ${stats.wounded} 人，七九弹 ${stats.ammo} 发。`);
    return topic('unclear');
  }
  const locs = findLocations(cmd); const target: Location = locs[0] || stats.location;
  const core = directiveCore(cmd);
  if (/^(?:取消|撤销)(?:预备)?(?:军令|预备军令|射击命令)|^恢复常规(?:交战|射击)?$/.test(core) && /^(?:(?:取消|撤销)(?:预备)?(?:军令|预备军令|射击命令)|恢复常规(?:交战|射击)?)$/.test(core)) {
    if (locs.length>1) return say('一次指定一个楼层；本次未取消军令。');
    result.updatedStats.preparedOrders = {...stats.preparedOrders}; delete result.updatedStats.preparedOrders[target]; result.actionType='cancel_order';
    return say(`${target}恢复常规交战，取消预备军令，不耗时。`);
  }
  let order: keyof typeof ORDER_LABELS | undefined;
  if (/^(?:节约弹药|省着打|省点子弹)$/.test(core)) order='conserve';
  else if (/^(?:(?:先别开枪|别开枪|不要开枪)?等(?:他们|敌人|敌军|鬼子)?(?:靠近|近了)(?:了)?再打|近距开火)$/.test(core)) order='close';
  else if (/^(?:上刺刀|刺刀准备|白刃准备|准备刺刀)$/.test(core)) order='bayonet';
  else if (/^(?:猛烈射击|打死他们|狠狠(?:地)?打(?:他们)?|集中火力|火力压制)$/.test(core)) order='rapid';
  else if (/^(?:死守|死守阵位|守住阵位)$/.test(core)) order='hold';
  if (order) {
    if (locs.length>1) return say('请一次指定一个楼层的预备军令，本次未执行。');
    if (/机枪/.test(cmd)) return say('这是步兵预备军令；机枪请在地图单独部署，本次未执行。');
    if (stats.sectorIntegrity[target]<=0 || !stats.soldierDistribution[target]) return say(`${target}已失守或没有步兵，军令未执行。`);
    if (['rapid','conserve','close'].includes(order) && stats.ammo<=0) return say('七九弹已经耗尽，无法安排步枪射击军令。可准备刺刀或调整防守。');
    result.updatedStats.preparedOrders={...stats.preparedOrders,[target]:order}; result.actionType='prepare_order';
    return say(`${target}收到：${ORDER_LABELS[order]}。${ORDER_HELP[order]}。仅在该层下次步兵接战生效，随后解除；替换不叠加。`);
  }
  if (/^(?:振作(?:起来)?|打起精神|别怕|不要怕|加油|加把劲|88师万岁|八十八师万岁|我们能行)$/.test(core)) {
    if (stats.turnCount-(stats.lastEncourageTurn ?? -999)<3) return say('弟兄们已听到鼓励，短时间重复喊话不会继续恢复士气。');
    if (stats.morale>=100) return say('守军士气充足，无需重复鼓励。');
    const gain=Math.min(4,100-stats.morale);
    result.updatedStats={morale:stats.morale+gain,lastEncourageTurn:stats.turnCount}; result.timeCost=15; result.siegeIncrease=3; result.actionType='encourage'; result.logs.push(`士气 +${gain}；耗时15分钟`);
    return say(stats.morale<35 ? '回应稀落，老兵开始挨个安抚身旁的人。' : '守军互相点点头，重新检查枪械。');
  }
  if (isExecutableLocalAction(cmd)) return null;
  const dialogue = getLocalDialogue(stats,input);
  if (dialogue) { result.updatedStats.localDialogue=dialogue.memory; return say(dialogue.text); }
  if (/不要|别|不许|停止|不想|不能|不准|不必|莫要/.test(cmd)) return topic('negation');
  if (/调.*人|派.*班|伤员.*送/.test(cmd)) return say('人员安排不明确，本次未移动。请用地图指定来源、目标和人数；治疗请下“治疗伤员”。');
  return null;
}
