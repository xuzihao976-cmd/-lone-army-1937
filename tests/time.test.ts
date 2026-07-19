import { describe, expect, it } from 'vitest';
import { advanceCampaignClock, formatCampaignDate, minutesUntilMidnight } from '../engine/time';

describe('campaign clock', () => {
  it('advances within the same day without relying on Date or timezone', () => {
    expect(advanceCampaignClock(2, '08:15', 120)).toEqual({
      day: 2,
      time: '10:15',
      daysPassed: 0,
      totalMinutes: 120,
    });
  });

  it('crosses midnight exactly once and carries minutes correctly', () => {
    expect(advanceCampaignClock(2, '23:45', 30)).toEqual({
      day: 3,
      time: '00:15',
      daysPassed: 1,
      totalMinutes: 30,
    });
  });

  it('handles multi-day durations and reports the next-day countdown', () => {
    expect(advanceCampaignClock(1, '12:00', 2880)).toMatchObject({ day: 3, time: '12:00', daysPassed: 2 });
    expect(minutesUntilMidnight('23:45')).toBe(15);
    expect(formatCampaignDate(5)).toBe('10月31日');
    expect(formatCampaignDate(6)).toBe('11月1日');
  });
});
