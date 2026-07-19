import { calculateDefenseMitigation } from './strategicDefense';

export type AttackScale = 'SMALL' | 'MEDIUM' | 'LARGE';
export type DamageType = 'INFANTRY' | 'ARTILLERY' | 'BOMBING';

export interface CombatSupply {
  rifleAmmo: number;
  machineGunAmmo: number;
  grenades: number;
}

export interface CombatParameters {
  attackScale: AttackScale;
  effectiveFortLevel: number;
  fireReadyHmgSquads: number;
  garrisonStrength: number;
  morale: number;
  damageType: DamageType;
  supply: CombatSupply;
}

export interface CombatOutcome {
  casualtyCount: number;
  enemiesKilled: number;
  enemyCount: number;
  attackScale: AttackScale;
  closeCombat: boolean;
  rifleAmmoUsed: number;
  machineGunAmmoUsed: number;
  grenadesUsed: number;
  rifleKills: number;
  machineGunKills: number;
  grenadeKills: number;
  closeCombatKills: number;
}

type RandomSource = () => number;

const clampStock = (value: number): number => Math.max(0, Math.floor(value || 0));

export const calculateCombatOutcomes = (
  parameters: CombatParameters,
  random: RandomSource = Math.random,
): CombatOutcome => {
  const {
    attackScale,
    effectiveFortLevel,
    fireReadyHmgSquads,
    garrisonStrength,
    morale,
    damageType,
  } = parameters;
  const rifleAmmo = clampStock(parameters.supply.rifleAmmo);
  const machineGunAmmo = clampStock(parameters.supply.machineGunAmmo);
  const grenades = clampStock(parameters.supply.grenades);
  const garrison = Math.max(0, Math.floor(garrisonStrength));

  let baseEnemyPower: number;
  let enemyCount: number;
  if (attackScale === 'SMALL') {
    baseEnemyPower = 5 + random() * 5;
    enemyCount = 8 + Math.floor(random() * 9);
  } else if (attackScale === 'MEDIUM') {
    baseEnemyPower = 15 + random() * 15;
    enemyCount = 25 + Math.floor(random() * 31);
  } else {
    baseEnemyPower = 40 + random() * 40;
    enemyCount = 80 + Math.floor(random() * 81);
  }

  if (damageType === 'ARTILLERY') baseEnemyPower *= 1.5;
  if (damageType === 'BOMBING') baseEnemyPower *= 2;

  const rifleHasRounds = rifleAmmo > 0 && garrison > 0;
  const sustainedRifleThreshold = Math.max(10, Math.min(120, Math.ceil(garrison * 0.5)));
  const rifleReady = rifleAmmo >= sustainedRifleThreshold && garrison > 0;
  const localHmgReady = fireReadyHmgSquads > 0 && machineGunAmmo > 0;
  const closeCombat = damageType === 'INFANTRY' && !rifleReady && !localHmgReady;
  const mitigation = calculateDefenseMitigation(effectiveFortLevel, localHmgReady ? fireReadyHmgSquads : 0, garrison);
  const effectiveMitigation = closeCombat ? mitigation * 0.35 : mitigation;
  const closeCombatDanger = closeCombat ? 1.45 : 1;

  let casualtyCount = Math.ceil(baseEnemyPower * (1 - effectiveMitigation) * closeCombatDanger);
  casualtyCount = Math.max(0, Math.floor(casualtyCount * (0.8 + random() * 0.4)));

  const engagementFactor = damageType === 'INFANTRY' ? 1 : damageType === 'ARTILLERY' ? 0.55 : 0.15;
  const rifleEfficiency = Math.min(1.15, garrison / 120);
  const rifleRoundsPerKill = 26 + Math.floor(random() * 15);
  const hmgRoundsPerKill = 45 + Math.floor(random() * 31);

  const riflePotential = rifleHasRounds
    ? enemyCount * (0.3 + Math.max(0, effectiveFortLevel) * 0.08) * rifleEfficiency * engagementFactor
    : 0;
  const rifleKills = Math.min(Math.floor(riflePotential), Math.floor(rifleAmmo / rifleRoundsPerKill));

  const hmgPotential = localHmgReady
    ? enemyCount * Math.min(0.58, fireReadyHmgSquads * 0.24) * engagementFactor
    : 0;
  const machineGunKills = Math.min(Math.floor(hmgPotential), Math.floor(machineGunAmmo / hmgRoundsPerKill));

  // A bombing run has no ground assault force within grenade range. The old
  // formula still granted a small grenade kill potential while consumption
  // was correctly zero, creating free kills during air raids.
  const grenadesCanEngage = damageType !== 'BOMBING';
  const grenadePotential = grenadesCanEngage && grenades > 0
    ? enemyCount * (closeCombat ? 0.18 : 0.1) * engagementFactor
    : 0;
  const grenadeKills = Math.min(Math.floor(grenadePotential), Math.floor(grenades * 0.5));

  const moraleFactor = 0.75 + Math.max(0, Math.min(100, morale)) / 200;
  const closeCombatKills = closeCombat
    ? Math.min(Math.floor(enemyCount * 0.32), Math.floor(garrison * 0.1 * moraleFactor))
    : 0;

  const enemiesKilled = Math.min(
    enemyCount,
    Math.max(0, rifleKills + machineGunKills + grenadeKills + closeCombatKills),
  );

  const rifleAmmoUsed = rifleHasRounds
    ? Math.min(rifleAmmo, Math.ceil(rifleKills * rifleRoundsPerKill + Math.min(garrison * 1.5, rifleAmmo * 0.12)))
    : 0;
  const machineGunAmmoUsed = localHmgReady
    ? Math.min(machineGunAmmo, Math.ceil(machineGunKills * hmgRoundsPerKill + fireReadyHmgSquads * 180))
    : 0;
  const grenadesUsed = grenadesCanEngage && grenades > 0
    ? Math.min(grenades, Math.max(grenadeKills * 2, Math.ceil(enemyCount * (closeCombat ? 0.12 : 0.05))))
    : 0;

  return {
    casualtyCount,
    enemiesKilled,
    enemyCount,
    attackScale,
    closeCombat,
    rifleAmmoUsed,
    machineGunAmmoUsed,
    grenadesUsed,
    rifleKills,
    machineGunKills,
    grenadeKills,
    closeCombatKills,
  };
};
