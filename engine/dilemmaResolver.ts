import type { GameStats, GameTurnResult } from '../types';
import { createEnemyOperation, revealEnemyOperation } from './battlefield';
import { addConsequenceFlag, appendCampaignHistory } from './campaignProgress';
import { reconcileSoldierDistribution } from './roster';
import { getSectorDefenseProfile } from './strategicDefense';

type RandomSource = () => number;
type DeathRecorder = (updates: Partial<GameStats>, deaths: number, narrative: string[]) => void;

export const resolveDilemma = (
  stats: GameStats,
  eventId: string,
  optionIndex: number,
  random: RandomSource,
  recordDeaths: DeathRecorder,
): GameTurnResult => {
  const updates: Partial<GameStats> = { pendingDilemmaId: null };
  const logs: string[] = [];
  const narrative: string[] = [];
  let text = '';
  let visualEffect: GameTurnResult['visualEffect'] = 'none';
  updates.triggeredEvents = stats.triggeredEvents.includes(eventId)
    ? stats.triggeredEvents
    : [...stats.triggeredEvents, eventId];

  if (eventId === 'student_run') {
    if (optionIndex === 0) {
      const deaths = Math.floor(random() * 16);
      const ammoUsed = Math.min(600, stats.ammo);
      updates.medkits = stats.medkits + 10;
      updates.ammo = stats.ammo - ammoUsed;
      updates.soldiers = Math.max(0, stats.soldiers - deaths);
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'students_rescued');
      recordDeaths(updates, deaths, narrative);
      text = `【火力接应】${ammoUsed > 0 ? '守军用尚能调出的七九弹压住外侧火力，接应人员趁隙把药品送进仓库。' : '七九弹已经耗尽，接应只能在缺少步枪掩护的险境里进行。药品仍被送了进来。'}${deaths > 0 ? '接收单上多了药，点名时却少了回答。那份刚送到手的救命东西，被人抱着，一时放不下来。' : '点名后没有接应阵亡报告。抱住药包的人缓了一口气，才发觉手指一直抠在结上。'}`;
      logs.push('📦 获得急救包 +10', `🔻 火力接应消耗七九弹 ${ammoUsed}`);
      appendCampaignHistory(stats, updates, '学生冲桥', `火力接应成功，付出${deaths}人阵亡与${ammoUsed}发弹药的代价。`, deaths > 5 ? 'bad' : 'good');
      if (deaths > 0) {
        logs.push(`🔴 阵亡: ${deaths}人`, `💔 士气 -${deaths * 2}`);
        updates.morale = Math.max(0, stats.morale - deaths * 2);
      }
      visualEffect = 'heavy-damage';
    } else {
      updates.morale = Math.max(0, stats.morale - 3);
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'students_abandoned');
      text = '你没有下令接应。岗哨仍对着桥头，药品没有送进来，联络也没能建立。副官等了一会儿，把空着的接收单收回去；外面的学生后来如何，仓库里没有确证。';
      logs.push('💔 士气 -3');
      appendCampaignHistory(stats, updates, '未接应桥头学生', '守军未作火力接应，未取得药品，也未建立民间支援线；学生去向未确认。', 'bad');
    }
  } else if (eventId === 'smuggler_boat') {
    if (optionIndex === 0 && random() < 0.5) {
      const deaths = 10 + Math.floor(random() * 10);
      updates.soldiers = Math.max(0, stats.soldiers - deaths);
      updates.morale = Math.max(0, stats.morale - deaths * 2);
      recordDeaths(updates, deaths, narrative);
      text = '【水路伏击】帆布掀开，枪口朝岸上转过来。放行的人刚喊出一个字就被枪声截断。伏击造成了实际阵亡；退回掩体的人还保持着接货时伸手的姿势。';
      logs.push(`🔴 伏击阵亡: ${deaths}人`, `💔 士气 -${deaths * 2}`);
      visualEffect = 'heavy-damage';
    } else if (optionIndex === 0) {
      updates.ammo = stats.ammo + 3000;
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'smuggler_trusted');
      text = '【水路交易】木箱推上岸，箱盖撬开，里面确实是七九弹。接货的人用指腹碰过弹壳，才示意往里搬。三千发入库，这条水路也留下了下一次联络的可能。';
      logs.push('📦 获得七九弹 +3000');
      appendCampaignHistory(stats, updates, '私枭交易成功', '取得3000发七九弹，并建立了一条不稳定的水路联系。', 'good');
    } else text = '你拒绝小船靠岸。岗哨用手势把来人挡在接应区外，船慢慢离开。没有开枪，也没有收下任何物资。';
  } else if (eventId === 'puppet_defector') {
    if (optionIndex === 0 && random() < 0.3) {
      const oldLevel = stats.fortificationLevel['一楼入口'];
      const newLevel = Math.max(0, oldLevel - 1);
      const before = Math.round(getSectorDefenseProfile(stats, '一楼入口').mitigation * 100);
      updates.fortificationLevel = { ...stats.fortificationLevel, '一楼入口': newLevel };
      updates.fortificationBuildCounts = {
        ...stats.fortificationBuildCounts,
        '一楼入口': Math.min(stats.fortificationBuildCounts['一楼入口'] || oldLevel * 2, newLevel * 2 + 1),
      };
      const afterState = { ...stats, fortificationLevel: updates.fortificationLevel, fortificationBuildCounts: updates.fortificationBuildCounts };
      const after = Math.round(getSectorDefenseProfile(afterState, '一楼入口').mitigation * 100);
      text = '【门口爆炸】来人放下的箱子突然炸开，一楼掩体被冲击撕松。尘灰落下来后，工兵先摸了一遍支撑，再报防护损失。这一次损失落在掩体上，未报告新增人员伤亡。';
      logs.push(`🏚️ 一楼掩体被炸开: 实际减伤 ${before}% → ${after}%`);
      visualEffect = 'heavy-damage';
    } else if (optionIndex === 0) {
      updates.grenades = stats.grenades + 50;
      text = '来人交出了箱子，退开让守军检查。里面的手榴弹验过后收入库存，数量五十枚。岗哨没有因为这一箱东西，就省掉对陌生人的戒备。';
      logs.push('📦 获得手榴弹 +50');
    } else {
      updates.morale = Math.max(0, stats.morale - 2);
      text = '你没有准许他们入内。岗哨传达拒绝，来人仍停留在外侧；他们的后续去向没有报告。有人觉得过于冷硬，有人仍担心箱子，争论压低了士气。没有执行射杀。';
    }
  } else if (eventId === 'wrecked_truck') {
    if (optionIndex === 0) {
      const deaths = Math.floor(random() * 5) + 1;
      updates.ammo = stats.ammo + 2000;
      updates.soldiers = Math.max(0, stats.soldiers - deaths);
      updates.morale = Math.max(0, stats.morale - deaths * 2);
      recordDeaths(updates, deaths, narrative);
      text = '【抢运归来】弹药箱拖过门槛，木边磨掉了一长条，抬箱的手却还不肯松。七九弹搬回了，出发的人没有全部回来。副官先让人把通道腾开，再逐个核对阵亡者。';
      logs.push('📦 获得七九弹 +2000', `🔴 阵亡: ${deaths}人`, `💔 士气 -${deaths * 2}`);
    } else {
      updates.morale = Math.max(0, stats.morale - 2);
      text = '你放下望远镜，决定放弃抢运。门边等着出发的人散回阵位，弹药仍留在外面。有人松了口气，又不愿让旁人看见。';
      logs.push('💔 士气 -2');
    }
  } else if (eventId === 'stray_airdrop') {
    if (optionIndex === 0 && random() > 0.3) {
      updates.medkits = stats.medkits + 5;
      updates.sandbags = stats.sandbags + 100;
      updates.morale = Math.min(100, stats.morale + 5);
      text = '【取回空投】攀爬的兵终于回到遮蔽里，先把包推给接应的人，自己扶着墙蹲下。手指攥得僵硬，好一会儿才伸直；药品与材料核验后入库，旁边的人这才敢骂一句：“吓死老子了。”';
      logs.push('📦 获得急救包 +5', '📦 获得工事材料 +100', '💪 士气 +5');
    } else if (optionIndex === 0) {
      updates.soldiers = Math.max(0, stats.soldiers - 1);
      updates.morale = Math.max(0, stats.morale - 5);
      recordDeaths(updates, 1, narrative);
      text = '【坠亡】高处传来一下金属摩擦，攀爬的人失去支撑，身体撞落地面。接应者冲过去，仍没能救回那条命。旁边散着没取成的包，人们不再仰头看它。';
      logs.push('🔴 意外坠亡: 1人', '💔 士气 -5');
    } else {
      updates.sandbags = stats.sandbags + 50;
      text = '你选了保守回收。接应的人只收起落散后仍可使用的材料，没再派人攀爬。药品没能保住，五十份材料收入库存。';
      logs.push('📦 获得工事材料 +50');
    }
  } else if (eventId === 'brit_ceasefire') {
    if (optionIndex === 0) {
      updates.morale = Math.max(0, stats.morale - 5);
      updates.medkits = stats.medkits + 5;
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'british_ceasefire_accepted');
      text = '【接受限制】火力限制令传下去，守军听着，没有马上答话。换来的药品送到救护处，军医逐份收好。限制与不满都已留下，五份药却也确实到了手里。';
      logs.push('💔 士气 -5', '📦 获得急救包 +5');
      appendCampaignHistory(stats, updates, '接受英军停火要求', '接受南侧火力限制要求，换得5份急救物资；本事件未额外扣除弹药。', 'neutral');
    } else {
      const operation = stats.enemyOperation || createEnemyOperation(stats, random);
      updates.morale = Math.min(100, stats.morale + 5);
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'british_defied');
      updates.enemyOperation = { ...operation, target: '地下室', routeName: '苏州河岸 → 地下室侧墙', turnsRemaining: Math.max(1, operation.turnsRemaining - 1) };
      text = '【拒绝要求】你把译文推回联络员面前，拒绝接受限制。屋内有人低低应了一声，随即继续看作战图：这份强硬会有人支持，也会有人在侧翼替它承担压力。';
      logs.push('💪 士气 +5');
      appendCampaignHistory(stats, updates, '拒绝英军通牒', '士气提高，但南侧联络被封锁，地下室侧翼攻势提前。', 'neutral');
    }
  } else if (eventId === 'student_thanks') {
    updates.medkits = stats.medkits + 8;
    updates.morale = Math.min(100, stats.morale + 8);
    updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'student_support_arrived');
    text = '【河对岸的回声】药品交到了接收的人手里，包裹外面还夹着一句谢意。学生们记着那次接应。军医摸了摸新到的药，低声说：“替我谢谢他们。这个真用得上。”';
    logs.push('📦 急救包 +8', '💪 士气 +8');
    appendCampaignHistory(stats, updates, '民众支援抵达', '此前救下的学生带来了药品和来自租界的声援。', 'good');
  } else if (eventId === 'smuggler_return') {
    updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'smuggler_network_resolved');
    if (optionIndex === 0 && stats.ammo >= 300) {
      updates.ammo = stats.ammo - 300;
      updates.machineGunAmmo = stats.machineGunAmmo + 1800;
      text = '【水路接力】三百发七九弹用在掩护上，小船趁空隙卸下机枪弹。接货的人往回搬时不敢停，到库房才逐箱清点：一千八百发。那条危险的水路，这次把约定兑成了实物。';
      logs.push('🔻 七九弹 -300', '📦 机枪弹 +1800');
      appendCampaignHistory(stats, updates, '水路补给线', '掩护私枭撤离，获得1800发机枪弹。', 'good');
    } else {
      text = optionIndex === 0
        ? '三百发掩护用弹已经凑不齐，小船没有卸货。联络员把水路联系从可用名单里划去，手指在纸上停了一下。此后不再接货，也未消耗弹药。'
        : '你决定不再冒险接货。联络员传出消息，小船离开，水路联系就此中止。没有卸货，也没有消耗弹药。';
      appendCampaignHistory(stats, updates, '中止水路联系', '选择保存火力，放弃后续机枪弹补给。', 'neutral');
    }
  } else if (eventId === 'british_pressure') {
    const materialUsed = Math.min(120, stats.sandbags);
    const operation = stats.enemyOperation || createEnemyOperation(stats, random);
    updates.sandbags = stats.sandbags - materialUsed;
    updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'british_pressure_resolved');
    updates.enemyOperation = revealEnemyOperation({ ...operation, target: '地下室', routeName: '苏州河岸 → 地下室侧墙', turnsRemaining: Math.min(2, operation.turnsRemaining) });
    text = '【侧翼预警】地下室侧翼攻势已经查明。工兵领出尚能调用的材料，往需要设防的位置搬去；作战图上那条路线终于清楚，留给守军准备的时间却更短了。';
    logs.push(`🧱 工事材料 -${materialUsed}`);
    appendCampaignHistory(stats, updates, '南侧封锁的代价', '地下室侧翼攻势提前，但守军取得完整预警。', 'bad');
  }

  // Event casualties bypass the normal turn finalizer, so reconcile the map
  // immediately instead of leaving total strength and floor garrisons out of
  // sync until the player's next timed action.
  if (typeof updates.soldiers === 'number') {
    updates.soldierDistribution = reconcileSoldierDistribution(
      updates.soldierDistribution || stats.soldierDistribution,
      updates.soldiers,
      stats.location,
    );
  }

  // Report the settled change after caps, rather than promising the nominal gain.
  const settlementLogs = logs.filter((line) => !line.includes('士气'));
  if (typeof updates.morale === 'number') settlementLogs.push(`💪 士气 ${stats.morale} → ${updates.morale}`);
  const fullNarrative = `${text}${narrative.length ? `\n${narrative.join('')}` : ''}${settlementLogs.length ? `\n\n${settlementLogs.join('\n')}` : ''}`;
  return { narrative: fullNarrative, updatedStats: updates, eventTriggered: 'none', visualEffect };
};
