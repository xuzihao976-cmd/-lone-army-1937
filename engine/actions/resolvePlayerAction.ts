import { isExecutableLocalAction, normalizeExecutableAction } from '../commandLanguage';
import { getLocalDialogue } from '../localConversation';
import { resolveNaturalCommand } from '../naturalCommands';
import type { GameStats } from '../../types';
import { playSound } from '../../utils/sound';
import { RAID_FAIL_TEXTS, RAID_SUCCESS_TEXTS } from '../../data/text/combat';
import { getRaidSuccessChance, getSearchYieldFactor, getSpeechMoraleGain } from '../actionDynamics';
import { createEnemyOperation, getOperationIntel, revealEnemyOperation } from '../battlefield';
import { addConsequenceFlag, appendCampaignHistory } from '../campaignProgress';
import {
  FORTIFICATION_NAMES,
  findLocations,
  pickWith,
  type RandomSource,
} from '../commandUtils';
import { isMoveCommand } from '../intents';
import { applyNamedSoldierDeaths } from '../roster';
import { getSpecialistEffectFactor } from '../specialists';
import { resolveWarehouseTactic } from '../tacticActions';
import {
  canRecaptureSector,
  getRecaptureStagingSectors,
  getSectorDefenseProfile,
  isApproachExposed,
  isSectorHeld,
} from '../strategicDefense';

export interface PlayerActionResolution {
  updatedStats: Partial<GameStats>;
  logs: string[];
  narrative: string[];
  timeCost: number;
  actionType: string;
  siegeIncrease: number;
  visualEffect?: 'shake' | 'heavy-damage' | 'none';
}

