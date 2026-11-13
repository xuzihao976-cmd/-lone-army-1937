import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DilemmaModal from '../components/DilemmaModal';
import { RAID_SUCCESS_TEXTS, raidSuccessTexts } from '../data/text/combat';
import { EVENT_RULES as R } from '../data/eventRules';
import { TACTICAL_CARDS } from '../data/text/events';
import { getEvent, getEventPlan, issueEvent, presentEvent } from '../engine/eventPlans';
import { resolvePlayerAction } from '../engine/actions/resolvePlayerAction';
import { resolveDilemma } from '../engine/dilemmaResolver';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { localAdvisorResponse } from '../engine/localAdvisor';
import { createInitialStats, migrateSaveData, SAVE_SCHEMA_VERSION } from '../storage/saveStore';
import type { GameStats } from '../types';

const ZERO_CASUALTY_CLAIM = /无一人伤亡|无人伤亡|全身而退|毫发无损|干净利落|全员归来|一个不少/;
const scripted = (values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};
const ready = (): GameStats => {
  const stats = createInitialStats(21);
  Object.assign(stats, { tutorialStep: 3, day: 3, currentTime: '10:00', activeTacticalCard: TACTICAL_CARDS[0] });
  stats.enemyOperation!.turnsRemaining = 6;
  stats.enemyOperation!.revealed = true;
  return migrateSaveData({ schemaVersion: SAVE_SCHEMA_VERSION, stats })!.stats;
};
const pending = (id: string, ammo?: number): GameStats => {
  const stats = ready(), event = getEvent(id)!;
  stats.consequenceFlags = event.requiresFlag ? [event.requiresFlag] : [];
  if (ammo !== undefined) stats.ammo = ammo;
  return { ...stats, ...issueEvent(stats, id) };
};
const resolve = (stats: GameStats, id: string, option: number, rolls: number[]) =>
  resolveDilemma(stats, id, option, scripted(rolls), () => undefined);

describe('P0 raid protection with the newer narrative library', () => {
  it('keeps the newer success library for casualty-free raids and excludes zero-loss claims after deaths', () => {
    expect(raidSuccessTexts(0)).toEqual(RAID_SUCCESS_TEXTS);
    for (let deaths = 1; deaths <= 5; deaths++) {
      const candidates = raidSuccessTexts(deaths);
      expect(candidates.length).toBeGreaterThan(0);
      for (const text of candidates) {
        expect(text).not.toMatch(ZERO_CASUALTY_CLAIM);
        expect(RAID_SUCCESS_TEXTS).toContain(text);
      }
    }
  });

  it('uses current prose and actual casualty logs when a successful raid loses men', () => {
    const stats = ready(); stats.currentTime = '02:00';
    for (const pickRoll of [0, 0.2, 0.45, 0.7, 0.99]) {
      const result = resolvePlayerAction(stats, '夜袭', scripted([0, 0.9, 0, 0, 0.99, pickRoll]));
      const deaths = stats.soldiers - result.updatedStats.soldiers!;
      expect(deaths).toBeGreaterThan(0);
      expect(raidSuccessTexts(deaths)).toContain(result.narrative.at(-1));
      expect(result.narrative.join('')).not.toMatch(ZERO_CASUALTY_CLAIM);
      expect(result.logs).toContain(`🔴 阵亡: ${deaths}人`);
      expect(result.logs).toContain(`💪 行动士气 ${stats.morale} → ${result.updatedStats.morale}`);
    }
  });

  it('keeps zero-death, zero-loot success grounded without requiring an old triumphant line', () => {
    const stats = ready(); stats.currentTime = '02:00';
    const result = resolvePlayerAction(stats, '夜袭', scripted([0, 0, 0, 0, 0]));
    expect(result.updatedStats.soldiers).toBe(stats.soldiers);
    expect(result.updatedStats.ammo).toBe(stats.ammo);
    expect(result.updatedStats.medkits).toBe(stats.medkits);
    expect(RAID_SUCCESS_TEXTS).toContain(result.narrative[0]);
    expect(result.logs.join('')).not.toMatch(/阵亡|缴获/);
  });

  it('bounds successful and failed raid losses, morale and named deaths by actual infantry', () => {
    for (const [rolls, morale] of [[[0, 0.99, 0, 0], 86], [[0.99, 0.99], 61]] as const) {
      const stats = ready(); stats.currentTime = '02:00'; stats.soldiers = 2;
      stats.soldierDistribution = { '一楼入口': 2, '二楼阵地': 0, '地下室': 0, '屋顶': 0 };
      const result = resolvePlayerAction(stats, '夜袭', scripted([...rolls]));
      expect(result.updatedStats.soldiers).toBe(0);
      expect(result.updatedStats.morale).toBe(morale);
      expect(result.logs).toContain('🔴 阵亡: 2人');
      expect(result.updatedStats.roster?.filter(person => person.status === 'dead').length ?? 0).toBeLessThanOrEqual(2);
    }
    const capped = ready(); capped.currentTime = '02:00'; capped.morale = 100;
    const result = resolvePlayerAction(capped, '夜袭', scripted([0, 0, 0, 0]));
    expect(result.logs).toContain('💪 行动士气 100 → 100');
  });

  it('blocks a raid with no infantry in execution, preview and advisor without advancing RNG or time', () => {
    const stats = ready(); stats.currentTime = '02:00'; stats.soldiers = 0;
    stats.soldierDistribution = { '一楼入口': 0, '二楼阵地': 0, '地下室': 0, '屋顶': 0 };
    const before = structuredClone(stats);
    const preview = getActionPreview(stats, '夜袭');
    expect(preview).toMatchObject({ available: false, durationMinutes: 0 });
    expect(localAdvisorResponse('夜袭', stats).text).toContain('没有可派出的步兵');
    expect(stats).toEqual(before);
    const result = runGameTurn(stats, '夜袭');
    expect({ ...stats, ...result.updatedStats }).toEqual(before);
    expect(result.turnAdvanced).toBe(false);
  });
});

