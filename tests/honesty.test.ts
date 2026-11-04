import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DilemmaModal from '../components/DilemmaModal';
import { raidSuccessTexts } from '../data/text/combat';
import { ALL_DILEMMAS, presentDilemma, SMUGGLER_COVER_AMMO_COST, SMUGGLER_COVER_MG_GAIN } from '../data/text/events';
import { resolvePlayerAction } from '../engine/actions/resolvePlayerAction';
import { resolveDilemma } from '../engine/dilemmaResolver';
import { runGameTurn } from '../engine/gameEngine';
import { createInitialStats } from '../storage/saveStore';
import type { GameStats } from '../types';

const ZERO_CASUALTY_CLAIM = /无一人伤亡|全身而退|干净利落/;

const scripted = (values: number[]) => {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };
};

const dilemmaOption = (id: string, index: number) => {
  const dilemma = ALL_DILEMMAS.find((event) => event.id === id);
  if (!dilemma) throw new Error(`missing dilemma ${id}`);
  const option = dilemma.options[index];
  if (!option) throw new Error(`missing option ${id}:${index}`);
  return option;
};

const ready = (): GameStats => {
  const stats = createInitialStats(21);
  stats.tutorialStep = 3;
  stats.day = 3;
  return stats;
};

describe('night raid success copy', () => {
  it('keeps zero-casualty lines out of any resolution that killed soldiers', () => {
    for (let deaths = 1; deaths <= 5; deaths += 1) {
      expect(raidSuccessTexts(deaths).length).toBeGreaterThan(0);
      for (const text of raidSuccessTexts(deaths)) {
        expect(text, text).not.toMatch(ZERO_CASUALTY_CLAIM);
      }
    }
    expect(raidSuccessTexts(0).some((text) => ZERO_CASUALTY_CLAIM.test(text))).toBe(true);
  });

  it('does not narrate a clean escape when the assault actually lost men', () => {
    const stats = createInitialStats(11);
    stats.currentTime = '02:00';
    for (const pickRoll of [0, 0.2, 0.45, 0.7, 0.99]) {
      const result = resolvePlayerAction(stats, '夜袭', scripted([0, 0.9, 0, 0, 0.99, pickRoll]));
      const died = stats.soldiers - (result.updatedStats.soldiers ?? stats.soldiers);
      expect(died).toBeGreaterThan(0);
      const line = result.narrative.at(-1) ?? '';
      expect(raidSuccessTexts(died)).toContain(line);
      expect(line).not.toMatch(ZERO_CASUALTY_CLAIM);
      expect(result.logs.some((log) => log.includes(`阵亡: ${died}人`))).toBe(true);
    }
  });

  it('can still say the force got out clean when nobody died', () => {
    const stats = createInitialStats(12);
    stats.currentTime = '02:00';
    const clean = resolvePlayerAction(stats, '夜袭', scripted([0, 0, 0, 0, 0]));
    expect(clean.updatedStats.soldiers).toBe(stats.soldiers);
    expect(clean.narrative[0]).toMatch(ZERO_CASUALTY_CLAIM);
    expect(clean.logs.some((log) => log.includes('阵亡'))).toBe(false);
  });
});

describe('dilemma risk text', () => {
  it('includes the morale loss student rescue and the truck salvage actually apply', () => {
    expect(dilemmaOption('student_run', 0).riskText).toBe('七九弹最多-600 | 急救包+10 | 阵亡0-15人 | 士气-阵亡×2 | 建立民间支援线');
    expect(dilemmaOption('wrecked_truck', 0).riskText).toBe('七九弹+2000 | 阵亡1-5人 | 士气-阵亡×2');
  });

  it('describes the shot-down airdrop as sandbags, not a halved supply drop', () => {
    expect(dilemmaOption('stray_airdrop', 1).riskText).toBe('仅工事材料+50 | 药品损毁 | 无人伤亡');
    expect(dilemmaOption('stray_airdrop', 0).riskText).toBe('成功：急救包+5、工事材料+100、士气+5 | 坠亡：阵亡1人、士气-5、无物资');
    expect(dilemmaOption('smuggler_return', 0).riskText).toContain('不足300');
    expect(dilemmaOption('smuggler_return', 0).riskText).toContain('水路未了结');
  });

  it('cuts morale with student and truck deaths, and grants only sandbags for a shot-down crate', () => {
    const students = ready();
    const rescue = resolveDilemma(students, 'student_run', 0, scripted([0.5]), () => undefined);
    expect(students.soldiers - (rescue.updatedStats.soldiers ?? students.soldiers)).toBe(8);
    expect(rescue.updatedStats.morale).toBe(students.morale - 16);
    expect(rescue.updatedStats.medkits).toBe(students.medkits + 10);
    expect(rescue.updatedStats.ammo).toBe(students.ammo - 600);

    const unscathed = resolveDilemma(students, 'student_run', 0, scripted([0]), () => undefined);
    expect(unscathed.updatedStats.soldiers).toBe(students.soldiers);
    expect(unscathed.updatedStats.morale).toBeUndefined();

    const truck = ready();
    const light = resolveDilemma(truck, 'wrecked_truck', 0, scripted([0]), () => undefined);
    expect(truck.soldiers - (light.updatedStats.soldiers ?? truck.soldiers)).toBe(1);
    expect(light.updatedStats.ammo).toBe(truck.ammo + 2000);
    expect(light.updatedStats.morale).toBe(truck.morale - 2);
    const heavy = resolveDilemma(truck, 'wrecked_truck', 0, scripted([0.99]), () => undefined);
    expect(truck.soldiers - (heavy.updatedStats.soldiers ?? truck.soldiers)).toBe(5);
    expect(heavy.updatedStats.morale).toBe(truck.morale - 10);

    const crate = ready();
    const shot = resolveDilemma(crate, 'stray_airdrop', 1, scripted([0.9]), () => undefined);
    expect(shot.updatedStats.sandbags).toBe(crate.sandbags + 50);
    expect(shot.updatedStats.medkits).toBeUndefined();
    expect(shot.updatedStats.ammo).toBeUndefined();
    expect(shot.updatedStats.morale).toBeUndefined();
    expect(shot.updatedStats.soldiers).toBeUndefined();

    const climbed = resolveDilemma(crate, 'stray_airdrop', 0, scripted([0.31]), () => undefined);
    expect(climbed.updatedStats.medkits).toBe(crate.medkits + 5);
    expect(climbed.updatedStats.sandbags).toBe(crate.sandbags + 100);
    expect(climbed.updatedStats.morale).toBe(Math.min(100, crate.morale + 5));

    const fallen = resolveDilemma(crate, 'stray_airdrop', 0, scripted([0.3]), () => undefined);
    expect(fallen.updatedStats.soldiers).toBe(crate.soldiers - 1);
    expect(fallen.updatedStats.morale).toBe(crate.morale - 5);
    expect(fallen.updatedStats.medkits).toBeUndefined();
    expect(fallen.updatedStats.sandbags).toBeUndefined();
  });
});

