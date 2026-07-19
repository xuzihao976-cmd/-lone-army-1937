import { describe, expect, it } from 'vitest';
import { calculateCombatOutcomes } from '../engine/combat';

const fixedRandom = () => 0.5;

describe('ammunition-bound combat outcomes', () => {
  it('cannot create rifle or machine-gun kills from ammunition stored on another floor', () => {
    const outcome = calculateCombatOutcomes({
      attackScale: 'LARGE',
      effectiveFortLevel: 1.2,
      fireReadyHmgSquads: 0,
      garrisonStrength: 164,
      morale: 100,
      damageType: 'INFANTRY',
      supply: { rifleAmmo: 0, machineGunAmmo: 7832, grenades: 0 },
    }, fixedRandom);

    expect(outcome.closeCombat).toBe(true);
    expect(outcome.rifleKills).toBe(0);
    expect(outcome.machineGunKills).toBe(0);
    expect(outcome.rifleAmmoUsed).toBe(0);
    expect(outcome.machineGunAmmoUsed).toBe(0);
    expect(outcome.enemiesKilled).toBeLessThanOrEqual(20);
  });

  it('uses a supplied local HMG without inventing rifle fire', () => {
    const outcome = calculateCombatOutcomes({
      attackScale: 'LARGE',
      effectiveFortLevel: 1.2,
      fireReadyHmgSquads: 1,
      garrisonStrength: 164,
      morale: 100,
      damageType: 'INFANTRY',
      supply: { rifleAmmo: 0, machineGunAmmo: 7832, grenades: 0 },
    }, fixedRandom);

    expect(outcome.closeCombat).toBe(false);
    expect(outcome.rifleKills).toBe(0);
    expect(outcome.machineGunKills).toBeGreaterThan(0);
    expect(outcome.machineGunAmmoUsed).toBeGreaterThan(0);
  });

  it('cannot turn fifty grenades and bayonets into hundreds of kills', () => {
    const outcome = calculateCombatOutcomes({
      attackScale: 'LARGE',
      effectiveFortLevel: 1.2,
      fireReadyHmgSquads: 0,
      garrisonStrength: 164,
      morale: 100,
      damageType: 'INFANTRY',
      supply: { rifleAmmo: 0, machineGunAmmo: 7832, grenades: 50 },
    }, fixedRandom);

    expect(outcome.closeCombat).toBe(true);
    expect(outcome.grenadeKills).toBeGreaterThan(0);
    expect(outcome.closeCombatKills).toBeGreaterThan(0);
    expect(outcome.enemiesKilled).toBeLessThanOrEqual(45);
    expect(outcome.grenadesUsed).toBeGreaterThan(0);
  });
});