describe('P0 dilemma risk stays aligned with the current shared plan', () => {
  it('discloses actual death caps and morale consequences for student rescue and truck salvage', () => {
    for (const id of ['student_run', 'wrecked_truck']) {
      const stats = pending(id); stats.soldiers = 2;
      const plan = getEventPlan(stats, `evt_resolve:${id}:0`)!;
      expect(plan.available).toBe(true);
      expect(plan.maxDeaths).toBe(2);
      expect(plan.riskText).toContain('2');
      expect(plan.riskText).toContain('每名实际阵亡另损2点士气');
      const result = resolve(stats, id, 0, [0.99]);
      expect(result.updatedStats.soldiers).toBe(0);
      expect(result.updatedStats.morale).toBe(stats.morale - 4);
    }
  });

  it('describes and settles ground recovery separately from the high package, without phantom medicine loss', () => {
    const stats = pending('stray_airdrop');
    const ground = resolve(stats, 'stray_airdrop', 1, [0.9]);
    expect(ground.updatedStats.sandbags).toBe(stats.sandbags + R.groundRecovery.materialsReward);
    expect(ground.updatedStats.medkits).toBeUndefined();
    expect(ground.updatedStats.soldiers).toBeUndefined();
    expect(getEventPlan(stats, 'evt_resolve:stray_airdrop:1')?.minutes).toBe(R.groundRecovery.minutes);
    const climbed = resolve(stats, 'stray_airdrop', 0, [0.9]);
    expect(climbed.updatedStats.medkits).toBe(stats.medkits + R.package.medkitsReward);
    expect(climbed.updatedStats.sandbags).toBe(stats.sandbags + R.package.materialsReward);
    const fallen = resolve(stats, 'stray_airdrop', 0, [0.1]);
    expect(fallen.updatedStats.soldiers).toBe(stats.soldiers - 1);
    expect(fallen.updatedStats.morale).toBe(stats.morale - 5);
    expect(fallen.updatedStats.medkits).toBeUndefined();
    expect(fallen.updatedStats.sandbags).toBeUndefined();
  });

  it('uses actual mortality and morale when student rescue and salvage resolve', () => {
    const students = pending('student_run');
    const rescued = resolve(students, 'student_run', 0, [0.5]);
    expect(rescued.updatedStats.soldiers).toBe(students.soldiers - 8);
    expect(rescued.updatedStats.morale).toBe(students.morale - 16);
    expect(rescued.updatedStats.medkits).toBe(students.medkits + R.student.medkitsReward);
    expect(rescued.updatedStats.ammo).toBe(students.ammo - R.student.ammo);
    const zero = resolve(students, 'student_run', 0, [0]);
    expect(zero.updatedStats.soldiers).toBe(students.soldiers);
    expect(zero.updatedStats.morale).toBeUndefined();
    const truck = pending('wrecked_truck');
    for (const [roll, deaths] of [[0, 1], [0.99, 5]]) {
      const result = resolve(truck, 'wrecked_truck', 0, [roll]);
      expect(result.updatedStats.soldiers).toBe(truck.soldiers - deaths);
      expect(result.updatedStats.ammo).toBe(truck.ammo + R.truck.ammoReward);
      expect(result.updatedStats.morale).toBe(truck.morale - deaths * 2);
    }
  });
});

