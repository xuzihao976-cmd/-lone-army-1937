import { describe, expect, it } from 'vitest';
import { getActionPreview } from '../engine/actionPreview';
import { createInitialStats } from '../storage/saveStore';

describe('action risk previews', () => {
  it('shows duration, resource cost and threat before fortifying', () => {
    const stats = createInitialStats();
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.siegeMeter = 20;

    const preview = getActionPreview(stats, '加固一楼');
    expect(preview).toMatchObject({
      action: '加固工事',
      durationMinutes: 120,
      threatIncrease: 9,
      predictedThreat: 29,
      available: true,
    });
    expect(preview?.costs).toContain('工事材料 170');
  });

  it('warns that a daytime raid is unavailable', () => {
    const stats = createInitialStats();
    stats.currentTime = '14:00';
    const preview = getActionPreview(stats, '火力突袭');
    expect(preview?.available).toBe(false);
    expect(preview?.reason).toContain('00:00');
    expect(preview?.durationMinutes).toBe(0);
  });

  it('reflects the final-assault daily threat multiplier', () => {
    const stats = createInitialStats();
    stats.day = 5;
    stats.siegeMeter = 40;
    if (stats.enemyOperation) stats.enemyOperation.turnsRemaining = 1;
    const preview = getActionPreview(stats, '休息整顿');
    expect(preview?.threatIncrease).toBe(28);
    expect(preview?.predictedThreat).toBe(68);
    expect(preview?.risk).toBe('critical');
  });

  it('previews sealing an exposed stairwell and its one-use cost', () => {
    const stats = createInitialStats();
    stats.day = 2;
    stats.sectorIntegrity['一楼入口'] = 0;

    const preview = getActionPreview(stats, '封锁通往二楼阵地的楼梯');
    expect(preview).toMatchObject({
      action: '封锁通往二楼阵地的楼梯',
      durationMinutes: 60,
      available: true,
    });
    expect(preview?.costs).toEqual(['工事材料 150', '手榴弹 20']);
  });

  it('previews a counterattack only for a reachable lost sector', () => {
    const stats = createInitialStats();
    stats.day = 1;
    stats.sectorIntegrity['一楼入口'] = 0;

    const preview = getActionPreview(stats, '反冲锋夺回一楼入口');
    expect(preview?.available).toBe(true);
    expect(preview?.durationMinutes).toBe(60);
    expect(preview?.costs).toContain('七九弹 800');
  });

  it('keeps a bayonet counterattack available after ammunition is exhausted', () => {
    const stats = createInitialStats();
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.ammo = 0;
    stats.grenades = 0;

    const preview = getActionPreview(stats, '反冲锋夺回一楼入口');
    expect(preview?.available).toBe(true);
    expect(preview?.costs).toContain('刺刀反攻：伤亡较高');
    expect(preview?.reason).toContain('近战夺回');
  });
});
