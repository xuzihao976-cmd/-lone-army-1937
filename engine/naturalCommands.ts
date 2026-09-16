import type { GameStats, Location } from '../types';
import type { PlayerActionResolution } from './actions/resolvePlayerAction';
import { findLocations } from './commandUtils';
import { getOperationIntel } from './battlefield';
export const ORDER_LABELS = { rapid: '猛烈射击', conserve: '节约弹药', close: '近距开火', bayonet: '刺刀准备', hold: '死守阵位' } as const;
export const ORDER_HELP = { rapid: '步枪杀伤潜力提高25%，每次击杀耗弹提高35%（受弹药限制）', conserve: '步枪杀伤潜力降低20%，每次击杀耗弹降低30%', close: '步枪杀伤潜力提高15%，步兵接战伤亡提高15%', bayonet: '白刃杀伤潜力提高25%，白刃伤亡降低15%', hold: '本次伤亡降低10%，疲劳增加5' } as const;
export const canonicalCommand = (s: string) => s.trim().toLowerCase().replace(/顶楼|楼顶/g, '屋顶').replace(/第二层|二层/g, '二楼').replace(/第一层|大门/g, '一楼').replace(/地窖|负一层/g, '地下室');
export function resolveNaturalCommand(stats: GameStats, input: string): PlayerActionResolution | null {
 const cmd = canonicalCommand(input);
 const result: PlayerActionResolution = { updatedStats: {}, logs: [], narrative: [], timeCost: 0, siegeIncrease: 0, actionType: 'idle' };
 const say = (s: string) => { result.narrative.push(s); return result; };
 const locs = findLocations(cmd); const target: Location = locs[0] || stats.location;
 if (/如果|一旦|假如/.test(cmd)) return say('条件军令尚未启用，未执行。请在需要时直接下令，并指定楼层。');
 if (/然后|同时|并且/.test(cmd)) return say('请把多个行动拆成逐条命令，以免耗时与目标产生歧义；本次未执行。');
 if (/查询|报告|多少|怎么样|如何|情况|还剩|有没有|能赢|能守住|有信心/.test(cmd) || /^(副官[，,：: ]*)?报告[！!。]*$/.test(cmd)) {
  if (/弹药|子弹|机枪弹/.test(cmd)) return say(`七九弹 ${stats.ammo} 发，机枪弹 ${stats.machineGunAmmo} 发，手榴弹 ${stats.grenades} 枚。`);
  if (/物资|药|沙袋|材料/.test(cmd)) return say(`药品 ${stats.medkits}，工事材料 ${stats.sandbags}，手榴弹 ${stats.grenades}。`);
  if (/伤|兵力|人数|弟兄/.test(cmd)) return say(`步兵 ${stats.soldiers} 人，现役机枪人员 ${stats.hmgSquads.filter(s=>s.status==='active').reduce((n,s)=>n+s.count,0)} 人，伤员 ${stats.wounded} 人。专业小队包含在步兵中，不重复计算。`);
  if (/军令|命令/.test(cmd)) return say(Object.entries(stats.preparedOrders || {}).map(([l,o])=>`${l}：${ORDER_LABELS[o!]}`).join('；') || '目前没有待执行的预备军令。');
  if (/敌|接敌/.test(cmd)) return say(getOperationIntel(stats.enemyOperation));
  if (locs.length) return say(`${target}：步兵 ${stats.soldierDistribution[target] || 0} 人，完整度 ${stats.sectorIntegrity[target]}%，工事 ${stats.fortificationLevel[target]} 级。`);
  return say(`第 ${stats.day} 天 ${stats.currentTime}，士气 ${stats.morale}，步兵 ${stats.soldiers} 人，伤员 ${stats.wounded} 人，七九弹 ${stats.ammo} 发。${getOperationIntel(stats.enemyOperation)}`);
 }
 if (/^(弟兄们|兄弟们|大家好|你好|你们好|喂|在吗|辛苦了|谢谢)[！!。，,？?\s]*$/.test(cmd)) return say(stats.ammo <= 0 ? '有人举起空弹夹：“长官，我们在。步枪弹没了，等您安排。”' : stats.morale < 35 ? '几个士兵抬起头，声音疲惫：“长官，弟兄们还在。”' : '守军从掩体后应声：“长官，我们听着。您下令。”');
 if (/取消.*(军令|预备|射击)|恢复常规/.test(cmd)) { result.updatedStats.preparedOrders = { ...stats.preparedOrders }; delete result.updatedStats.preparedOrders[target]; return say(`${target}恢复常规交战。`); }
 if (/不要|不许|停止|别/.test(cmd) && !/等.*(近|靠近).*打|别怕|不要怕/.test(cmd)) return say('收到停止意图，未执行新行动。可下令“取消一楼预备军令”或“等近了再打”。');
 let order: keyof typeof ORDER_LABELS | undefined;
 if (/节约弹药|省着打|省点子弹/.test(cmd)) order='conserve';
 else if (/等.*(近|靠近).*打|近距开火/.test(cmd)) order='close';
 else if (/刺刀|白刃准备/.test(cmd)) order='bayonet';
 else if (/猛烈射击|打死他们|狠狠.*打|集中火力|火力压制/.test(cmd)) order='rapid';
 else if (/死守|守住阵位/.test(cmd)) order='hold';
 if (order) {
  if (locs.length > 1) return say('请一次指定一个楼层的预备军令，当前未执行。');
  if (stats.sectorIntegrity[target] <= 0 || (stats.soldierDistribution[target] || 0) <= 0) return say(`${target}已失守或没有步兵，军令未执行。`);
  if (['rapid','conserve','close'].includes(order) && stats.ammo <= 0) return say('七九弹已经耗尽，无法安排步枪射击军令。可准备刺刀或调整防守。');
  result.updatedStats.preparedOrders = { ...stats.preparedOrders, [target]: order };
  return say(`${target}收到：${ORDER_LABELS[order]}。${ORDER_HELP[order]}。仅在该层下次步兵接战生效，随后解除；替换命令不叠加。`);
 }
 if (/振作|打起精神|别怕|不要怕|加油|88师万岁|八十八师万岁/.test(cmd)) {
  if (stats.turnCount - (stats.lastEncourageTurn ?? -999) < 3) return say('弟兄们已听到鼓励，短时间重复喊话不会继续恢复士气。');
  if (stats.morale >= 100) return say('守军士气充足，无需重复鼓励。');
  const gain=Math.min(4,100-stats.morale);
  result.updatedStats={morale:stats.morale+gain,lastEncourageTurn:stats.turnCount};
  result.timeCost=15; result.siegeIncrease=3; result.actionType='encourage'; result.logs.push(`士气 +${gain}；耗时15分钟`);
  return say(stats.morale<35 ? '回应有些稀落，老兵开始挨个安抚身旁的新兵。' : '守军重新检查枪械，互相点头示意。');
 }
 if (/别|不要|不许|停止/.test(cmd)) return say('收到停止意图，但目标不明确，未执行行动。可下令“取消一楼预备军令”或“等近了再打”。');
 if (/调.*人|派.*班|伤员.*送/.test(cmd) && !/^调派30人从.+至.+$/.test(cmd)) return say('人员命令尚缺明确安排，未移动人员。请用地图调兵按钮指定来源、目标和人数；救治伤员请使用“治疗”。');
 return null;
}
