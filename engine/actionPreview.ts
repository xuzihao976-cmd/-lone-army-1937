import type { ActionPreview, GameStats } from '../types';
import { getDayProfile } from '../data/dayProfiles';
import { isMoveCommand } from './intents';

const includesAny = (command: string, words: string[]) => words.some((word) => command.includes(word));

const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return '不耗时';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}小时${remainder}分` : `${hours}小时`;
};

const riskFor = (predictedThreat: number): Pick<ActionPreview, 'risk' | 'riskLabel'> => {
  if (predictedThreat >= 90) return { risk: 'critical', riskLabel: '极可能遇袭' };
  if (predictedThreat >= 70) return { risk: 'high', riskLabel: '高风险' };
  if (predictedThreat >= 45) return { risk: 'medium', riskLabel: '中风险' };
  if (predictedThreat > 10) return { risk: 'low', riskLabel: '低风险' };
  return { risk: 'safe', riskLabel: '相对安全' };
};

export const getActionPreview = (stats: GameStats, rawCommand: string): ActionPreview | null => {
  const command = rawCommand.trim().toLowerCase();
  if (!command) return null;

  let action = '交谈 / 询问';
  let durationMinutes = 0;
  let baseThreat = 0;
  let costs: string[] = [];
  let available = true;
  let reason: string | undefined;

  if (command.includes('调派30人') || command.includes('增援30人')) {
    action = '调派步兵';
    durationMinutes = 30;
    baseThreat = 8;
    reason = '从兵力最充足的防区抽调，原防区至少保留20人';
  } else if (command.includes('部署机枪') && command.includes('至')) {
    action = '转移机枪组';
    durationMinutes = 20;
    baseThreat = 6;
    reason = '机枪组只会支援其实际部署的防区';
  } else if (command.startsWith('evt_resolve:')) {
    action = '事件抉择';
    reason = '抉择会立即生效，具体结果取决于事件风险';
  } else if (includesAny(command, ['突袭', '夜袭', '偷袭', '反击', '进攻'])) {
    action = '夜间突袭';
    const hour = Number(stats.currentTime.split(':')[0]);
    available = hour >= 0 && hour < 5;
    durationMinutes = available ? 60 : 0;
    baseThreat = available ? 5 : 0;
    reason = available ? '成败不定，可能伤亡并缴获物资' : '仅可在 00:00–04:59 发动';
  } else if (includesAny(command, ['搜寻', '寻找', '搜'])) {
    action = '搜寻物资';
    durationMinutes = 30;
    baseThreat = 10;
    reason = '可能找到弹药、药品或粮包，也可能一无所获';
  } else if (includesAny(command, ['侦察', '观察'])) {
    action = '侦察敌情';
    durationMinutes = 15;
    baseThreat = 5;
  } else if (isMoveCommand(command)) {
    action = '转移阵位';
    durationMinutes = 15;
    baseThreat = 5;
  } else if (includesAny(command, ['加固', '修', '工事'])) {
    action = '加固工事';
    const target = command.includes('一楼') ? '一楼入口'
      : command.includes('二楼') ? '二楼阵地'
        : command.includes('屋顶') ? '屋顶'
          : command.includes('地下') ? '地下室'
            : stats.location;
    const level = stats.fortificationLevel[target] ?? 0;
    available = level < 3 && stats.sandbags >= 200;
    durationMinutes = available ? 120 : 0;
    baseThreat = available ? 15 : 0;
    costs = level >= 3 ? [] : ['粮包 200'];
    reason = level >= 3 ? `${target}工事已达最高等级` : stats.sandbags < 200 ? '粮包不足 200' : '每完成两次施工提升一级工事';
  } else if (includesAny(command, ['休息', '睡', '整顿'])) {
    action = '轮换休整';
    durationMinutes = 120;
    baseThreat = 35;
    reason = '恢复士气与阵地状态，但会给敌军充分准备时间';
  } else if (includesAny(command, ['治疗', '抢救', '救', '医'])) {
    action = '救治伤员';
    available = stats.wounded > 0 && stats.medkits > 0;
    durationMinutes = available ? 60 : 0;
    baseThreat = available ? 10 : 0;
    costs = available ? ['急救包 2–5'] : [];
    reason = stats.wounded <= 0 ? '目前没有伤员需要救治' : stats.medkits <= 0 ? '急救包已经耗尽' : '实际消耗取决于成功救回的人数';
  } else if (command.includes('升旗')) {
    action = '升起国旗';
    available = stats.location === '屋顶' && !stats.hasFlagRaised;
    durationMinutes = available ? (stats.flagWarned ? 30 : 5) : 0;
    baseThreat = available && stats.flagWarned ? 50 : 0;
    reason = stats.hasFlagRaised ? '国旗已经升起' : stats.location !== '屋顶' ? '必须先移动到屋顶' : stats.flagWarned ? '士气大增，但白天会招致轰炸' : '副官会要求再次确认风险';
  } else if (includesAny(command, ['演讲', '训话', '鼓舞', '动员', '坚持', '顶住', '拼了', '万岁'])) {
    action = '战前动员';
    durationMinutes = 60;
    baseThreat = 10;
    reason = '小幅提升士气';
  } else if (includesAny(command, ['补给', '物资']) && !command.includes('整理')) {
    action = '请求补给';
    available = false;
    reason = '封锁期间没有外部补给线路';
  }

  const multiplier = getDayProfile(stats.day).threatMultiplier;
  const threatIncrease = Math.max(0, Math.ceil(baseThreat * multiplier));
  const predictedThreat = Math.min(100, stats.siegeMeter + threatIncrease);
  const risk = riskFor(predictedThreat);
  const short = available
    ? `${formatDuration(durationMinutes)} · 威胁${threatIncrease > 0 ? `+${threatIncrease}` : '不变'}`
    : '当前不可执行';

  return {
    action,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    threatIncrease,
    predictedThreat,
    ...risk,
    costs,
    available,
    reason,
    short,
  };
};
