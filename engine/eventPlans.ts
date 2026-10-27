import type { Dilemma, EnemyOperation, GameStats, Location, PendingEventTicket } from '../types';
import { ALL_DILEMMAS } from '../data/text/events';
import { EVENT_RULES as R } from '../data/eventRules';
import { canonicalCommand, getLanguageGuard, isQuestion } from './commandLanguage';
import { getGroundAttackTargets, isSectorHeld } from './strategicDefense';
import { retargetEnemyOperation } from './battlefield';

export const validEventOperation = (s: GameStats, operation: EnemyOperation, southPressure = false): EnemyOperation => {
  const held = (['一楼入口', '二楼阵地', '地下室', '屋顶'] as Location[]).filter(floor => isSectorHeld(s, floor));
  const target = southPressure && held.includes('地下室') ? '地下室'
    : held.includes(operation.target) ? operation.target : getGroundAttackTargets(s)[0] ?? held[0];
  if (!target) return operation; // A collapsed state is handled by the shared ending check.
  const next = target === operation.target && !southPressure ? operation : retargetEnemyOperation(operation, target);
  return southPressure ? { ...next, turnsRemaining: Math.max(1, operation.turnsRemaining - 1) } : next;
};

export const getEvent = (id: string) => ALL_DILEMMAS.find(event => event.id === id);
export const isEventUnlocked = (s: GameStats, e: Dilemma): boolean => s.chapterId === 'sihang' && !s.isGameOver
  && s.tutorialStep >= 3 && s.day < 6 && !s.triggeredEvents.includes(e.id)
  && (e.minDay === undefined || s.day >= e.minDay)
  && (!e.requiresFlag || s.consequenceFlags.includes(e.requiresFlag))
  && (!e.excludesFlag || !s.consequenceFlags.includes(e.excludesFlag));

/** Context controls new offers. An already owned event can still be declined. */
export const canOfferEvent = (s: GameStats, e: Dilemma): boolean => {
  if (!isEventUnlocked(s, e) || s.pendingDilemmaId) return false;
  const entry = isSectorHeld(s, '一楼入口'), river = isSectorHeld(s, '地下室');
  switch (e.id) {
    case 'student_run': return entry && s.soldiers > 0 && s.ammo >= R.student.ammo && (s.wounded > 0 || s.medkits <= 10);
    case 'smuggler_boat': return river && s.soldiers > 0 && s.ammo < 18000;
    case 'puppet_defector': return entry && s.soldierDistribution['一楼入口'] > 0 && s.grenades < 500;
    case 'wrecked_truck': return entry && s.soldiers > 0 && !!s.enemyOperation?.revealed && s.ammo < 18000;
    case 'stray_airdrop': return isSectorHeld(s, '屋顶') && s.soldiers > 0 && (s.medkits < 10 || s.sandbags < 500);
    case 'brit_ceasefire': return river && (s.wounded > 0 || s.medkits < 10);
    case 'student_thanks': return river;
    case 'smuggler_return': return river && s.ammo >= R.returnBoat.ammo && s.soldiers > 0;
    case 'british_pressure': return !!s.enemyOperation && (['一楼入口', '二楼阵地', '地下室', '屋顶'] as const).some(floor => s.sectorIntegrity[floor] > 0);
    default: return false;
  }
};

export const issueEvent = (s: GameStats, eventId: string): Partial<GameStats> => ({
  pendingDilemmaId: eventId, lastDilemmaTurn: s.turnCount, pendingRetreat: null,
  pendingEvent: { version: 1, eventId, campaignId: s.campaignId, day: s.day, time: s.currentTime, turn: s.turnCount },
});

export const validateEventTicket = (s: GameStats, value: unknown): value is PendingEventTicket => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ticket = value as Record<string, unknown>;
  const e = typeof ticket.eventId === 'string' ? getEvent(ticket.eventId) : undefined;
  return !!e && ticket.version === 1 && ticket.eventId === s.pendingDilemmaId
    && ticket.campaignId === s.campaignId && ticket.day === s.day && ticket.time === s.currentTime
    && Number.isSafeInteger(ticket.turn) && ticket.turn === s.turnCount && isEventUnlocked(s, e);
};
export const getPendingEvent = (s: GameStats): Dilemma | null => validateEventTicket(s, s.pendingEvent) ? getEvent(s.pendingDilemmaId!)! : null;

export interface EventPlan {
  event: Dilemma;
  option: number;
  available: boolean;
  reason: string;
  minutes: number;
  pressure: number;
  ammo: number;
  materials: number;
  partySize: number;
  maxDeaths: number;
  costs: string[];
  riskText: string;
}

