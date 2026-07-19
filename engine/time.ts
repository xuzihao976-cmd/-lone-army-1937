export interface CampaignClock {
  day: number;
  time: string;
  daysPassed: number;
  totalMinutes: number;
}

const parseTime = (time: string): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Invalid campaign time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid campaign time: ${time}`);
  }
  return hour * 60 + minute;
};

export const advanceCampaignClock = (day: number, time: string, minutes: number): CampaignClock => {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const startMinute = parseTime(time);
  const advanced = startMinute + safeMinutes;
  const daysPassed = Math.floor(advanced / 1440);
  const minuteOfDay = advanced % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  return {
    day: Math.max(0, Math.floor(day)) + daysPassed,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    daysPassed,
    totalMinutes: safeMinutes,
  };
};

export const minutesUntilMidnight = (time: string): number => 1440 - parseTime(time);

export const formatCampaignDate = (day: number): string => {
  const safeDay = Math.max(0, Math.floor(day));
  if (safeDay <= 5) return `10月${26 + safeDay}日`;
  return `11月${safeDay - 5}日`;
};
