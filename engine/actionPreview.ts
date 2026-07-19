import type { ActionPreview, GameStats } from '../types';
import { getDayProfile } from '../data/dayProfiles';
import { isMoveCommand } from './intents';
import { canRecaptureSector, getRecaptureStagingSectors, isApproachExposed, isSectorHeld } from './strategicDefense';
import { getRaidSuccessChance, getSearchYieldFactor, getSpeechMoraleGain } from './actionDynamics';
import type { Location } from '../types';

const includesAny = (command: string, words: string[]) => words.some((word) => command.includes(word));

const commandLocation = (command: string): Location | null => {
  if (command.includes('屋顶') || command.includes('楼顶')) return '屋顶';
  if (command.includes('二楼')) return '二楼阵地';
  if (command.includes('一楼')) return '一楼入口';
  if (command.includes('地下')) return '地下室';
  return null;
};

const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return '不耗时';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}小时${remainder}分` : `${hours}小时`;
};

const riskFor = (turnsAfterAction: number | null, threatForcesContact: boolean): Pick<ActionPreview, 'risk' | 'riskLabel'> => {
  if (turnsAfterAction !== null && turnsAfterAction <= 0) return { risk: 'critical', riskLabel: '本次行动后接敌' };
  if (threatForcesContact || turnsAfterAction === 1) return { risk: 'high', riskLabel: '下一回合必定接敌' };
  if (turnsAfterAction !== null && turnsAfterAction <= 3) return { risk: 'medium', riskLabel: `预计${turnsAfterAction}回合后接敌` };
  if (turnsAfterAction !== null) return { risk: 'low', riskLabel: `预计${turnsAfterAction}回合后接敌` };
  return { risk: 'safe', riskLabel: '敌军仍在重整' };
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

  if ((command.includes('夺回') || command.includes('反冲锋')) && commandLocation(command)) {
    const target = commandLocation(command)!;
    const maxMovableForce = Math.max(0, ...getRecaptureStagingSectors(stats, target)
      .map((location) => (stats.soldierDistribution[location] || 0) - 20));
    const rifleCommitment = Math.min(800, stats.ammo);
    const grenadeCommitment = Math.min(40, stats.grenades);
    const bayonetAssault = rifleCommitment < 200;
    action = `反冲锋夺回${target}`;
    available = canRecaptureSector(stats, target) && maxMovableForce >= 20;
    durationMinutes = available ? 60 : 0;
    baseThreat = available ? 20 : 0;
    costs = [
      rifleCommitment > 0 ? `七九弹 ${rifleCommitment}` : '',
      grenadeCommitment > 0 ? `手榴弹 ${grenadeCommitment}` : '',
      bayonetAssault ? '刺刀反攻：伤亡较高' : '',
    ].filter(Boolean);
    reason = available
      ? bayonetAssault
        ? '弹药不足仍可近战夺回，但成功率更低、伤亡更高；成功后恢复30%完整度'
        : '投入最多800发七九弹和40枚手榴弹；成功后恢复30%完整度'
      : '需要敌占目标、相邻出发阵地及至少20名可抽调步兵';
  } else if (command.includes('封锁') && (command.includes('楼梯') || command.includes('通道'))) {
    const target = commandLocation(command);
    action = target ? `封锁通往${target}的楼梯` : '封锁楼梯';
    available = !!target && isApproachExposed(stats, target) && !stats.sealedApproaches.includes(target)
      && stats.sandbags >= 150 && stats.grenades >= 20;
    durationMinutes = available ? 60 : 0;
    baseThreat = available ? 15 : 0;
    costs = ['工事材料 150', '手榴弹 20'];
    reason = available ? '下一次沿此路线进攻时降低一个规模，触发后失效' : '仅能封锁已经暴露且尚未设障的敌军推进路线';
  } else if (command.includes('调派30人') || command.includes('增援30人')) {
    action = '调派步兵';
    durationMinutes = 30;
    baseThreat = 8;
    reason = '从兵力最充足的防区抽调，原防区至少保留20人';
  } else if (command.includes('部署机枪') && command.includes('至')) {
    action = '转移机枪组';
    durationMinutes = 20;
    baseThreat = 6;
    reason = '机枪组只会支援其实际部署的防区';
  } else if (command.includes('部署小队') && command.includes('至')) {
    action = '转移特色小队';
    durationMinutes = 20;
    baseThreat = 6;
    reason = '小队专长只会在实际驻扎的防区生效';
  } else if (command.startsWith('evt_resolve:')) {
    action = '事件抉择';
    reason = '抉择会立即生效，具体结果取决于事件风险';
  } else if (includesAny(command, ['突袭', '夜袭', '偷袭', '反击', '进攻'])) {
    action = '夜间突袭';
    const hour = Number(stats.currentTime.split(':')[0]);
    available = hour >= 0 && hour < 5;
    durationMinutes = available ? 60 : 0;
    baseThreat = available ? 5 : 0;
    const recon = Math.max(0, stats.reconBonus || 0);
    const chance = Math.round(getRaidSuccessChance(stats) * 100);
    reason = available ? `预计成功率${chance}%${recon ? `（含侦察+${recon}%）` : ''}；结果会消耗侦察优势` : '仅可在 00:00–04:59 发动';
  } else if (includesAny(command, ['搜寻', '寻找', '搜'])) {
    action = '搜寻物资';
    durationMinutes = 30;
    baseThreat = 10;
    const yieldPercent = Math.round(getSearchYieldFactor(stats.searchExhaustion || 0) * 100);
    reason = `可能找到弹药、药品或工事材料；当前区域剩余收益约${yieldPercent}%`;
  } else if (includesAny(command, ['侦察', '观察'])) {
    action = '侦察敌情';
    durationMinutes = 15;
    baseThreat = 5;
    reason = '查明下一轮敌军目标、路线、规模和武器，并使下一次夜袭成功率+20%';
  } else if (isMoveCommand(command)) {
    action = '转移阵位';
    const target = commandLocation(command);
    available = !target || isSectorHeld(stats, target);
    durationMinutes = available ? 15 : 0;
    baseThreat = available ? 5 : 0;
    if (!available) reason = '敌占防区必须先通过反冲锋夺回';
  } else if (includesAny(command, ['加固', '修', '工事'])) {
    action = '加固工事';
    const target = command.includes('一楼') ? '一楼入口'
      : command.includes('二楼') ? '二楼阵地'
        : command.includes('屋顶') ? '屋顶'
          : command.includes('地下') ? '地下室'
            : stats.location;
    const level = stats.fortificationLevel[target] ?? 0;
    const integrity = stats.sectorIntegrity[target] ?? 100;
    const engineerReady = stats.specialistSquads.some((squad) => squad.status === 'active' && squad.role === 'engineer' && squad.location === target);
    const materialCost = engineerReady ? 170 : 200;
    const repair = engineerReady ? 24 : 18;
    available = isSectorHeld(stats, target) && (level < 3 || integrity < 100) && stats.sandbags >= materialCost;
    durationMinutes = available ? 120 : 0;
    baseThreat = available ? 15 : 0;
    costs = level >= 3 && integrity >= 100 ? [] : [`工事材料 ${materialCost}`];
    reason = !isSectorHeld(stats, target) ? '敌占防区必须先夺回' : level >= 3 && integrity >= 100 ? `${target}掩体与防区完整度均已修复` : stats.sandbags < materialCost ? `工事材料不足 ${materialCost}` : `恢复${repair}%防区完整度；每两次施工强化一次实际减伤${engineerReady ? '（工兵组生效）' : ''}`;
  } else if (includesAny(command, ['休息', '睡', '整顿'])) {
    action = '轮换休整';
    durationMinutes = 120;
    baseThreat = 35;
    reason = `恢复士气、仓库结构与35%疲劳，但敌军会推进一回合（当前疲劳${stats.fatigue}%）`;
  } else if (includesAny(command, ['治疗', '抢救', '救', '医'])) {
    action = '救治伤员';
    available = isSectorHeld(stats, '地下室') && stats.wounded > 0 && stats.medkits > 0;
    durationMinutes = available ? 60 : 0;
    baseThreat = available ? 10 : 0;
    costs = available ? ['急救包 2–5'] : [];
    reason = !isSectorHeld(stats, '地下室') ? '地下室医院已经失守' : stats.wounded <= 0 ? '目前没有伤员需要救治' : stats.medkits <= 0 ? '急救包已经耗尽' : '实际消耗取决于成功救回的人数';
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
    const moraleGain = getSpeechMoraleGain(stats);
    reason = `本次预计士气+${moraleGain}；连续演讲效果递减，休整后恢复`;
  } else if (includesAny(command, ['补给', '物资']) && !command.includes('整理')) {
    action = '请求补给';
    available = false;
    reason = '封锁期间没有外部补给线路';
  }

  const multiplier = getDayProfile(stats.day).threatMultiplier;
  const threatIncrease = Math.max(0, Math.ceil(baseThreat * multiplier * 0.6));
  const predictedThreat = Math.min(100, stats.siegeMeter + threatIncrease);
  const turnsAfterAction = stats.enemyOperation && available && durationMinutes > 0
    ? Math.max(0, stats.enemyOperation.turnsRemaining - 1)
    : stats.enemyOperation?.turnsRemaining ?? null;
  const operationDue = turnsAfterAction === 0;
  const attackChance = available && durationMinutes > 0
    ? operationDue
      ? 1
      : 0
    : 0;
  const risk = riskFor(turnsAfterAction, predictedThreat >= 100 && !operationDue);
  const short = available
    ? `${formatDuration(durationMinutes)} · ${stats.enemyOperation ? `接敌${Math.max(0, stats.enemyOperation.turnsRemaining - 1)}回合` : `威胁${threatIncrease > 0 ? `+${threatIncrease}` : '不变'}`}`
    : '当前不可执行';

  return {
    action,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    threatIncrease,
    predictedThreat,
    attackChance,
    ...risk,
    costs,
    available,
    reason,
    short,
  };
};
