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
      threatIncrease: 15,
      predictedThreat: 35,
      available: true,
    });
    expect(preview?.costs).toContain('粮包 200');
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
    const preview = getActionPreview(stats, '休息整顿');
    expect(preview?.threatIncrease).toBe(46);
    expect(preview?.predictedThreat).toBe(86);
    expect(preview?.risk).toBe('high');
  });
});
