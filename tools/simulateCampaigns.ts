import { runGameTurn } from '../engine/gameEngine';
import { createInitialStats } from '../storage/saveStore';
import type { Dilemma, GameStats, GameTurnResult, Location } from '../types';
import { getSectorDefenseProfile, isSectorHeld } from '../engine/strategicDefense';

type Policy = 'defensive' | 'balanced' | 'aggressive' | 'novice';

interface CampaignResult {
  policy: Policy;
  ending: GameStats['gameResult'];
  reason: GameStats['gameOverReason'];
  attacks: number;
  turns: number;
  firstSectorLossDay: number | null;
  survivors: number;
  ammo: number;
  machineGunAmmo: number;
  grenades: number;
}

const LOCATIONS: Location[] = ['一楼入口', '二楼阵地', '地下室', '屋顶'];

const applyResult = (stats: GameStats, result: GameTurnResult): GameStats => ({
  ...stats,
  ...result.updatedStats,
  fortificationLevel: { ...stats.fortificationLevel, ...(result.updatedStats.fortificationLevel || {}) },
  fortificationBuildCounts: { ...stats.fortificationBuildCounts, ...(result.updatedStats.fortificationBuildCounts || {}) },
  soldierDistribution: { ...stats.soldierDistribution, ...(result.updatedStats.soldierDistribution || {}) },
  sectorIntegrity: { ...stats.sectorIntegrity, ...(result.updatedStats.sectorIntegrity || {}) },
  turnCount: stats.turnCount + 1,
});

const safestCommandPost = (stats: GameStats): Location => LOCATIONS
  .filter((location) => isSectorHeld(stats, location) && location !== stats.enemyOperation?.target)
  .sort((a, b) => getSectorDefenseProfile(stats, b).mitigation - getSectorDefenseProfile(stats, a).mitigation)[0]
  ?? stats.location;

const reinforceCommand = (stats: GameStats, target: Location): string | null => {
  const donor = LOCATIONS
    .filter((location) => location !== target && isSectorHeld(stats, location))
    .map((location) => ({ location, soldiers: stats.soldierDistribution[location] || 0 }))
    .sort((a, b) => b.soldiers - a.soldiers)[0];
  return donor && donor.soldiers > 50 ? `调派30人从${donor.location}至${target}` : null;
};

const chooseAction = (stats: GameStats, policy: Policy): string => {
  const operation = stats.enemyOperation;
  if (policy !== 'aggressive' && policy !== 'novice' && operation?.revealed && operation.target === stats.location && operation.turnsRemaining <= 1) {
    const safe = safestCommandPost(stats);
    if (safe !== stats.location) return `前往${safe}`;
  }

  if (policy === 'novice') {
    if (!isSectorHeld(stats, stats.location)) {
      const safe = safestCommandPost(stats);
      if (safe !== stats.location) return `前往${safe}`;
    }
    const canBuild = stats.sandbags >= 200
      && (stats.sectorIntegrity[stats.location] < 100 || stats.fortificationLevel[stats.location] < 3);
    const choices = ['搜寻物资', '演讲鼓舞', '休息整顿', '侦察敌情', canBuild ? `加固${stats.location}` : '休息整顿'];
    return choices[stats.rngState % choices.length];
  }

  const lost = LOCATIONS.find((location) => !isSectorHeld(stats, location));
  if (lost) return `反冲锋夺回${lost}`;

  if (stats.wounded >= (policy === 'aggressive' ? 28 : 8) && stats.medkits > 0 && isSectorHeld(stats, '地下室')) return '治疗伤员';
  if (stats.fatigue >= (policy === 'aggressive' ? 78 : 62)) return '休息整顿';
  if (!operation?.revealed) return '侦察敌情';

  if (operation && (stats.soldierDistribution[operation.target] || 0) < 60) {
    const reinforce = reinforceCommand(stats, operation.target);
    if (reinforce) return reinforce;
  }

  const hour = Number(stats.currentTime.split(':')[0]);
  const raidWindow = hour >= 0 && hour < 5;
  if (policy === 'aggressive' && raidWindow) return '火力突袭';
  if (policy === 'balanced' && raidWindow && stats.reconBonus >= 20 && stats.fatigue < 60) return '火力突袭';

  const weakest = LOCATIONS
    .filter((location) => isSectorHeld(stats, location))
    .sort((a, b) => (stats.sectorIntegrity[a] || 0) - (stats.sectorIntegrity[b] || 0))[0];
  const engineerCost = stats.specialistSquads.some((squad) => squad.status === 'active' && squad.role === 'engineer' && squad.location === weakest) ? 170 : 200;
  if (weakest && stats.sandbags >= engineerCost && (stats.sectorIntegrity[weakest] < 90 || stats.fortificationLevel[weakest] < 2)) {
    return `加固${weakest}`;
  }

  if (policy === 'aggressive') return stats.searchExhaustion < 4 ? '搜寻物资' : '演讲鼓舞';
  if (stats.morale < 65) return '演讲鼓舞';
  return stats.searchExhaustion < 3 ? '搜寻物资' : '休息整顿';
};

