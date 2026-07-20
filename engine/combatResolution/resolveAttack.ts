import type { EnemyOperation, GameStats, Location } from '../../types';
import { playSound } from '../../utils/sound';
import { ATTACK_TEXTS, BAYONET_FIGHT_TEXTS, FORT_DAMAGE_SCENES } from '../../data/text/combat';
import { getFatigueCasualtyFactor } from '../actionDynamics';
import { createEnemyOperation } from '../battlefield';
import { addConsequenceFlag, appendCampaignHistory } from '../campaignProgress';
import { calculateCombatOutcomes, type AttackScale, type DamageType } from '../combat';
import { pickWith, type RandomSource } from '../commandUtils';
import { calculateCampaignScore } from '../endings/campaignScore';
import { applyNamedSoldierDeaths } from '../roster';
import { getSpecialistEffectFactor } from '../specialists';
import {
  calculateCommanderDeathRisk,
  formatCommanderRisk,
  getGroundAttackTargets,
  getRetreatDestination,
  getSectorDefenseProfile,
  isSectorHeld,
} from '../strategicDefense';

type TurnEvent = 'attack' | 'new_day' | 'none' | 'game_over' | 'victory';
type VisualEffect = 'shake' | 'heavy-damage' | 'none';

interface ResolveAttackInput {
  currentStats: GameStats;
  calculatedStats: Partial<GameStats>;
  strategicStateAfterAction: GameStats;
  contactOperation: EnemyOperation;
  attackScale: AttackScale;
  damageType: DamageType;
  narrativeParts: string[];
  statsLog: string[];
  random: RandomSource;
}

interface ResolveAttackResult {
  eventTriggered: TurnEvent;
  visualEffect: VisualEffect;
  attackLocation: Location;
}