describe('P0 trade protection with owned, restorable current events', () => {
  it('keeps an unaffordable trade pending and disabled through a save/load round-trip', () => {
    const stats = pending('smuggler_return', R.returnBoat.ammo - 1);
    const before = structuredClone(stats);
    const result = runGameTurn(stats, 'EVT_RESOLVE:smuggler_return:0');
    const after = { ...stats, ...result.updatedStats };
    expect(after).toEqual(before);
    expect(result.dilemma?.options[0].available).toBe(false);
    expect(result.dilemma?.options[0].unavailableReason).toContain('当前只有299发');
    const loaded = migrateSaveData({ schemaVersion: SAVE_SCHEMA_VERSION, stats: after })!.stats;
    expect(loaded).toEqual(before);
    const shown = presentEvent(loaded, getEvent('smuggler_return')!);
    const html = renderToStaticMarkup(createElement(DilemmaModal, {
      dilemma: shown, stats: loaded, onChoice: () => undefined, onSaveExit: () => undefined,
    }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('当前只有299发');
    expect(loaded.consequenceFlags).not.toContain('smuggler_network_resolved');
  });

  it('pays exactly the affordable trade once and keeps the real fifteen-minute pipeline', () => {
    const stats = pending('smuggler_return', R.returnBoat.ammo);
    expect(getEventPlan(stats, 'evt_resolve:smuggler_return:0')?.available).toBe(true);
    const result = runGameTurn(stats, 'EVT_RESOLVE:smuggler_return:0');
    const after = { ...stats, ...result.updatedStats, turnCount: stats.turnCount + 1 };
    expect(after.ammo).toBe(0);
    expect(after.machineGunAmmo).toBe(stats.machineGunAmmo + R.returnBoat.machineGunAmmoReward);
    expect(after.pendingDilemmaId).toBeNull();
    expect(after.consequenceFlags).toContain('smuggler_network_resolved');
    expect(after.currentTime).toBe('10:15');
    expect(result.summary?.durationMinutes).toBe(R.returnBoat.minutes);
    const replay = runGameTurn(after, 'EVT_RESOLVE:smuggler_return:0');
    expect({ ...after, ...replay.updatedStats }).toEqual(after);
  });

  it('allows an explicit refusal without paying or inventing a shipment', () => {
    const stats = pending('smuggler_return', 0);
    const result = runGameTurn(stats, 'EVT_RESOLVE:smuggler_return:1');
    expect(result.updatedStats.consequenceFlags).toContain('smuggler_network_resolved');
    expect(result.updatedStats.machineGunAmmo).toBeUndefined();
    expect(result.updatedStats.ammo).toBeUndefined();
    expect(result.turnAdvanced).toBe(false);
    expect(result.narrative).toContain('没有卸货');
  });
});
