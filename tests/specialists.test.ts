import { describe, expect, it } from 'vitest';
import { createInitialStats } from '../storage/saveStore';
import { getSpecialistEffectFactor, getSpecialistReadiness } from '../engine/specialists';

describe('specialist manpower support', () => {
  it('scales a squad down when its floor no longer has enough riflemen', () => {
    const stats = createInitialStats(1937);
    const veteran = stats.specialistSquads.find((squad) => squad.role === 'veteran')!;

    stats.soldierDistribution['二楼阵地'] = 18;
    expect(getSpecialistReadiness(stats, veteran)).toMatchObject({
      readiness: 'full',
      effectFactor: 1,
      availableMembers: 18,
    });

    stats.soldierDistribution['二楼阵地'] = 12;
    expect(getSpecialistReadiness(stats, veteran)).toMatchObject({
      readiness: 'reduced',
      effectFactor: 0.75,
      availableMembers: 12,
    });

    stats.soldierDistribution['二楼阵地'] = 8;
    expect(getSpecialistReadiness(stats, veteran)).toMatchObject({
      readiness: 'critical',
      effectFactor: 0.5,
      availableMembers: 8,
    });

    stats.soldierDistribution['二楼阵地'] = 0;
    expect(getSpecialistReadiness(stats, veteran)).toMatchObject({
      readiness: 'inactive',
      effectFactor: 0,
      availableMembers: 0,
    });
    expect(getSpecialistEffectFactor(stats, 'veteran', '二楼阵地')).toBe(0);
  });

  it('shares a thin garrison between multiple specialist squads without inventing men', () => {
    const stats = createInitialStats(1938);
    stats.soldierDistribution['一楼入口'] = 8;
    const localSquads = stats.specialistSquads.filter((squad) => squad.location === '一楼入口');
    const represented = localSquads.reduce(
      (sum, squad) => sum + getSpecialistReadiness(stats, squad).availableMembers,
      0,
    );

    expect(represented).toBeLessThanOrEqual(8);
    expect(getSpecialistEffectFactor(stats, 'engineer', '一楼入口')).toBe(0.5);
    expect(getSpecialistEffectFactor(stats, 'assault', '一楼入口')).toBe(0.5);
  });
});