export const resolvePlayerAction = (
  currentStats: GameStats,
  cmd: string,
  random: RandomSource,
): PlayerActionResolution => {
  const tactic = resolveWarehouseTactic(currentStats, cmd);
  if (tactic) {
    if (tactic.timeCost > 0) tactic.updatedStats.fatigue = Math.min(100, currentStats.fatigue + Math.max(1, Math.ceil(tactic.timeCost / 45)));
    return tactic;
  }
  const natural = resolveNaturalCommand(currentStats, cmd);
  if (natural) return natural;
  if (!isExecutableLocalAction(cmd)) {
    const reply=getLocalDialogue(currentStats,cmd,true)!;
    return { updatedStats:{localDialogue:reply.memory}, logs:[], narrative:[reply.text], timeCost:0, actionType:'idle', siegeIncrease:0 };
  }
  cmd=normalizeExecutableAction(cmd);
  const updatedStats: Partial<GameStats> = {};
  const logs: string[] = [];
  const narrative: string[] = [];
  const pick = <T>(items: T[]): T => pickWith(items, random);
  let timeCost = 0;
  let actionType = 'idle';
  let siegeIncrease = 0;
  let visualEffect: PlayerActionResolution['visualEffect'];

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
      narrative.push(`${target}尚未失守，或当前没有相邻防区可以作为反冲锋出发点。`);
    } else if (!donor || assaultForce < 20) {
      actionType = 'recapture_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('反冲锋无法发动：相邻防区至少要能抽调20名步兵。');
    } else {
      timeCost = 60;
      siegeIncrease = 20;
      const ammoUsed = Math.min(800, currentStats.ammo);
      const grenadesUsed = Math.min(40, currentStats.grenades);
      const fireSupport = ammoUsed / 800 * 0.65 + grenadesUsed / 40 * 0.35;
      const bayonetAssault = ammoUsed < 200;
      updatedStats.ammo = currentStats.ammo - ammoUsed;
      updatedStats.grenades = currentStats.grenades - grenadesUsed;

      const assaultEffect = getSpecialistEffectFactor(currentStats, 'assault', donor.location);
      const successChance = Math.min(
        0.85,
        0.22 + currentStats.morale / 300
          + (currentStats.fortificationLevel[donor.location] || 0) * 0.03
          + fireSupport * 0.23
          + 0.12 * assaultEffect,
      );
      const success = random() < successChance;
      const supplyCasualtyPenalty = Math.round((1 - fireSupport) * 7);
      const casualties = success
        ? 2 + Math.floor(random() * 5) + supplyCasualtyPenalty
        : 8 + Math.floor(random() * 11) + supplyCasualtyPenalty;
      const assaultCasualtyReduction = Math.round(2 * assaultEffect);
      const actualCasualties = Math.min(assaultForce, Math.max(0, casualties - assaultCasualtyReduction));
      const distribution = { ...currentStats.soldierDistribution };
      distribution[donor.location] = Math.max(0, donor.soldiers - (success ? assaultForce : actualCasualties));
      if (success) distribution[target] = Math.max(0, assaultForce - actualCasualties);

      updatedStats.soldiers = Math.max(0, currentStats.soldiers - actualCasualties);
      updatedStats.soldierDistribution = distribution;
      applyNamedSoldierDeaths(currentStats, updatedStats, actualCasualties, narrative, random);
      if (ammoUsed > 0 || grenadesUsed > 0) logs.push(`🔻 反冲锋消耗: 七九弹${ammoUsed} / 手榴弹${grenadesUsed}`);
      if (bayonetAssault) logs.push('⚔️ 火力不足：突击队被迫近战夺楼，伤亡风险提高');
      if (assaultEffect > 0) logs.push(`🗡 敢死突击组带队：${Math.round(assaultEffect * 100)}%效能 / 成功率提高 / 伤亡降低`);
      logs.push(`🔴 反冲锋伤亡: ${actualCasualties}人`);

      if (success) {
        actionType = 'recapture_success';
        updatedStats.sectorIntegrity = { ...currentStats.sectorIntegrity, [target]: 30 };
        updatedStats.sealedApproaches = currentStats.sealedApproaches.filter((location) => location !== target);
        updatedStats.morale = Math.min(100, currentStats.morale + 6);
        narrative.push(`【反冲锋成功】${assaultForce}名步兵从${donor.location}出发，夺回${target}。${bayonetAssault ? '火力不足，近战的人一直挤到缺口边才稳住脚。' : '投入的火力为推进争得了空隙。'}重新报数时，幸存者仍在喘气，没人把夺楼叫作轻松。防区恢复到30%完整度，仍需尽快加固。`);
        logs.push(`↗ 夺回${target}: 防区完整度30%`);
        appendCampaignHistory(currentStats, updatedStats, `夺回${target}`, `${actualCasualties}人伤亡后重新建立30%完整度的防线。`, 'good');
      } else {
        actionType = 'recapture_failed';
        updatedStats.morale = Math.max(0, currentStats.morale - 10);
        narrative.push(`【反冲锋受挫】从${donor.location}出发的突击队被敌军交叉火力压回。${target}仍在敌军手中，士气受到沉重打击。`);
        logs.push('💔 反冲锋失败: 士气-10');
      }
    }
  } else if (cmd.includes('封锁') && (cmd.includes('楼梯') || cmd.includes('通道'))) {
    const target = findLocations(cmd).at(-1);
    if (!target || !isApproachExposed(currentStats, target)) {
      actionType = 'seal_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('这里暂时没有暴露在敌军推进路线上的楼梯需要封锁。');
    } else if (currentStats.sealedApproaches.includes(target)) {
      actionType = 'seal_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push(`通往${target}的楼梯已经布置好炸药和障碍物。`);
    } else if (currentStats.sandbags < 150 || currentStats.grenades < 20) {
      actionType = 'seal_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('封锁楼梯需要150份工事材料和20枚手榴弹，当前库存不足。');
    } else {
      actionType = 'seal_approach';
      timeCost = 60;
      siegeIncrease = 15;
      updatedStats.sandbags = currentStats.sandbags - 150;
      updatedStats.grenades = currentStats.grenades - 20;
      updatedStats.sealedApproaches = [...currentStats.sealedApproaches, target];
      narrative.push(`工兵用沙袋、木箱和手榴弹封死通往${target}的楼梯。敌军下一次从这里推进时，进攻规模会被削弱；障碍触发后即会失效。`);
      logs.push(`⛓ 封锁通往${target}的楼梯: 工事材料-150 / 手榴弹-20`);
    }
  } else if (cmd.includes('突袭') || cmd.includes('夜袭') || cmd.includes('偷袭') || cmd.includes('反击') || cmd.includes('进攻')) {
    const currentHour = parseInt(currentStats.currentTime.split(':')[0]);
    if (currentHour >= 0 && currentHour < 5) {
      updatedStats.aggressiveCount = (currentStats.aggressiveCount || 0) + 1;
      timeCost = 60;
      siegeIncrease = 5;
      const reconBonus = Math.max(0, currentStats.reconBonus || 0);
      const success = random() < getRaidSuccessChance(currentStats);
      updatedStats.reconBonus = 0;
      if (success) {
        const died = Math.floor(random() * 6);
        const ammoGain = random() > 0.3 ? Math.floor(random() * 600) : 0;
        const medGain = random() > 0.5 ? Math.floor(random() * 30) : 0;
        updatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
        updatedStats.ammo = currentStats.ammo + ammoGain;
        updatedStats.medkits = currentStats.medkits + medGain;
        applyNamedSoldierDeaths(currentStats, updatedStats, died, narrative, random);
        narrative.push(pick(RAID_SUCCESS_TEXTS));
        if (died > 0) {
          logs.push(`🔴 阵亡: ${died}人`);
          logs.push(`💔 士气 -${died * 2}`);
        }
        if (ammoGain) logs.push(`📦 缴获七九弹 +${ammoGain}`);
        if (medGain) logs.push(`📦 缴获急救包 +${medGain}`);
        updatedStats.morale = Math.max(0, Math.min(100, currentStats.morale + 10 - died * 2));
        logs.push('💪 突袭成功: 士气 +10');
        if (reconBonus > 0) logs.push(`👁 侦察引导生效: 成功率提升${reconBonus}%`);
      } else {
        const died = 10 + Math.floor(random() * 11);
        updatedStats.soldiers = Math.max(0, currentStats.soldiers - died);
        updatedStats.morale = Math.max(0, currentStats.morale - 15 - died * 2);
        applyNamedSoldierDeaths(currentStats, updatedStats, died, narrative, random);
        narrative.push(pick(RAID_FAIL_TEXTS));
        logs.push(`🔴 阵亡: ${died}人`, '💔 突袭惨败: 士气 -15', `💔 伤亡惩罚: 士气 -${died * 2}`);
        visualEffect = 'heavy-damage';
      }
      actionType = 'raid';
    } else {
      narrative.push('副官核对时间：“现在不在夜袭窗口内，不能出发。”仅可在00:00—04:59发起；本次未行动，也未耗时。');
      actionType = 'raid_blocked';
      timeCost = 0;
      siegeIncrease = 0;
    }
  } else if (cmd.includes('搜寻') || cmd.includes('寻找') || cmd.includes('搜')) {
    timeCost = 30;
    actionType = 'scavenge';
    siegeIncrease = 10;
    const exhaustion = Math.max(0, currentStats.searchExhaustion || 0);
    const yieldFactor = getSearchYieldFactor(exhaustion);
    updatedStats.searchExhaustion = Math.min(6, exhaustion + 1);
    const roll = random();
    if (roll < 0.4 * yieldFactor) {
      const gain = Math.max(20, Math.floor((Math.floor(random() * 100) + 50) * yieldFactor));
      updatedStats.ammo = currentStats.ammo + gain;
      narrative.push('箱子已经压扁，七九弹散在裂开的木板之间。搜寻的人一发发捡起，吹掉浮灰，交回库存；没人嫌这点数量少。');
      logs.push(`📦 搜寻获得: 七九弹 +${gain}`);
    } else if (roll < 0.6 * yieldFactor) {
      if (random() > 0.5) {
        updatedStats.medkits = currentStats.medkits + 2;
        narrative.push('角落里找到尚可使用的急救物资。外包的纸已经皱了，打开查看的人却很小心，像怕多扯一下就把这点收获也弄坏。');
        logs.push('📦 搜寻获得: 急救包 +2');
      } else {
        const gain = Math.max(15, Math.floor(50 * yieldFactor));
        updatedStats.sandbags = currentStats.sandbags + gain;
        narrative.push('工兵从杂物间拆出还能用的木料、铁皮和空沙袋。扎手的边角先朝内收好，再一趟趟搬回；修补缺口靠的就是这些零碎。');
        logs.push(`📦 搜寻获得: 工事材料 +${gain}`);
      }
    } else if (roll < 0.9) {
      narrative.push('搜过的箱子再次翻开，底板下面仍是灰。大家在原地停了一会儿，才把散落的东西归拢；这一趟没有可入库的收获。');
    } else {
      updatedStats.morale = Math.max(0, currentStats.morale - 1);
      narrative.push('没有找到能用的东西。有人又探手摸了一遍箱角，指尖刮过木刺，最后空着手站起来。没人说白跑，脸上却藏不住失望。');
      logs.push('💔 徒劳无功: 士气 -1');
    }
    if (exhaustion >= 2) logs.push(`⌛ 仓库已被反复搜索：本次收益降至${Math.round(yieldFactor * 100)}%`);
  } else if (cmd.includes('侦察') || cmd.includes('观察')) {
    timeCost = 15;
    siegeIncrease = 5;
    actionType = 'scout';
    const operation = currentStats.enemyOperation || createEnemyOperation(currentStats, random);
    updatedStats.enemyOperation = revealEnemyOperation(operation);
    updatedStats.reconBonus = Math.min(30, (currentStats.reconBonus || 0) + 20);
    const intel = pick([
      '观察员把镜头放稳，先核对报告中的方向，没有把模糊的人影算作战果。',
      '副官按住纸角，请观察员把看见的路线再说一遍：没有确认的部分先留空。',
      '观察员看得眼眶发酸，放下镜子眨了两次，才继续报出已经核实的情报。',
      '传令兵把记录念回去，让观察员确认。具体目标写进下方报告，猜测没有跟着写进去。',
    ]);
    narrative.push(`你举起望远镜仔细观察敌情。\n\n“团附，看那边。”\n${intel}`);
    narrative.push(`\n\n【敌情确证】${getOperationIntel(updatedStats.enemyOperation)}`);
    logs.push('👁 侦察标记：夜袭加成提高20个百分点，上限30个百分点');
    if (random() < 0.2) {
      if (currentStats.ammo > 0) {
        const roundsUsed = Math.min(3, currentStats.ammo);
        updatedStats.ammo = currentStats.ammo - roundsUsed;
        updatedStats.enemiesKilled = currentStats.enemiesKilled + 1;
        narrative.push('\n\n神枪手等到敌军军官探出掩体才扣下扳机。枪响后，那个人应声倒地，周围日军立刻缩回废墟。');
        logs.push(`💀 狙击战果: 击毙敌军军官1人 / 七九弹-${roundsUsed}`);
      } else {
        narrative.push('\n\n望远镜里出现了一个极好的射击目标，可七九弹已经耗尽。神枪手只能记下敌军军官的位置，等待下一次机会。');
        logs.push('⚠ 发现高价值目标，但无七九弹可供射击');
      }
    }
  } else if (cmd.includes('调派30人') || cmd.includes('增援30人')) {
    const locations = findLocations(cmd);
    const source = locations[0];
    const target = locations[1];
    const distribution = { ...currentStats.soldierDistribution };
    if (!source || !target || source === target) {
      actionType = 'redeploy_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('副官没有看懂调兵路线。请从战略地图选择目标区域。');
    } else if (!isSectorHeld(currentStats, source) || !isSectorHeld(currentStats, target)) {
      actionType = 'redeploy_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('失守防区无法直接调兵，必须先组织反冲锋夺回。');
    } else {
      const transfer = Math.min(30, Math.max(0, (distribution[source] || 0) - 20));
      if (transfer <= 0) {
        actionType = 'redeploy_fail';
        timeCost = 0;
        siegeIncrease = 0;
        narrative.push(`${source}的守军已经低于安全线，无法继续抽调。`);
      } else {
        actionType = 'redeploy';
        timeCost = 30;
        siegeIncrease = 8;
        distribution[source] = Math.max(0, (distribution[source] || 0) - transfer);
        distribution[target] = (distribution[target] || 0) + transfer;
        updatedStats.soldierDistribution = distribution;
        narrative.push(`你命令传令兵带队穿过仓库内部通道，将${transfer}名步兵从${source}调往${target}。兵力已按新分布登记。`);
        logs.push(`↔ 调兵: ${source} → ${target} (${transfer}人)`);
      }
    }
  } else if (cmd.includes('部署机枪') && cmd.includes('至')) {
    const target = findLocations(cmd).at(-1);
    const squads = [...currentStats.hmgSquads];
    const index = squads.findIndex((squad) => cmd.includes(squad.name));
    const squad = index >= 0 ? squads[index] : undefined;
    if (!target || !squad || squad.status !== 'active' || squad.location === target || !isSectorHeld(currentStats, target)) {
      actionType = 'hmg_redeploy_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('机枪部署命令无法执行：请确认机枪组仍可作战，且目标阵位不同。');
    } else {
      actionType = 'hmg_redeploy';
      timeCost = 20;
      siegeIncrease = 6;
      const previousLocation = squad.location;
      squads[index] = { ...squad, location: target };
      updatedStats.hmgSquads = squads;
      narrative.push(`${squad.name}收拢枪架，分担枪身与弹箱，从${previousLocation}转移到${target}。搬枪的人腾不出手擦汗，只抬了一下肩。机枪组仅支援实际所在的防区。`);
      logs.push(`♜ ${squad.name}: ${previousLocation} → ${target}`);
    }
  } else if (cmd.includes('部署小队') && cmd.includes('至')) {
    const target = findLocations(cmd).at(-1);
    const squads = [...currentStats.specialistSquads];
    const index = squads.findIndex((squad) => cmd.includes(squad.name));
    const squad = index >= 0 ? squads[index] : undefined;
    if (!target || !squad || squad.status !== 'active' || squad.location === target || !isSectorHeld(currentStats, target)) {
      actionType = 'specialist_redeploy_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('小队部署命令无法执行：请确认目标防区仍由我军控制。');
    } else {
      actionType = 'specialist_redeploy';
      timeCost = 20;
      siegeIncrease = 6;
      const previousLocation = squad.location;
      squads[index] = { ...squad, location: target };
      updatedStats.specialistSquads = squads;
      narrative.push(`${squad.name}从${previousLocation}转移到${target}。他们的专长只会在当前防区生效。`);
      logs.push(`◆ ${squad.name}: ${previousLocation} → ${target}`);
    }
  } else if (cmd.includes('补给') || (cmd.includes('物资') && !cmd.includes('整理'))) {
    narrative.push('通讯兵核对回报：“眼下没有可直接调用的外部补给。”他没有替可能出现的支援作保证。本次请求未增加物资，也未耗时；可搜寻库存或处理实际出现的补给事件。');
    actionType = 'supply_blocked';
    timeCost = 0;
    siegeIncrease = 0;
  } else if (isMoveCommand(cmd)) {
    const target = cmd.includes('顶') ? '屋顶'
      : cmd.includes('二楼') ? '二楼阵地'
        : cmd.includes('一楼') ? '一楼入口'
          : cmd.includes('地下') ? '地下室'
            : null;
    if (!target || !isSectorHeld(currentStats, target)) {
      timeCost = 0;
      siegeIncrease = 0;
      actionType = 'move_blocked';
      narrative.push('该防区已经失守，指挥官不能直接进入。请先组织反冲锋夺回。');
    } else {
      timeCost = 15;
      actionType = 'move';
      siegeIncrease = 5;
      updatedStats.location = target;
      playSound('click');
    }
  } else if (cmd.includes('加固') || cmd.includes('修') || cmd.includes('工事')) {
    let target = currentStats.location;
    if (cmd.includes('一楼')) target = '一楼入口';
    else if (cmd.includes('二楼')) target = '二楼阵地';
    else if (cmd.includes('屋顶')) target = '屋顶';
    else if (cmd.includes('地下')) target = '地下室';
    const currentLevel = currentStats.fortificationLevel[target] || 0;
    const currentIntegrity = currentStats.sectorIntegrity[target] ?? 100;
    if (!isSectorHeld(currentStats, target)) {
      actionType = 'build_lost';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push(`${target}仍在敌军控制下，工兵无法进入施工。必须先夺回防区。`);
    } else if (currentLevel >= 3 && currentIntegrity >= 100) {
      actionType = 'build_max';
      timeCost = 0;
      siegeIncrease = 0;
    } else {
      const engineerEffect = getSpecialistEffectFactor(currentStats, 'engineer', target);
      const materialDiscount = Math.round(30 * engineerEffect);
      const integrityBonus = Math.round(6 * engineerEffect);
      const materialCost = 200 - materialDiscount;
      const integrityGain = 18 + integrityBonus;
      if (currentStats.sandbags < materialCost) {
        actionType = 'fail';
        timeCost = 0;
        siegeIncrease = 0;
        narrative.push(`工兵检查库存后摇头：“团附，工事材料不足，至少需要${materialCost}份。”`);
      } else {
        timeCost = 120;
        actionType = 'build';
        siegeIncrease = 15;
        const newCount = (currentStats.fortificationBuildCounts[target] || 0) + 1;
        const newLevel = Math.min(3, Math.floor(newCount / 2));
        const newIntegrity = Math.min(100, currentIntegrity + integrityGain);
        const mitigationBefore = Math.round(getSectorDefenseProfile(currentStats, target).mitigation * 100);
        updatedStats.sandbags = currentStats.sandbags - materialCost;
        updatedStats.fortificationBuildCounts = { ...currentStats.fortificationBuildCounts, [target]: newCount };
        updatedStats.fortificationLevel = { ...currentStats.fortificationLevel, [target]: newLevel };
        updatedStats.sectorIntegrity = { ...currentStats.sectorIntegrity, [target]: newIntegrity };
        const stateAfterBuild: GameStats = { ...currentStats, ...updatedStats };
        const mitigationAfter = Math.round(getSectorDefenseProfile(stateAfterBuild, target).mitigation * 100);
        if (currentStats.health < 100) {
          updatedStats.health = Math.min(100, currentStats.health + 4);
          logs.push(`🏥 抢修承重结构: ${currentStats.health}% → ${updatedStats.health}%`);
        }
        if (random() < 0.3) {
          const moraleLoss = Math.floor(random() * 6);
          if (moraleLoss > 0) {
            updatedStats.morale = Math.max(currentStats.minMorale || 0, currentStats.morale - moraleLoss);
            logs.push(`💔 劳累: 士气 -${moraleLoss}`);
          }
        }
        logs.push(`🧱 工事材料 -${materialCost}${engineerEffect > 0 ? `（工兵组${Math.round(engineerEffect * 100)}%效能，节省${materialDiscount}）` : ''}`);
        logs.push(`🏢 ${target}完整度: ${currentIntegrity}% → ${newIntegrity}%`);
        logs.push(mitigationAfter !== mitigationBefore
          ? `🛡 ${FORTIFICATION_NAMES[newLevel]}: 实际减伤 ${mitigationBefore}% → ${mitigationAfter}%`
          : newLevel >= 3
            ? '🔨 堡垒化阵地完成修补，实际减伤保持不变'
            : `🔨 ${FORTIFICATION_NAMES[newLevel]}继续加厚，下一次施工将强化防护`);
      }
    }
  } else if (cmd.includes('休息') || cmd.includes('睡') || cmd.includes('整顿')) {
    timeCost = 120;
    actionType = 'rest';
    siegeIncrease = 35;
    updatedStats.morale = Math.min(100, currentStats.morale + 10);
    updatedStats.health = Math.min(100, currentStats.health + 5);
    updatedStats.lastRestTurn = currentStats.turnCount + 1;
    updatedStats.fatigue = Math.max(0, currentStats.fatigue - 35);
    updatedStats.speechStreak = 0;
    logs.push('💤 士气 +10', `🛏 疲劳 ${currentStats.fatigue}% → ${updatedStats.fatigue}%`);
    if (updatedStats.health !== currentStats.health) logs.push(`🏥 总结构: ${currentStats.health}% → ${updatedStats.health}%`);
  } else if (cmd.includes('治疗') || cmd.includes('抢救') || cmd.includes('救') || cmd.includes('医')) {
    timeCost = 60;
    const wounded = currentStats.wounded || 0;
    if (!isSectorHeld(currentStats, '地下室')) {
      actionType = 'heal_fail';
      timeCost = 0;
      siegeIncrease = 0;
      narrative.push('地下室医院已经失守，伤员无法接受成体系救治。必须先夺回地下室。');
    } else if (wounded > 0 && currentStats.medkits > 0) {
      actionType = 'heal';
      siegeIncrease = 10;
      const medicEffect = getSpecialistEffectFactor(currentStats, 'medic', '地下室');
      const medicBonus = Math.round(2 * medicEffect);
      const actualHeal = Math.min(wounded, currentStats.medkits, Math.floor(random() * 4) + 2 + medicBonus);
      if (actualHeal > 0) {
        updatedStats.medkits = currentStats.medkits - actualHeal;
        updatedStats.wounded = wounded - actualHeal;
        updatedStats.soldiers = currentStats.soldiers + actualHeal;
        updatedStats.morale = Math.min(100, currentStats.morale + actualHeal * 2);
        updatedStats.woundedTimer = Math.max(0, (currentStats.woundedTimer || 0) - actualHeal * 90);
        logs.push(`🩹 消耗急救包: ${actualHeal}`, `💚 治愈伤员: ${actualHeal}人`);
        if (medicEffect > 0) logs.push(`✚ 战地救护组：${Math.round(medicEffect * 100)}%效能，本次额外救回${medicBonus}人上限`);
        logs.push(`💪 士气 +${actualHeal * 2}`);
      } else {
        narrative.push('军医尽力了，但条件太差，这次没能让伤员恢复战斗力。');
      }
    } else {
      actionType = 'heal_fail';
      timeCost = 0;
      siegeIncrease = 0;
    }
  } else if (cmd.includes('升旗')) {
    if (!isSectorHeld(currentStats, '屋顶')) {
      narrative.push('屋顶已经失守，国旗无法升起。必须先夺回屋顶阵地。');
      actionType = 'flag_blocked';
      timeCost = 0;
      siegeIncrease = 0;
    } else if (!currentStats.hasFlagRaised && currentStats.location === '屋顶') {
      if (!currentStats.flagWarned) {
        timeCost = 0;
        siegeIncrease = 0;
        updatedStats.flagWarned = true;
        actionType = 'flag_warn';
      } else {
        timeCost = 30;
        actionType = 'flag_success';
        siegeIncrease = 50;
        updatedStats.hasFlagRaised = true;
        updatedStats.consequenceFlags = addConsequenceFlag(currentStats.consequenceFlags, 'roof_flag_beacon');
        updatedStats.morale = Math.min(100, currentStats.morale + 30);
        updatedStats.minMorale = 30;
        logs.push('💪 士气 +30');
        appendCampaignHistory(currentStats, updatedStats, '屋顶升旗', '全军士气大振，但屋顶成为敌军航空兵的优先目标。', 'neutral');
      }
    } else if (!currentStats.hasFlagRaised) {
      narrative.push('副官：‘长官，升旗必须去【屋顶】！’');
      actionType = 'flag_blocked';
      timeCost = 0;
      siegeIncrease = 0;
    } else {
      narrative.push('青天白日满地红已经在楼顶飘扬了。');
      actionType = 'flag_already';
      timeCost = 0;
      siegeIncrease = 0;
    }
  } else if (['演讲', '训话', '鼓舞', '动员', '坚持', '顶住', '拼了', '万岁'].some((word) => cmd.includes(word))) {
    timeCost = 60;
    actionType = 'speech';
    siegeIncrease = 10;
    const recentBattle = currentStats.turnCount - currentStats.lastAttackTurn <= 2;
    const streak = currentStats.speechStreak || 0;
    const gain = getSpeechMoraleGain(currentStats);
    updatedStats.morale = Math.min(100, currentStats.morale + gain);
    updatedStats.speechStreak = streak + 1;
    logs.push(`💪 士气 +${gain}${recentBattle ? '（战后动员）' : ''}`);
    if (streak > 0) logs.push('⌛ 连续演讲效果递减，休整后恢复');
  }

  if (actionType === 'idle') {
    const reply=getLocalDialogue(currentStats,cmd,true)!;
    narrative.push(reply.text); updatedStats.localDialogue=reply.memory;
    timeCost = 0;
    siegeIncrease = 0;
  }
  if (timeCost > 0 && actionType !== 'rest') {
    const fatigueGain = Math.max(1, Math.ceil(timeCost / 45))
      + (actionType === 'raid' || actionType.startsWith('recapture') ? 4 : 0);
    updatedStats.fatigue = Math.min(100, (updatedStats.fatigue ?? currentStats.fatigue) + fatigueGain);
    if (actionType !== 'speech') updatedStats.speechStreak = 0;
  }

  const settlementLogs = logs.filter((line) => !line.includes('士气'));
  if (typeof updatedStats.morale === 'number') settlementLogs.push(`💪 行动士气 ${currentStats.morale} → ${updatedStats.morale}`);
  return { updatedStats, logs: settlementLogs, narrative, timeCost, actionType, siegeIncrease, visualEffect };
};