/** Resolve one confirmed enemy contact and mutate the turn's pending stats. */
export const resolveAttack = ({
  currentStats,
  calculatedStats,
  strategicStateAfterAction,
  contactOperation,
  attackScale: initialAttackScale,
  damageType,
  narrativeParts,
  statsLog,
  random,
}: ResolveAttackInput): ResolveAttackResult => {
  const pick = <T>(items: T[]): T => pickWith(items, random);
  let eventTriggered: TurnEvent = 'attack';
  let visualEffect: VisualEffect = 'shake';
  let attackScale = initialAttackScale;
  let attackLocation: Location;

  playSound('explosion');

  let ammoCheckSquads = [...(calculatedStats.hmgSquads || currentStats.hmgSquads)];
  const currentAmmo = calculatedStats.ammo ?? currentStats.ammo;
  const currentMgAmmo = calculatedStats.machineGunAmmo ?? currentStats.machineGunAmmo;
  const currentGrenades = calculatedStats.grenades ?? currentStats.grenades;
  let currentMorale = calculatedStats.morale ?? currentStats.morale;

  if (damageType === 'BOMBING') {
    narrativeParts.push('\n\n' + pick(ATTACK_TEXTS.BOMBING));
    attackLocation = isSectorHeld(strategicStateAfterAction, contactOperation.target)
      ? contactOperation.target
      : (['屋顶', '二楼阵地', '一楼入口', '地下室'] as Location[])
        .find((location) => isSectorHeld(strategicStateAfterAction, location)) ?? strategicStateAfterAction.location;
  } else if (damageType === 'ARTILLERY') {
    narrativeParts.push('\n\n' + pick(ATTACK_TEXTS.ARTILLERY));
    const artilleryTargets = (['一楼入口', '二楼阵地'] as Location[])
      .filter((location) => isSectorHeld(strategicStateAfterAction, location));
    const fallbackTargets = getGroundAttackTargets(strategicStateAfterAction);
    const candidates = artilleryTargets.length > 0 ? artilleryTargets : fallbackTargets;
    attackLocation = candidates.includes(contactOperation.target)
      ? contactOperation.target
      : candidates[0] ?? strategicStateAfterAction.location;
  } else {
    const groundTargets = getGroundAttackTargets(strategicStateAfterAction);
    attackLocation = groundTargets.includes(contactOperation.target)
      ? contactOperation.target
      : groundTargets[0] ?? strategicStateAfterAction.location;
    if (attackScale === 'LARGE') narrativeParts.push('\n\n【日军总攻】鬼子发疯了！满山遍野的黄皮狗涌了上来！');
    else if (attackScale === 'MEDIUM') narrativeParts.push(`\n\n【日军强攻】日军组织了一个中队的兵力，沿突破口向${attackLocation}强行推进。`);
    else narrativeParts.push('\n\n' + pick(ATTACK_TEXTS.INFANTRY));
  }

  let barrierKills = 0;
  let sealedBarrierTriggered = false;
  const activeSeals = calculatedStats.sealedApproaches ?? strategicStateAfterAction.sealedApproaches;
  if (damageType === 'INFANTRY' && activeSeals.includes(attackLocation)) {
    sealedBarrierTriggered = true;
    attackScale = attackScale === 'LARGE' ? 'MEDIUM' : 'SMALL';
    barrierKills = 5 + Math.floor(random() * 8);
    calculatedStats.sealedApproaches = activeSeals.filter((location) => location !== attackLocation);
    narrativeParts.push(`\n\n【楼梯封锁触发】通往${attackLocation}的障碍物和预埋手榴弹同时爆炸，敌军进攻队形被截断，本次攻势规模下降。`);
    statsLog.push(`⛓ 楼梯封锁生效: 额外毙敌${barrierKills}人 / 障碍已耗尽`);
  }

  const defenseProfile = getSectorDefenseProfile(strategicStateAfterAction, attackLocation);
  const currentDistribution = strategicStateAfterAction.soldierDistribution;
  const targetFort = defenseProfile.localFortLevel;
  const targetGarrison = defenseProfile.garrison;
  const activeSquadsCount = defenseProfile.activeHmgSquads;
  const fireReadySquadsCount = defenseProfile.fireReadyHmgSquads;

  const outcome = calculateCombatOutcomes({
    attackScale,
    effectiveFortLevel: defenseProfile.effectiveFortLevel,
    fireReadyHmgSquads: fireReadySquadsCount,
    garrisonStrength: targetGarrison,
    morale: currentMorale,
    damageType,
    supply: {
      rifleAmmo: currentAmmo,
      machineGunAmmo: currentMgAmmo,
      grenades: currentGrenades,
    },
  }, random);
  const sectorIntegrityAtContact = strategicStateAfterAction.sectorIntegrity[attackLocation] ?? 100;
  const mitigationAtContact = Math.round(defenseProfile.mitigation * 100);
  statsLog.push(`🛡️ ${attackLocation}: 驻军${targetGarrison}人 / 实际减伤${mitigationAtContact}% / 完整度${sectorIntegrityAtContact}%`);

  if (outcome.closeCombat) {
    const eligibleBayonetScenes = BAYONET_FIGHT_TEXTS.filter((scene) =>
      (currentGrenades > 0 || (!scene.includes('手榴弹') && !scene.includes('光荣弹') && !scene.includes('炸药包')))
      && (activeSquadsCount > 0 || !scene.includes('机枪')));
    narrativeParts.push(currentAmmo <= 0
      ? '\n\n' + pick(eligibleBayonetScenes.length > 0 ? eligibleBayonetScenes : BAYONET_FIGHT_TEXTS)
      : '\n\n【弹药见底】零星枪声很快沉寂，日军已经冲进掩体。守军被迫上刺刀，在楼梯和破墙间展开白刃战。');
    statsLog.push(currentAmmo <= 0
      ? '⚔️ 七九弹耗尽且本层无可用机枪：转入刺刀见血的白刃防守'
      : `⚔️ 七九弹仅余${currentAmmo}发，无法维持火力：转入白刃防守`);
  } else if (currentAmmo <= 0 && damageType === 'INFANTRY') {
    statsLog.push(`⚠️ 七九弹耗尽：本层仅靠${fireReadySquadsCount > 0 ? '重机枪与手榴弹' : '手榴弹'}支撑`);
  }

  if (outcome.attackScale === 'LARGE' || damageType === 'BOMBING') visualEffect = 'heavy-damage';

  calculatedStats.ammo = currentAmmo - outcome.rifleAmmoUsed;
  calculatedStats.machineGunAmmo = currentMgAmmo - outcome.machineGunAmmoUsed;
  calculatedStats.grenades = currentGrenades - outcome.grenadesUsed;
  if (outcome.rifleAmmoUsed > 0) statsLog.push(`🔻 消耗七九弹: ${outcome.rifleAmmoUsed}`);
  if (outcome.machineGunAmmoUsed > 0) statsLog.push(`🔻 消耗机枪弹: ${outcome.machineGunAmmoUsed}`);
  if (outcome.grenadesUsed > 0) statsLog.push(`🔻 消耗手榴弹: ${outcome.grenadesUsed}`);
  const killBreakdown = [
    outcome.rifleKills > 0 ? `步枪${outcome.rifleKills}` : '',
    outcome.machineGunKills > 0 ? `机枪${outcome.machineGunKills}` : '',
    outcome.grenadeKills > 0 ? `手榴弹${outcome.grenadeKills}` : '',
    outcome.closeCombatKills > 0 ? `白刃${outcome.closeCombatKills}` : '',
  ].filter(Boolean).join(' / ');
  if (killBreakdown) statsLog.push(`🔥 杀伤来源: ${killBreakdown}`);

  const currentHealthy = calculatedStats.soldiers ?? currentStats.soldiers;
  const currentWounded = calculatedStats.wounded ?? currentStats.wounded;
  const veteranEffect = getSpecialistEffectFactor(strategicStateAfterAction, 'veteran', attackLocation);
  const fatigueAtContact = calculatedStats.fatigue ?? currentStats.fatigue;
  const veteranCasualtyReduction = 0.15 * veteranEffect;
  const casualtyFactor = (1 - veteranCasualtyReduction) * getFatigueCasualtyFactor(fatigueAtContact);
  let totalDamage = Math.max(0, Math.ceil(outcome.casualtyCount * casualtyFactor));
  if (veteranEffect > 0) statsLog.push(`◆ 湖北老兵班稳住火线：${Math.round(veteranEffect * 100)}%效能，本层伤亡降低${Math.round(veteranCasualtyReduction * 100)}%`);
  if (fatigueAtContact >= 55) statsLog.push(`⚠ 守军疲劳${fatigueAtContact}%：战斗伤亡上升`);
  let deaths = 0;
  let injuries = 0;
  let woundedDeaths = 0;
  let healthyDeaths = 0;
  const exposedHealthy = Math.min(currentHealthy, targetGarrison);

  if (totalDamage > 0) {
    const woundedExposureRate = attackLocation === '地下室' ? 0.25 : damageType === 'BOMBING' ? 0.1 : 0;
    woundedDeaths = Math.min(currentWounded, Math.ceil(totalDamage * woundedExposureRate));
    deaths += woundedDeaths;
    totalDamage -= woundedDeaths;
    if (totalDamage > 0) {
      healthyDeaths = Math.min(exposedHealthy, Math.floor(totalDamage * 0.4));
      const healthyInjuries = Math.min(exposedHealthy - healthyDeaths, totalDamage - healthyDeaths);
      deaths += healthyDeaths;
      injuries += healthyInjuries;
    }
  }

  calculatedStats.wounded = Math.max(0, currentWounded - woundedDeaths + injuries);
  calculatedStats.soldiers = Math.max(0, currentHealthy - healthyDeaths - injuries);

  if (activeSquadsCount > 0 && (attackScale === 'LARGE' || damageType !== 'INFANTRY') && random() < 0.3) {
    const targetIdx = ammoCheckSquads.findIndex((squad) => squad.status === 'active' && squad.location === attackLocation);
    if (targetIdx !== -1) {
      const destroyedSquad = ammoCheckSquads[targetIdx];
      const crewDeaths = Math.min(5, destroyedSquad.count);
      const survivingCrew = Math.max(0, destroyedSquad.count - crewDeaths);
      ammoCheckSquads[targetIdx] = { ...destroyedSquad, status: 'destroyed', count: 0 };
      statsLog.push(`🔴 ${ammoCheckSquads[targetIdx].name}被毁!`);
      currentMorale = Math.max(0, currentMorale - 15);
      statsLog.push('💔 重火力折损: 士气 -15');
      deaths += crewDeaths;
      if (survivingCrew > 0) {
        calculatedStats.soldiers = (calculatedStats.soldiers ?? currentStats.soldiers) + survivingCrew;
        const distributionAfterLoss = calculatedStats.soldierDistribution || currentStats.soldierDistribution;
        calculatedStats.soldierDistribution = {
          ...distributionAfterLoss,
          [attackLocation]: (distributionAfterLoss[attackLocation] || 0) + survivingCrew,
        };
        statsLog.push(`↪ ${survivingCrew}名幸存机枪手转为步兵`);
      }
    }
    calculatedStats.hmgSquads = ammoCheckSquads;
  }

  let structureDmg = (attackScale === 'LARGE' ? 10 : 2) + (damageType === 'BOMBING' ? 15 : 0);
  structureDmg = Math.max(1, structureDmg - Math.floor(targetFort * 2));
  if (targetGarrison < 30) structureDmg += 4;
  const structureBefore = calculatedStats.health ?? currentStats.health;
  const structureAfter = Math.max(0, structureBefore - structureDmg);
  calculatedStats.health = structureAfter;
  statsLog.push(`🏚 总结构: ${structureBefore}% → ${structureAfter}%`);

  const baseSectorDamage = attackScale === 'LARGE' ? 42 : attackScale === 'MEDIUM' ? 24 : 10;
  const typeSectorDamage = damageType === 'BOMBING' ? 12 : damageType === 'ARTILLERY' ? 6 : 0;
  let sectorDamage = Math.max(3, baseSectorDamage + typeSectorDamage - targetFort * 4 - Math.min(6, Math.floor(targetGarrison / 30)));
  if (targetGarrison < 30) sectorDamage += 8;
  if (structureAfter <= 0) sectorDamage += 6;
  if (sealedBarrierTriggered) sectorDamage = Math.max(2, Math.floor(sectorDamage * 0.6));

  const sectorIntegrityBefore = strategicStateAfterAction.sectorIntegrity[attackLocation] ?? 100;
  const sectorIntegrityAfter = Math.max(0, sectorIntegrityBefore - sectorDamage);
  calculatedStats.sectorIntegrity = {
    ...(calculatedStats.sectorIntegrity || strategicStateAfterAction.sectorIntegrity),
    [attackLocation]: sectorIntegrityAfter,
  };
  statsLog.push(`🏢 ${attackLocation}完整度: ${sectorIntegrityBefore}% → ${sectorIntegrityAfter}%`);

  const commanderLocationAtContact = calculatedStats.location ?? currentStats.location;
  const sectorLostThisAttack = sectorIntegrityBefore > 0 && sectorIntegrityAfter <= 0;
  if (sectorLostThisAttack) {
    const sealsAtLoss = calculatedStats.sealedApproaches ?? strategicStateAfterAction.sealedApproaches;
    calculatedStats.sealedApproaches = sealsAtLoss.filter((location) => location !== attackLocation);
    const stateAtLoss: GameStats = {
      ...strategicStateAfterAction,
      ...calculatedStats,
      sectorIntegrity: calculatedStats.sectorIntegrity,
      soldierDistribution: calculatedStats.soldierDistribution || currentDistribution,
      hmgSquads: ammoCheckSquads,
    };
    const retreatDestination = getRetreatDestination(stateAtLoss, attackLocation);
    const distributionAfterCombat = { ...(calculatedStats.soldierDistribution || currentDistribution) };
    const retreatingRiflemen = Math.max(0, (distributionAfterCombat[attackLocation] || 0) - healthyDeaths - injuries);
    distributionAfterCombat[attackLocation] = 0;
    if (retreatDestination) {
      distributionAfterCombat[retreatDestination] = (distributionAfterCombat[retreatDestination] || 0) + retreatingRiflemen;
    } else if (retreatingRiflemen > 0) {
      calculatedStats.soldiers = Math.max(0, (calculatedStats.soldiers ?? currentStats.soldiers) - retreatingRiflemen);
      statsLog.push(`⚠ ${retreatingRiflemen}名守军被切断，失散或被俘`);
    }
    calculatedStats.soldierDistribution = distributionAfterCombat;

    const evacuationChance = Math.min(0.9, 0.55 + targetFort * 0.05 + (commanderLocationAtContact === attackLocation ? 0.15 : 0));
    ammoCheckSquads = ammoCheckSquads.map((squad) => {
      if (squad.status !== 'active' || squad.location !== attackLocation) return squad;
      if (retreatDestination && random() < evacuationChance) {
        statsLog.push(`♜ ${squad.name}抢救成功，后撤至${retreatDestination}`);
        return { ...squad, location: retreatDestination };
      }
      const crewDeaths = Math.min(squad.count, 8 + Math.floor(random() * 8));
      const survivingCrew = Math.max(0, squad.count - crewDeaths);
      deaths += crewDeaths;
      if (retreatDestination && survivingCrew > 0) {
        calculatedStats.soldiers = (calculatedStats.soldiers ?? currentStats.soldiers) + survivingCrew;
        distributionAfterCombat[retreatDestination] = (distributionAfterCombat[retreatDestination] || 0) + survivingCrew;
        statsLog.push(`🔴 ${squad.name}重机枪被弃置，${survivingCrew}名幸存机枪手转为步兵`);
      } else {
        statsLog.push(`🔴 ${squad.name}被敌军截断，整组失联`);
      }
      return { ...squad, status: 'destroyed', count: 0 };
    });
    calculatedStats.hmgSquads = ammoCheckSquads;
    calculatedStats.soldierDistribution = distributionAfterCombat;
    calculatedStats.specialistSquads = (calculatedStats.specialistSquads || currentStats.specialistSquads).map((squad) => {
      if (squad.status !== 'active' || squad.location !== attackLocation) return squad;
      if (retreatDestination) {
        statsLog.push(`◆ ${squad.name}后撤至${retreatDestination}`);
        return { ...squad, location: retreatDestination };
      }
      statsLog.push(`◆ ${squad.name}被切断，失去专长作用`);
      return { ...squad, status: 'depleted' };
    });

    if (commanderLocationAtContact === attackLocation && retreatDestination) {
      calculatedStats.location = retreatDestination;
      statsLog.push(`🎖 指挥部紧急后撤至${retreatDestination}`);
    }
    if (attackLocation === '屋顶' && (calculatedStats.hasFlagRaised ?? currentStats.hasFlagRaised)) {
      calculatedStats.hasFlagRaised = false;
      narrativeParts.push('\n屋顶被突破，旗杆在爆炸中折断，国旗由敢死队抢下带走。');
      statsLog.push('⚑ 屋顶失守: 国旗撤下');
    }
    if (attackLocation === '地下室') {
      const woundedAtLoss = calculatedStats.wounded ?? currentStats.wounded;
      const hospitalDeaths = Math.min(woundedAtLoss, Math.ceil(woundedAtLoss * 0.25));
      calculatedStats.wounded = Math.max(0, woundedAtLoss - hospitalDeaths);
      calculatedStats.medkits = Math.floor((calculatedStats.medkits ?? currentStats.medkits) * 0.75);
      calculatedStats.ammo = Math.floor((calculatedStats.ammo ?? currentStats.ammo) * 0.9);
      deaths += hospitalDeaths;
      calculatedStats.consequenceFlags = addConsequenceFlag(calculatedStats.consequenceFlags || currentStats.consequenceFlags, 'hospital_lost');
      statsLog.push(`⚕ 地下室医院失守: 重伤员死亡${hospitalDeaths}人 / 药品与弹药部分丢失`);
    }

    calculatedStats.health = Math.max(0, (calculatedStats.health ?? currentStats.health) - 8);
    currentMorale = Math.max(0, currentMorale - 12);
    narrativeParts.push(`\n\n【防区失守：${attackLocation}】\n敌军突破最后一道掩体。${retreatDestination ? `残余守军沿内部通道撤往${retreatDestination}。` : '所有退路均被切断，防线已经被分割。'}从现在起，敌军会沿新的突破口继续向仓库纵深推进。`);
    statsLog.push(`▼ ${attackLocation}失守: 总结构额外-8 / 士气-12`);
    appendCampaignHistory(currentStats, calculatedStats, `${attackLocation}失守`, `${retreatingRiflemen}名残余守军${retreatDestination ? `撤往${retreatDestination}` : '被切断'}。`, 'bad');
  }

  if (commanderLocationAtContact === attackLocation) {
    const commanderRisk = calculateCommanderDeathRisk(strategicStateAfterAction, attackLocation);
    const commanderKilled = random() < commanderRisk;
    statsLog.push(`🎖 指挥官处于交战区: 阵亡风险${formatCommanderRisk(commanderRisk)}${commanderKilled ? '（判定命中）' : '（幸存）'}`);
    if (commanderKilled) {
      calculatedStats.isGameOver = true;
      calculatedStats.gameResult = 'defeat_commander';
      calculatedStats.gameOverReason = 'commander_killed';
      calculatedStats.finalRank = calculateCampaignScore({ ...currentStats, ...calculatedStats }, 'defeat_commander').rank;
      eventTriggered = 'game_over';
      visualEffect = 'heavy-damage';
      narrativeParts.push(`\n\n【将星陨落】\n一发炮弹击穿${attackLocation}的指挥掩体。副官扑过来时，你已经倒在碎砖和硝烟之中。部队尚未死光，但失去最高指挥后，各防区通信迅速中断，成建制防守无法继续。\n\n结局达成：【阵前殉职】`);
    }
  }

  const integrityAfterCombat = calculatedStats.sectorIntegrity?.[attackLocation]
    ?? strategicStateAfterAction.sectorIntegrity[attackLocation];
  if (integrityAfterCombat > 0 && random() < (attackScale === 'LARGE' ? 0.7 : 0.2)) {
    const curLv = calculatedStats.fortificationLevel?.[attackLocation] ?? currentStats.fortificationLevel[attackLocation];
    if (curLv > 0) {
      const newLv = curLv - 1;
      const fortificationBefore = { ...(calculatedStats.fortificationLevel || currentStats.fortificationLevel) };
      const stateBeforeDamage: GameStats = {
        ...strategicStateAfterAction,
        ...calculatedStats,
        fortificationLevel: fortificationBefore,
        sectorIntegrity: calculatedStats.sectorIntegrity || strategicStateAfterAction.sectorIntegrity,
        soldierDistribution: calculatedStats.soldierDistribution || currentDistribution,
        hmgSquads: ammoCheckSquads,
      };
      const mitigationBeforeDamage = Math.round(getSectorDefenseProfile(stateBeforeDamage, attackLocation).mitigation * 100);
      calculatedStats.fortificationLevel = { ...fortificationBefore, [attackLocation]: newLv };
      const currentBuildCount = calculatedStats.fortificationBuildCounts?.[attackLocation]
        ?? currentStats.fortificationBuildCounts[attackLocation]
        ?? curLv * 2;
      calculatedStats.fortificationBuildCounts = {
        ...(calculatedStats.fortificationBuildCounts || currentStats.fortificationBuildCounts),
        [attackLocation]: Math.min(currentBuildCount, newLv * 2 + 1),
      };
      const stateAfterDamage: GameStats = {
        ...stateBeforeDamage,
        fortificationLevel: calculatedStats.fortificationLevel,
        fortificationBuildCounts: calculatedStats.fortificationBuildCounts,
      };
      const mitigationAfterDamage = Math.round(getSectorDefenseProfile(stateAfterDamage, attackLocation).mitigation * 100);
      narrativeParts.push('\n\n' + pick(FORT_DAMAGE_SCENES));
      statsLog.push(`🏚️ ${attackLocation}掩体被炸开: 实际减伤 ${mitigationBeforeDamage}% → ${mitigationAfterDamage}%`);
    }
  }

  const prevKills = calculatedStats.enemiesKilled ?? currentStats.enemiesKilled ?? 0;
  calculatedStats.enemiesKilled = prevKills + outcome.enemiesKilled + barrierKills;
  if (deaths > 0) {
    applyNamedSoldierDeaths(currentStats, calculatedStats, deaths, narrativeParts, random);
    statsLog.push(`🔴 阵亡: ${deaths}人`);
  }
  if (injuries > 0) statsLog.push(`🩹 新增伤员: ${injuries}人`);
  statsLog.push(`💀 击毙日军: ${outcome.enemiesKilled + barrierKills}人`);

  let moraleGain = Math.floor(outcome.enemiesKilled / 8);
  if (outcome.attackScale === 'LARGE' && deaths < 5) moraleGain += 8;
  else if (outcome.attackScale === 'MEDIUM' && deaths === 0) moraleGain += 3;
  const moraleLoss = deaths * 2;
  currentMorale = Math.max(0, Math.min(100, currentMorale + moraleGain - moraleLoss));
  calculatedStats.morale = currentMorale;
  if (moraleGain > 0) statsLog.push(`💪 战果振奋: 士气 +${moraleGain}`);
  if (moraleLoss > 0) statsLog.push(`💔 伤亡惨重: 士气 -${moraleLoss}`);

  const stateAfterContact: GameStats = {
    ...strategicStateAfterAction,
    ...calculatedStats,
    soldierDistribution: calculatedStats.soldierDistribution || strategicStateAfterAction.soldierDistribution,
    sectorIntegrity: calculatedStats.sectorIntegrity || strategicStateAfterAction.sectorIntegrity,
    hmgSquads: calculatedStats.hmgSquads || strategicStateAfterAction.hmgSquads,
    specialistSquads: calculatedStats.specialistSquads || strategicStateAfterAction.specialistSquads,
    consequenceFlags: calculatedStats.consequenceFlags || strategicStateAfterAction.consequenceFlags,
  };
  calculatedStats.enemyOperation = createEnemyOperation(stateAfterContact, random, contactOperation.id + 1);

  return { eventTriggered, visualEffect, attackLocation };
};