describe('smuggler return ammo', () => {
  const pending = (ammo: number): GameStats => {
    const stats = ready();
    stats.pendingDilemmaId = 'smuggler_return';
    stats.consequenceFlags = ['smuggler_trusted'];
    stats.ammo = ammo;
    return stats;
  };

  it('disables the cover option and does not close the route when rifle ammo is short', () => {
    const source = ALL_DILEMMAS.find((event) => event.id === 'smuggler_return');
    if (!source) throw new Error('missing smuggler_return');
    const stats = pending(SMUGGLER_COVER_AMMO_COST - 1);
    const shown = presentDilemma(source, stats.ammo);
    expect(shown.options[0]?.disabled).toBe(true);
    expect(shown.options[0]?.riskText).toBe(`七九弹不足${SMUGGLER_COVER_AMMO_COST}，无法成交`);
    expect(shown.options[0]?.riskText).not.toContain(`机枪弹+${SMUGGLER_COVER_MG_GAIN}`);
    expect(source.options[0]?.disabled).toBeUndefined();

    const result = runGameTurn(stats, 'EVT_RESOLVE:smuggler_return:0');
    const merged = { ...stats, ...result.updatedStats };
    expect(result.updatedStats.ammo).toBeUndefined();
    expect(result.updatedStats.machineGunAmmo).toBeUndefined();
    expect(result.updatedStats.consequenceFlags).toBeUndefined();
    expect(result.updatedStats.triggeredEvents).toBeUndefined();
    expect(merged.consequenceFlags).toEqual(['smuggler_trusted']);
    expect(merged.pendingDilemmaId).toBe('smuggler_return');
    expect(merged.triggeredEvents).not.toContain('smuggler_return');
    expect(merged.ammo).toBe(stats.ammo);
    expect(merged.machineGunAmmo).toBe(stats.machineGunAmmo);
    expect(result.narrative).toContain(`只剩${stats.ammo}发`);
    expect(result.narrative).toContain('没有卸下');
    expect(result.narrative).toContain('尚未了结');
    expect(result.narrative).not.toContain('机枪弹 +');
    expect(result.narrative).not.toContain('你拒绝');
    expect(result.dilemma?.id).toBe('smuggler_return');
    expect(result.dilemma?.options[0]?.disabled).toBe(true);
    const html = renderToStaticMarkup(createElement(DilemmaModal, {
      dilemma: result.dilemma!,
      onChoice: () => { throw new Error('disabled cover option must not be submitted'); },
    }));
    expect(html).toContain('disabled=""');
    expect(html).toContain(`七九弹不足${SMUGGLER_COVER_AMMO_COST}，无法成交`);
    expect(html).not.toContain(`机枪弹+${SMUGGLER_COVER_MG_GAIN}`);
  });

  it('spends the rifle ammo and closes the route when the cover can be paid', () => {
    const source = ALL_DILEMMAS.find((event) => event.id === 'smuggler_return');
    if (!source) throw new Error('missing smuggler_return');
    const stats = pending(SMUGGLER_COVER_AMMO_COST);
    const shown = presentDilemma(source, stats.ammo);
    expect(shown.options[0]?.disabled).toBe(false);
    expect(shown.options[0]?.riskText).toBe(`机枪弹+${SMUGGLER_COVER_MG_GAIN} | 七九弹-${SMUGGLER_COVER_AMMO_COST}`);

    const result = runGameTurn(stats, 'EVT_RESOLVE:smuggler_return:0');
    expect(result.updatedStats.ammo).toBe(0);
    expect(result.updatedStats.machineGunAmmo).toBe(stats.machineGunAmmo + SMUGGLER_COVER_MG_GAIN);
    expect(result.updatedStats.consequenceFlags).toContain('smuggler_network_resolved');
    expect(result.updatedStats.triggeredEvents).toContain('smuggler_return');
    expect(result.updatedStats.pendingDilemmaId).toBeNull();
    expect(result.narrative).toContain(`机枪弹 +${SMUGGLER_COVER_MG_GAIN}`);
  });

  it('still lets the commander refuse the route without paying', () => {
    const result = runGameTurn(pending(0), 'EVT_RESOLVE:smuggler_return:1');
    expect(result.updatedStats.consequenceFlags).toContain('smuggler_network_resolved');
    expect(result.updatedStats.machineGunAmmo).toBeUndefined();
    expect(result.updatedStats.ammo).toBeUndefined();
    expect(result.narrative).toContain('拒绝');
  });
});
