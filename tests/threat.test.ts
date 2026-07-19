import { describe, expect, it } from 'vitest';
import { calculateAttackChance } from '../engine/threat';

describe('enemy attack pacing', () => {
  it('uses one bounded chance curve instead of a second bombing roll', () => {
    expect(calculateAttackChance(29, 10, -99)).toBe(0);
    expect(calculateAttackChance(50, 10, -99)).toBeCloseTo(0.23, 5);
    expect(calculateAttackChance(86, 10, -99)).toBeCloseTo(0.536, 5);
    expect(calculateAttackChance(100, 10, -99)).toBe(1);
  });

  it('guarantees one respite action after contact', () => {
    expect(calculateAttackChance(100, 12, 12)).toBe(0);
    expect(calculateAttackChance(100, 13, 12)).toBe(1);
  });
});
