import type { GameStats, GameTurnResult } from '../types';
import { revealEnemyOperation } from './battlefield';
import { addConsequenceFlag, appendCampaignHistory } from './campaignProgress';
import { reconcileSoldierDistribution } from './roster';
import { getSectorDefenseProfile } from './strategicDefense';
import { EVENT_RULES as R } from '../data/eventRules';
import { getEventPlan, getPendingEvent, presentEvent, validEventOperation } from './eventPlans';

type RandomSource = () => number;
type DeathRecorder = (updates: Partial<GameStats>, deaths: number, narrative: string[]) => void;

export const resolveDilemma = (stats: GameStats, eventId: string, optionIndex: number,
  random: RandomSource, recordDeaths: DeathRecorder): GameTurnResult => {
  const plan = getEventPlan(stats, `evt_resolve:${eventId}:${optionIndex}`);
  if (!plan?.available) {
    const pending = getPendingEvent(stats);
    return { narrative: `未执行：${plan?.reason ?? '该事件选项无效。'}`, updatedStats: {}, eventTriggered: 'none',
      dilemma: pending ? presentEvent(stats, pending) : undefined };
  }
  const updates: Partial<GameStats> = { pendingDilemmaId: null, pendingEvent: null,
    triggeredEvents: [...stats.triggeredEvents, eventId] };
  const logs: string[] = [], narrative: string[] = [];
  let text = '', visualEffect: GameTurnResult['visualEffect'] = 'none';
  const history = (title: string, detail: string, tone: 'good'|'bad'|'neutral' = 'neutral') => appendCampaignHistory(stats, updates, title, detail, tone);
  const flag = (value: string) => { updates.consequenceFlags = addConsequenceFlag(updates.consequenceFlags ?? stats.consequenceFlags, value); };
  const morale = (delta: number) => { updates.morale = Math.min(100, Math.max(0, (updates.morale ?? stats.morale) + delta)); };
  const deaths = (rolled: number) => {
    const count = Math.min(stats.soldiers, plan.partySize, Math.max(0, rolled));
    updates.soldiers = stats.soldiers - count;
    if (count > 0) { morale(-count * 2); recordDeaths(updates, count, narrative); visualEffect = 'heavy-damage'; }
    return count;
  };
  if (plan.ammo) { updates.ammo = stats.ammo - plan.ammo; logs.push(`七九弹 -${plan.ammo}`); }
  if (plan.materials) { updates.sandbags = stats.sandbags - plan.materials; logs.push(`工事材料 -${plan.materials}`); }

  if (eventId === 'street_corner') {
    if (optionIndex === 0) {
      flag('street_corner_cleared');
      text='砖被一块块移到墙根，内巷重新留出通行的位置。搬砖的人先试着走过一遍，才回头招呼。路清开了，等在后面的人仍要另行护送。';
      history('内巷清障完成','花10分钟清障，保留内巷；尚未增加安全抵达人数。');
    } else {
      updates.mission={...stats.mission!,route:'river'};
      text='带路的人把手往另一侧一指，改走已查明的沿河线。前面的人转了身，后面才跟着挪。选路没有替任何人走完这一程，原来转角的砖仍堆着。';
      history('转向沿河撤收线','选择改道不耗时；后续沿河护送15分钟、压力更高，内巷障碍仍在。');
    }
  } else if (eventId === 'wall_knocking') {
    if (optionIndex === 0) {
      updates.mission={...stats.mission!,found:stats.mission!.found+1};
      text='敲击声终于有了人的回答。搜救人员核对登记，找到其中尚未接回的一人。对方站到队伍旁，先扶住墙，没有马上问别的。找到的人仍须护送，尚未记作安全抵达。';
      logs.push('找到登记民众 +1，安全抵达人数未变');history('隔墙搜救','核实找到原十二人登记中的1人，仍待另行护送。','good');
    } else {
      text='你没有让队伍停下来搜救。隔墙后的声音没有被核实，登记上仍留着未找到的名字。接下来的人把脚步放轻了一些，没有谁替那边写下死讯。';
      history('未核实隔墙敲击','未找到新人，去向未确认；没有扣除全队士气。');
    }
  } else if (eventId === 'beam_creak') {
    if (optionIndex === 0 && plan.location) {
      const floor=plan.location,old=stats.fortificationLevel[floor];
      updates.fortificationLevel={...stats.fortificationLevel,[floor]:old-1};
      updates.fortificationBuildCounts={...stats.fortificationBuildCounts,[floor]:Math.min(stats.fortificationBuildCounts[floor]??old*2,(old-1)*2+1)};
      updates.sectorIntegrity={...stats.sectorIntegrity,[floor]:Math.min(100,stats.sectorIntegrity[floor]+R.beam.integrityReward)};
      text='抢修人员从挡弹工事上拆出木料，抵住松动处。灰仍落了几缕，支撑逐渐吃住重量；原来的射击位却露出了一截空处。人从那一截经过，都把身子压低了些。';
      logs.push(plan.riskText);history('拆防护支撑结构',plan.riskText);
    } else {text='你保留现成的挡弹工事。抢修人员把工具收在一旁，提醒经过的人避开松动处。本层完整度没有恢复，也没有因此直接记入人员损失。';history('保留现成防护','没有拆用工事，完整度维持现状，后续风险依实际阵地状态结算。');}
  } else if (eventId === 'wet_medicine') {
    if (optionIndex === 0) {
      text='药箱搬离渗水的位置，外层湿纸被揭开，尚可用的药品重新核过数。军医把箱盖压好，手仍停在上面片刻。这只是保住库存，伤员还等着治疗。';
      history('药箱搬移完成',`保住现有${stats.medkits}份急救包，未新增药品或完成治疗。`);
    } else {
      const lost=Math.min(stats.medkits,R.wetMedicine.maxLoss);updates.medkits=stats.medkits-lost;
      text='你先把人手留在阵位。再查药箱时，受潮的部分已经不能使用。守箱的人把它们另放一边，核清报废数量；没把剩下的也一并划掉。';
      logs.push(`急救包实际报废 ${lost}份`);history('受潮药品报废',`实际报废${lost}份急救包，没有直接新增伤亡。`,'bad');
    }
  } else if (eventId === 'hmg_jam') {
    if (optionIndex === 0) {
      updates.hmgSquads=stats.hmgSquads.map(q=>q.name===plan.hmgName?{...q,jammed:false}:q);
      text=`${plan.hmgName}停射检查，排除了记录中的故障。枪组长把机柄复位，报了声“能用了”，才让人回到各自的位置。恢复的是这把枪，人员没有增减；真正开火还要看阵地与余弹。`;
      history('机枪故障排除',`${plan.hmgName}检修30分钟，恢复武器；没有补发人员、弹药或零件。`,'good');
    } else {
      text=`${plan.hmgName}暂不检修。枪组人员仍留在编制，故障枪停止提供火力和掩护。邻近步兵按现有部署接续防务，没有凭这句话多出人或枪。稍后可明确下令“检修${plan.hmgName}”。`;
      history('暂缓机枪检修',`${plan.hmgName}故障保留，可另行检修；没有人员阵亡或增补。`);
    }
  } else if (eventId === 'student_run') {
    if (optionIndex === 0) {
      const lost = deaths(Math.floor(random() * (R.student.maxDeaths + 1)));
      updates.medkits = stats.medkits + R.student.medkitsReward; flag('students_rescued');
      text = '【火力接应】掩护展开，接应人员把药包送进仓库。'
        + (lost ? '药到了，点名却少了回答。抱着包的人没有马上松手，等副官把名字重新核实了一遍。' : '这次接应环节未报告阵亡。抱住药包的人缓了一口气，才发觉指头一直抠在结上。');
      logs.push(`急救包 +${R.student.medkitsReward}`, `接应阵亡: ${lost}人`);
      history('学生冲桥', `接应药品入库，实际阵亡${lost}名派出步兵，掩护用弹${plan.ammo}发。`, lost ? 'bad' : 'good');
    } else {
      flag('students_abandoned');
      text = '你没有下令接应。岗哨仍看着外侧，药品没有送进来，支援线也没有建立。副官收起空着的接收单；外面的人员后来如何，没有确证。';
      history('未作桥头接应', '守军未取得药品或建立支援线；未把外面人员的去向写成死讯。');
    }
  } else if (eventId === 'smuggler_boat') {
    if (optionIndex === 1) {
      text = '你拒绝小船靠岸。岗哨传出手势，船慢慢离开。没有开枪，也没有接收物资。';
      history('拒绝水路接货', '未建立联系，未消耗弹药。');
    } else {
      const checked = optionIndex === 2;
      const ambushed = random() < (checked ? R.checkedBoat.ambushChance : R.boat.ambushChance);
      if (ambushed) {
        const rolled = checked ? 1 + Math.floor(random() * R.checkedBoat.maxDeaths)
          : R.boat.minDeaths + Math.floor(random() * (R.boat.maxDeaths - R.boat.minDeaths + 1));
        const lost = deaths(rolled);
        text = checked ? '【核验遇险】异常在交接时暴露，接应人员退回遮蔽。核验压低了风险，仍没能让这一趟免于损失。没有弹药入库。'
          : '【水路伏击】帆布下面露出枪口。接货的人退回掩体，点名时才把缺额逐个核实。这次没有弹药入库。';
        logs.push(`伏击阵亡: ${lost}人`); history('水路接货遇险', `实际阵亡${lost}名派出步兵，未取得货物。`, 'bad');
      } else {
        const gain = checked ? R.checkedBoat.ammoReward : R.boat.ammoReward;
        updates.ammo = (updates.ammo ?? stats.ammo) + gain; flag('smuggler_trusted');
        text = checked ? '【核验接货】只把核验清楚的那部分弹药接收入库。接货的人报完数，又把没验收的箱子推回去，没有因做成交易就撤掉岗哨。'
          : '【水路接货】木箱打开，里面确实是七九弹。接货的人清点完，才示意往里搬。这次接头留下了后续联系的可能。';
        logs.push(`七九弹入库 +${gain}`); history('水路接货成功', `取得${gain}发七九弹${checked ? `，另用了${plan.ammo}发掩护用弹` : ''}，建立不稳定的水路联系。`, 'good');
      }
    }
  } else if (eventId === 'puppet_defector') {
    if (optionIndex === 1) {
      text = '你没有准许来人入内。岗哨传达拒绝，对方仍停在外侧。箱子未接收，没有执行射杀，后续去向未确认。';
      history('拒绝门外来人', '未接收物资，也未凭猜测开枪。');
    } else if (optionIndex === 2) {
      if (random() < R.defector.sabotageChance) {
        text = '【隔离拒收】核验中发现异常，箱子留在隔离位置。来人没有被带入守军工事，这次没有新增伤亡，也没有工事受损。';
        history('隔离核验拒收', `消耗${plan.materials}份隔离材料，未取得手榴弹。`);
      } else {
        updates.grenades = stats.grenades + R.checkedDefector.grenadeReward;
        text = '【隔离核验】只接收已经验明可用的那部分手榴弹。剩下的没有算进入库数；负责交接的人核完登记，才收回手。';
        logs.push(`手榴弹 +${R.checkedDefector.grenadeReward}`); history('核验接收手榴弹', `实际入库${R.checkedDefector.grenadeReward}枚，消耗隔离材料${plan.materials}份。`, 'good');
      }
    } else if (random() < R.defector.sabotageChance) {
      const old = stats.fortificationLevel['一楼入口'];
      if (old > 0) {
        const before = Math.round(getSectorDefenseProfile(stats, '一楼入口').mitigation * 100);
        updates.fortificationLevel = { ...stats.fortificationLevel, '一楼入口': old - 1 };
        updates.fortificationBuildCounts = { ...stats.fortificationBuildCounts,
          '一楼入口': Math.min(stats.fortificationBuildCounts['一楼入口'] ?? old * 2, (old - 1) * 2 + 1) };
        const after = Math.round(getSectorDefenseProfile({ ...stats, ...updates }, '一楼入口').mitigation * 100);
        text = '【门口爆炸】箱子在入口附近炸开，现成的挡弹工事被撕松。这次事件损失落在工事上，未报告新增人员伤亡。';
        logs.push(`一楼实际减伤 ${before}% → ${after}%`); history('接收点遭破坏', `一楼工事防护降低，实际减伤${before}%降至${after}%。`, 'bad');
      } else {
        const wounded = Math.min(R.defector.fallbackWounded, plan.partySize, stats.soldiers);
        updates.soldiers = stats.soldiers - wounded; updates.wounded = stats.wounded + wounded;
        text = '【入口爆炸】入口没有现成工事替接收人员挡住冲击。飞溅的碎屑割伤了人，同伴先接住拿不稳的东西，再扶他们退到遮蔽处。新增伤员已记入待治人数，没有报成阵亡。';
        logs.push(`新增待治伤员 ${wounded}人`); history('接收点人员受伤', `现成工事为零，实际新增伤员${wounded}人，无本次事件阵亡。`, 'bad');
      }
      visualEffect = 'heavy-damage';
    } else {
      updates.grenades = stats.grenades + R.defector.grenadeReward;
      text = '来人交出箱子。验收后，五十枚手榴弹收入库存；岗哨仍盯着接应区外，没有因为接到东西就把戒备一并收走。';
      logs.push(`手榴弹 +${R.defector.grenadeReward}`); history('接收手榴弹', '实际入库50枚手榴弹。', 'good');
    }
  } else if (eventId === 'wrecked_truck') {
    if (optionIndex === 0) {
      const lost = deaths(1 + Math.floor(random() * R.truck.maxDeaths));
      updates.ammo = stats.ammo + R.truck.ammoReward;
      text = '【抢运归来】弹药箱拖过门槛，木边磨掉了一长条。搬回来的物资先放在通道旁，副官逐个核对出发和回来的人。';
      logs.push(`七九弹 +${R.truck.ammoReward}`, `抢运阵亡: ${lost}人`);
      history('抢运车内弹药', `实际取得2000发七九弹，派出人员阵亡${lost}人。`, 'bad');
    } else { text = '你放下望远镜，决定放弃本次抢运。门边的人回到阵位，弹药仍在外面。有人松了口气，又把脸转开。'; history('放弃本次抢运', '未取得弹药，也未因此派人出发。'); }
  } else if (eventId === 'stray_airdrop') {
    if (optionIndex === 2) {
      text = '你没有派人回收。高处的包和地面的散落物都没有记进入库数，守军仍按原部署留在阵位。';
      history('放弃此次回收', '未取得物资，也未派人冒险。');
    } else if (optionIndex === 1) {
      updates.sandbags = stats.sandbags + R.groundRecovery.materialsReward;
      text = '你选择只收起地面散落的材料。接应的人没有再向高处攀爬，五十份可用材料核实后入库。';
      logs.push(`工事材料 +${R.groundRecovery.materialsReward}`); history('地面回收', '回收50份散落材料，未攀爬。', 'good');
    } else if (random() >= 1 - R.package.successChance) {
      updates.medkits = stats.medkits + R.package.medkitsReward; updates.sandbags = stats.sandbags + R.package.materialsReward; morale(R.package.moraleReward);
      text = '【取回补给包】攀爬的人回到遮蔽里，先把包推给接应者，自己扶着墙蹲下。手指攥得僵硬，好一会儿才伸直；药品与材料核验后入库。';
      logs.push('急救包 +5', '工事材料 +100'); history('取回高处补给', '实际入库5份急救包与100份材料。', 'good');
    } else {
      const lost = deaths(1); morale(-Math.max(0, 5 - lost * 2));
      text = '【坠亡】高处传来一下金属摩擦，攀爬者失去支撑。接应的人冲过去，仍没能救回那条命。未取成的包还挂在上方，这次没有物资入库。';
      logs.push(`意外坠亡: ${lost}人`); history('高处回收失利', `实际阵亡${lost}人，未取得包内物资。`, 'bad');
    }
  } else if (eventId === 'brit_ceasefire') {
    if (optionIndex === 0) {
      updates.medkits = stats.medkits + 5; morale(-5); flag('british_ceasefire_accepted');
      text = '【接受交接安排】药品交到救护处，负责接收的人逐份记下。有人对条件不满，也有人只盯着那几份药。后续炮击倾向按本局的联络规则降低，没有另行限制我方射击。';
      logs.push('急救包 +5'); history('接受南岸联络安排', '取得5份药品；后续炮击倾向降低，此为战役规则抽象，不额外限制我方射击。');
    } else {
      morale(5); flag('british_defied');
      if (stats.enemyOperation) updates.enemyOperation = validEventOperation(stats, stats.enemyOperation, true);
      text = '【拒绝交接条件】你把条件退回联络员面前。屋内有人低低应了一声，随即继续看作战图。'
        + (stats.enemyOperation ? '当前合法侧翼攻势提前1回合，变更后的来袭态势需要重新侦察。' : '眼下没有可核实的攻势，图上没有添出一个目标。')
        + '南侧长期压力按本局规则增加。';
      history('拒绝南岸交接条件', `士气提高；${stats.enemyOperation ? '当前合法侧翼攻势提前1回合，变更后的情报重新核实；' : '没有生成新攻势；'}南侧长期压力增加。`);
    }
  } else if (eventId === 'student_thanks') {
    updates.medkits = stats.medkits + 8; morale(8); flag('student_support_arrived');
    text = '【河对岸的回声】此前接应的学生托人送来药品，包裹外面夹着一句谢意。接收的人把纸角压平，低声说：“替我谢谢他们，这个用得上。”';
    logs.push('急救包 +8'); history('民众支援抵达', '此前建立的支援线送来8份急救物资。', 'good');
  } else if (eventId === 'smuggler_return') {
    flag('smuggler_network_resolved');
    if (optionIndex === 0) {
      updates.machineGunAmmo = stats.machineGunAmmo + R.returnBoat.machineGunAmmoReward;
      text = '【水路接力】三百发七九弹用在掩护上，机枪弹逐箱卸下。接货的人回到库房才敢停，按实际收进来的数量重新报数。';
      logs.push('机枪弹 +1800'); history('水路补给抵达', '以300发七九弹掩护，实际接收1800发机枪弹。', 'good');
    } else { text = '你明确结束这次水路接货。联络员传出消息，小船离开。没有卸货，也没有消耗弹药。'; history('主动结束水路联系', '玩家选择不再接货，保存现有弹药。'); }
  } else if (eventId === 'british_pressure') {
    flag('british_pressure_resolved');
    if (stats.enemyOperation) updates.enemyOperation = revealEnemyOperation(validEventOperation(stats, stats.enemyOperation));
    text = stats.enemyOperation
      ? '【侧翼来袭预警】观察报告与当前受控战线核对过，能确认的来袭资料已标上图。没有再向失守区安排防务，也没有扣除材料。这份预警没有替守军完成施工或调兵。'
      : '【侧翼报告核对】眼下没有可核实的攻势，观察哨没有把猜测画成来袭目标。库存、部署与接敌时间均未改变。';
    history('来袭报告补全', stats.enemyOperation ? '免费确认当前合法攻势，不消耗材料，不再额外压缩接敌时间。' : '当前没有攻势，未生成目标或消耗材料。');
  }
  if (updates.soldiers !== undefined) updates.soldierDistribution = reconcileSoldierDistribution(stats.soldierDistribution, updates.soldiers, stats.location);
  if (updates.morale !== undefined) logs.push(`士气 ${stats.morale} → ${updates.morale}`);
  return { narrative: text + (narrative.length ? '\n' + narrative.join('') : '') + (logs.length ? '\n\n━━━━━━━━━━━━━━\n' + logs.join('\n') : ''),
    updatedStats: updates, eventTriggered: 'none', visualEffect };
};