const playCampaign = (seed: number, policy: Policy): CampaignResult => {
  let stats = createInitialStats(seed);
  let pendingDilemma: Dilemma | null = null;
  let attacks = 0;
  let firstSectorLossDay: number | null = null;

  for (const command of ['start_game', 'skip_tutorial']) {
    const result = runGameTurn(stats, command);
    stats = applyResult(stats, result);
  }

  while (!stats.isGameOver && stats.turnCount < 160) {
    let command: string;
    if (pendingDilemma) {
      command = pendingDilemma.options[0].actionCmd;
      pendingDilemma = null;
    } else if (stats.activeTacticalCard) {
      command = stats.activeTacticalCard.actionCmd;
    } else {
      command = chooseAction(stats, policy);
    }

    const beforeLost = LOCATIONS.filter((location) => !isSectorHeld(stats, location)).length;
    const result = runGameTurn(stats, command);
    stats = applyResult(stats, result);
    if (result.eventTriggered === 'attack') attacks += 1;
    pendingDilemma = result.dilemma || null;
    const afterLost = LOCATIONS.filter((location) => !isSectorHeld(stats, location)).length;
    if (firstSectorLossDay === null && afterLost > beforeLost) firstSectorLossDay = stats.day;
  }

  const hmgSurvivors = stats.hmgSquads.reduce((sum, squad) => sum + (squad.status === 'active' ? squad.count : 0), 0);
  return {
    policy,
    ending: stats.gameResult,
    reason: stats.gameOverReason,
    attacks,
    turns: stats.turnCount,
    firstSectorLossDay,
    survivors: stats.soldiers + stats.wounded + hmgSurvivors,
    ammo: stats.ammo,
    machineGunAmmo: stats.machineGunAmmo,
    grenades: stats.grenades,
  };
};

const requestedRuns = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1] || 1000);
const runs = Number.isFinite(requestedRuns) ? Math.max(3, Math.floor(requestedRuns)) : 1000;
const policies: Policy[] = ['defensive', 'balanced', 'aggressive', 'novice'];
const results = Array.from({ length: runs }, (_, index) =>
  playCampaign(19370000 + index * 7919, policies[index % policies.length]));

const average = (values: number[]): number => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
  : 0;

const report = Object.fromEntries(policies.map((policy) => {
  const group = results.filter((result) => result.policy === policy);
  const wins = group.filter((result) => result.ending === 'victory_hold' || result.ending === 'victory_retreat').length;
  const commanderDeaths = group.filter((result) => result.reason === 'commander_killed').length;
  const sectorLosses = group.filter((result) => result.firstSectorLossDay !== null);
  return [policy, {
    campaigns: group.length,
    winRate: `${Math.round(wins / group.length * 1000) / 10}%`,
    commanderDeathRate: `${Math.round(commanderDeaths / group.length * 1000) / 10}%`,
    averageAttacks: average(group.map((result) => result.attacks)),
    averageTurns: average(group.map((result) => result.turns)),
    averageSurvivors: average(group.map((result) => result.survivors)),
    averageFinalRifleAmmo: average(group.map((result) => result.ammo)),
    averageFinalMachineGunAmmo: average(group.map((result) => result.machineGunAmmo)),
    sectorLossRate: `${Math.round(sectorLosses.length / group.length * 1000) / 10}%`,
    averageFirstSectorLossDay: sectorLosses.length ? average(sectorLosses.map((result) => result.firstSectorLossDay!)) : null,
    endings: Object.fromEntries([...new Set(group.map((result) => result.ending))]
      .map((ending) => [ending, group.filter((result) => result.ending === ending).length])),
  }];
}));

console.log(JSON.stringify({ runs, generatedAt: new Date().toISOString(), report }, null, 2));
