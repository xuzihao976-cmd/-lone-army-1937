import { describe, expect, it } from 'vitest';
import { DAY_PROFILES, getDayProfile } from '../data/dayProfiles';

describe('daily battle profiles', () => {
  it('gives each campaign day a distinct situation title', () => {
    const titles = Object.values(DAY_PROFILES).map((profile) => profile.title);
    expect(new Set(titles).size).toBe(7);
  });

  it('escalates pressure toward the fifth day', () => {
    expect(getDayProfile(5).threatMultiplier).toBeGreaterThan(getDayProfile(1).threatMultiplier);
    expect(getDayProfile(5).bombingChance).toBeGreaterThan(getDayProfile(1).bombingChance);
    expect(getDayProfile(99)).toEqual(getDayProfile(6));
  });
});
