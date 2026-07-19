import { describe, expect, it } from 'vitest';
import { createInitialStats } from '../storage/saveStore';
import {
  calculateCommanderDeathRisk,
  calculateDefenseMitigation,
  canRecaptureSector,
  getGroundAttackTargets,
  getSectorDefenseProfile,
  getSectorCondition,
  isApproachExposed,
} from '../engine/strategicDefense';

describe('strategic defense helpers', () => {
  it('uses two percent as the neutral commander risk and adjusts it with local defense', () => {
    const neutral = createInitialStats(1);
    neutral.fortificationLevel['一楼入口'] = 1;
    neutral.soldierDistribution['一楼入口'] = 80;
    neutral.hmgSquads = neutral.hmgSquads.map((squad) => ({ ...squad, location: '二楼阵地' }));
    expect(calculateCommanderDeathRisk(neutral, '一楼入口')).toBeCloseTo(0.02, 5);

    const strong = structuredClone(neutral);
    strong.fortificationLevel['一楼入口'] = 3;
    strong.soldierDistribution['一楼入口'] = 140;
    strong.hmgSquads[0].location = '一楼入口';

    const weak = structuredClone(neutral);
    weak.fortificationLevel['一楼入口'] = 0;
    weak.soldierDistribution['一楼入口'] = 10;
    weak.sectorIntegrity['一楼入口'] = 10;

    expect(calculateCommanderDeathRisk(strong, '一楼入口')).toBeLessThan(0.01);
    expect(calculateCommanderDeathRisk(weak, '一楼入口')).toBe(0.05);
  });

  it('changes the ground route and enables countermeasures after the entrance falls', () => {
    const stats = createInitialStats(2);
    expect(getGroundAttackTargets(stats)).toEqual(['一楼入口']);
    expect(isApproachExposed(stats, '二楼阵地')).toBe(false);

    stats.sectorIntegrity['一楼入口'] = 0;
    expect(getGroundAttackTargets(stats)).toEqual(['二楼阵地', '地下室']);
    expect(isApproachExposed(stats, '二楼阵地')).toBe(true);
    expect(isApproachExposed(stats, '地下室')).toBe(true);
    expect(canRecaptureSector(stats, '一楼入口')).toBe(true);
    expect(getSectorCondition(0)).toBe('lost');
    expect(getSectorCondition(20)).toBe('critical');
  });

  it('uses one shared mitigation value for the map and combat engine', () => {
    const stats = createInitialStats(3);
    stats.fortificationLevel['一楼入口'] = 2;
    stats.fortificationLevel['二楼阵地'] = 0;
    stats.soldierDistribution['一楼入口'] = 100;
    stats.hmgSquads = stats.hmgSquads.map((squad) => ({ ...squad, location: '屋顶' }));

    const profile = getSectorDefenseProfile(stats, '一楼入口');
    expect(profile.effectiveFortLevel).toBe(2);
    expect(profile.activeHmgSquads).toBe(0);
    expect(profile.mitigation).toBeCloseTo(0.7, 5);
    expect(profile.mitigation).toBe(calculateDefenseMitigation(2, 0, 100));

    stats.sectorIntegrity['一楼入口'] = 0;
    expect(getSectorDefenseProfile(stats, '一楼入口').mitigation).toBe(0);
  });
});
