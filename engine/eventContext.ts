import type { GameStats, Location } from '../types';
import { CHAPTER_TIME_LIMIT, EVACUATION_TARGET, EXTRACTION_MINUTES } from '../data/chapters';
import { isSectorHeld } from './strategicDefense';
import { canonicalCommand, getLanguageGuard, isQuestion } from './commandLanguage';
import { EVENT_RULES as R } from '../data/eventRules';

export const innerRoadBlocked = (s: GameStats): boolean => s.consequenceFlags.includes('street_corner_obstructed')
  && !s.consequenceFlags.includes('street_corner_cleared');

/** Conservative completion budget: ordinary searches yield at least two. */
export const streetHasTime = (s: GameStats, extra: number, route: 'inner'|'river', found = s.mission?.found ?? 0): boolean => {
  const m = s.mission;
  if (!m) return false;
  const searchTime = Math.ceil(Math.max(0, EVACUATION_TARGET - found) / 2) * 20;
  const escortTime = Math.ceil(Math.max(0, EVACUATION_TARGET - m.evacuated) / 6) * (route === 'inner' ? 25 : 15);
  return m.elapsedMinutes + extra + searchTime + escortTime + EXTRACTION_MINUTES < CHAPTER_TIME_LIMIT;
};

export const NEW_EVENT_IDS = ['street_corner','wall_knocking','beam_creak','wet_medicine','hmg_jam'];
export const getNewEventContext = (s: GameStats, id: string, owned = false): { available: boolean; location?: Location; hmgName?: string } => {
  const m = s.mission, b = s.lastBattle;
  if (id === 'street_corner') return { available: s.chapterId === 'street' && !!m?.started && m.recon && m.route === 'inner'
    && m.found > m.evacuated && s.soldiers > 0 && streetHasTime(s,R.corner.minutes,'inner') && streetHasTime(s,0,'river') };
  if (id === 'wall_knocking') return { available: s.chapterId === 'street' && !!m?.started && m.recon && m.found < 12
    && s.soldiers > 0 && streetHasTime(s,R.knocking.minutes,m.route ?? 'inner',m.found + 1) };
  if (id === 'wet_medicine') return { available: s.chapterId === 'sihang' && isSectorHeld(s,'地下室') && s.medkits > 0 && s.wounded > 0 && s.soldiers > 0 };
  if (id === 'beam_creak') return { available: s.chapterId === 'sihang' && !!b && b.turn === s.turnCount && b.attackType === 'ARTILLERY'
    && isSectorHeld(s,b.location) && s.sectorIntegrity[b.location] < 60 && s.fortificationLevel[b.location] > 0,
    location: b?.location };
  if (id === 'hmg_jam') {
    const squad = s.hmgSquads.find(q => b?.hmgFired.includes(q.name) && q.status === 'active' && q.count > 0
      && q.location !== '待命' && isSectorHeld(s,q.location) && (owned ? q.name === s.pendingEvent?.hmgName && q.jammed === true : !q.jammed));
    return { available: s.chapterId === 'sihang' && !!b && b.turn === s.turnCount && !!squad && s.machineGunAmmo >= 200,
      hmgName: squad?.name, location: squad?.location === '待命' ? undefined : squad?.location };
  }
  return { available: false };
};

/** Full explicit command only; no substring actions from discussion or quotes. */
export const getHmgRepairPlan = (s: GameStats, raw: string) => {
  if (raw.length > 500 || s.chapterId !== 'sihang' || getLanguageGuard(raw) || isQuestion(raw)) return null;
  const cmd = canonicalCommand(raw);
  const index = s.hmgSquads.findIndex(q => cmd === `检修${q.name}`);
  if (index < 0) return null;
  const q = s.hmgSquads[index];
  const reason = s.isGameOver ? '战役已结束。' : s.pendingDilemmaId ? '先处置当前待决事件。'
    : q.status !== 'active' || q.count <= 0 ? '该组已经失效，不能靠检修恢复人员或弃置的枪。'
      : !q.jammed ? '该枪当前没有已记录故障。'
        : q.location === '待命' || !isSectorHeld(s,q.location) ? '需要在受控阵位检修。' : '';
  return { index, name: q.name, available: !reason, reason,
    minutes: reason ? 0 : R.hmgRepair.minutes, pressure: reason ? 0 : R.hmgRepair.pressure };
};