export const getEventPlan = (s: GameStats, raw: string, requireOwnership = true): EventPlan | null => {
  if (raw.length > 500) return null;
  const command = canonicalCommand(raw);
  const match = /^evt_resolve:([a-z_]+):(0|[1-9]\d*)$/.exec(command);
  if (!match) return null;
  const e = getEvent(match[1]), option = Number(match[2]);
  if (!e || !e.options[option] || e.options[option].actionCmd.toLowerCase() !== command) return null;
  const p: EventPlan = { event: e, option, available: true, reason: '', minutes: 0, pressure: 0,
    ammo: 0, materials: 0, partySize: 0, maxDeaths: 0, costs: [], riskText: e.options[option].riskText ?? '' };
  const active = option === 0 || option === 2;
  const block = (reason: string) => { p.available = false; p.reason = reason; };
  const needTroops = (cap: number) => { p.partySize = Math.min(cap, s.soldiers); if (p.partySize <= 0) block('没有可派出的步兵。'); };
  const needEntry = () => { if (!isSectorHeld(s, '一楼入口')) block('一楼入口已失守，不能从这里组织接应。'); };
  const needRiver = () => { if (!isSectorHeld(s, '地下室')) block('地下室接应点已失守，当前不能接收水路物资。'); };
  switch (e.id) {
    case 'student_run':
      if (active) { Object.assign(p, R.student); needTroops(R.student.maxDeaths); needEntry(); p.maxDeaths = p.partySize;
        p.riskText = `急救包+10；阵亡0—${p.maxDeaths}名实际派出步兵；建立民间支援线。`; }
      break;
    case 'smuggler_boat':
      if (active) { Object.assign(p, option === 2 ? R.checkedBoat : R.boat); needTroops(p.maxDeaths); needRiver(); p.maxDeaths = p.partySize;
        p.riskText = p.maxDeaths <= 0 ? '没有可派出的步兵，不能组织接货。' : option === 2 ? `80%核验接货，七九弹+2400；20%遇险，阵亡1—${p.maxDeaths}人（不超过派出人数）。`
          : `50%接货，七九弹+3000；50%遭伏击，阵亡${Math.min(10, p.maxDeaths)}—${p.maxDeaths}人。`; }
      break;
    case 'puppet_defector':
      if (active) { Object.assign(p, option === 2 ? R.checkedDefector : R.defector); needTroops(2); needEntry();
        p.riskText = option === 2 ? '70%验明一部分可用手榴弹，入库30枚；30%拒收，不损工事、不增伤亡。'
          : s.fortificationLevel['一楼入口'] > 0 ? '70%手榴弹+50；30%一楼实际工事防护降低一档。'
            : `70%手榴弹+50；30%爆炸新增伤员${Math.min(2, s.soldiers)}人；入口没有工事遮挡。`; }
      break;
    case 'wrecked_truck':
      if (active) { Object.assign(p, R.truck); needTroops(R.truck.maxDeaths); needEntry(); p.maxDeaths = p.partySize;
        if (!s.enemyOperation?.revealed) block('先侦察敌情，确认通路风险后再组织抢运。');
        p.riskText = p.maxDeaths > 0 ? `七九弹+2000；阵亡1—${p.maxDeaths}名派出步兵。` : '没有可派出的步兵，不能组织抢运。'; }
      break;
    case 'stray_airdrop':
      if (option === 2) break;
      p.minutes = option === 0 ? R.package.minutes : R.groundRecovery.minutes;
      p.pressure = option === 0 ? R.package.pressure : R.groundRecovery.pressure;
      needTroops(1);
      if (!isSectorHeld(s, '屋顶')) block('屋顶接应位置已失守，当前不能组织回收。');
      p.maxDeaths = option === 0 ? Math.min(1, s.soldiers) : 0;
      break;
    case 'brit_ceasefire':
      if (option === 0) needRiver();
      else if (!s.enemyOperation) p.riskText = '士气最多+5；南侧长期压力增加；当前没有攻势，不生成新目标。';
      break;
    case 'student_thanks': needRiver(); break;
    case 'smuggler_return':
      if (option === 0) { Object.assign(p, R.returnBoat); needTroops(1); needRiver(); }
      break;
  }
  if (p.ammo > s.ammo) block(`需要七九弹${p.ammo}发，当前只有${s.ammo}发。`);
  if (p.materials > s.sandbags) block(`需要工事材料${p.materials}份，当前只有${s.sandbags}份。`);
  if (!isEventUnlocked(s, e)) block('该事件的章节、日期或前置条件不满足，或已经结算。');
  if (requireOwnership && getPendingEvent(s)?.id !== e.id) block('该事件当前没有有效的待处理凭据，未执行。');
  p.costs = [p.ammo ? `七九弹${p.ammo}发` : '', p.materials ? `工事材料${p.materials}份` : '', p.partySize ? `派出步兵最多${p.partySize}人（仍计入本队）` : ''].filter(Boolean);
  return p;
};

export const presentEvent = (s: GameStats, e: Dilemma): Dilemma => ({ ...e, options: e.options.map(option => {
  const p = getEventPlan(s, option.actionCmd, false)!;
  return { ...option, available: p.available, unavailableReason: p.available ? undefined : p.reason,
    riskText: `${p.minutes ? `耗时${p.minutes}分钟，敌军照常推进；` : '不耗时；'}${p.costs.length ? p.costs.join('、') + '；' : ''}${p.riskText}` };
}) });

export const getEventRuleHelp = (s: GameStats, raw: string): string | null => {
  if (s.chapterId !== 'sihang' || raw.length > 500 || getLanguageGuard(raw)) return null;
  const input = canonicalCommand(raw);
  const aliases: Record<string,string> = { '英军通牒':'brit_ceasefire', '偏离的空投':'stray_airdrop', '租界侧翼压力':'british_pressure' };
  const event = ALL_DILEMMAS.find(e => input.includes(e.title)) ?? getEvent(Object.entries(aliases).find(([name]) => input.includes(name))?.[1] ?? '');
  if (!event || (!isQuestion(input) && !/规则|教程|消耗|概率|解释|事件/.test(input) && input !== event.title && !Object.hasOwn(aliases,input))) return null;
  const current = getPendingEvent(s)?.id === event.id;
  return `【${event.title} · 本地规则】\n${current ? '当前正在等待此事件的选择。' : '当前未等待此事件；以下仅说明规则。'}\n`
    + presentEvent(s,event).options.map(option => `${option.label}：${option.riskText}${option.unavailableReason ? `\n当前不可执行：${option.unavailableReason}` : ''}`).join('\n\n')
    + '\n\n这里只回答，不执行事件、不推进时间。';
};
