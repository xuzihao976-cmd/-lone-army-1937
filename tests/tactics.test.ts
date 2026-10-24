import { describe, expect, it } from 'vitest';
import { TACTICS, makeTactic, tacticCommand } from '../data/tactics';
import { createInitialStats, migrateSaveData, SAVE_SCHEMA_VERSION } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { getTacticPlan } from '../engine/tacticPlans';
import { localAdvisorResponse } from '../engine/localAdvisor';
import { eligibleBattlefieldEncounters } from '../engine/tacticalCards';
import { TACTICAL_CARDS } from '../data/text/events';
import type { ChapterId, GameStats, TacticId } from '../types';

const apply = (stats: GameStats, input: string) => {
  const result = runGameTurn(stats, input);
  return { result, stats: { ...stats, ...result.updatedStats, turnCount: stats.turnCount + (result.turnAdvanced ? 1 : 0) } };
};
const ready = (id: TacticId): GameStats => {
  const chapter = TACTICS.find(t => t.id === id)!.chapterId;
  const stats = createInitialStats(1937, chapter, id);
  stats.tutorialStep = 3;
  if (chapter === 'sihang') {
    stats.day = 3; stats.currentTime = '10:00'; stats.enemyOperation = null;
    stats.wounded = 5; stats.sectorIntegrity['一楼入口'] = 50;
  } else Object.assign(stats.mission!, { started: true, recon: true, route: chapter === 'street' ? 'inner' : null,
    found: chapter === 'street' ? 8 : 0, crossed: chapter === 'bridge' ? 40 : 0 });
  return stats;
};
const world = ({ localDialogue, pendingRetreat, ...stats }: GameStats) => stats;

describe('chapter tactics', () => {
  it('explains each card locally before generic action rules and does not execute it', () => {
    for (const card of TACTICS) {
      const stats = ready(card.id), before = structuredClone(stats);
      const input = `${card.title}怎么用？`;
      const advisor = localAdvisorResponse(input, stats);
      expect(advisor.known).toBe(true);
      expect(advisor.text).toContain(card.effect);
      expect(advisor.text).toContain(card.tradeoff);
      const reply = apply(stats, input);
      expect(reply.result.narrative).toContain(card.effect);
      expect(world(reply.stats)).toEqual(world(stats));
      expect(stats).toEqual(before);
    }
  });
  it('keeps chapter loadouts independent and migrates old saves without a free card', () => {
    expect(() => makeTactic('urgent_aid', 'street')).toThrow();
    const old = ready('group_escort');
    const { equippedTactic, ...legacy } = old;
    expect(migrateSaveData({ schemaVersion: 11, stats: legacy })?.stats.equippedTactic).toBeNull();
    const before = structuredClone(old);
    expect(migrateSaveData({ stats: old })?.stats.equippedTactic).toEqual({ id: 'group_escort', spent: false });
    old.equippedTactic!.spent = true;
    expect(migrateSaveData({ schemaVersion: SAVE_SCHEMA_VERSION, stats: old })?.stats.equippedTactic?.spent).toBe(true);
    expect(before.equippedTactic?.spent).toBe(false);
    expect(migrateSaveData({ stats: { ...old, equippedTactic: { id: 'urgent_aid', spent: false } } })).toBeNull();
    expect(migrateSaveData({ stats: { ...old, equippedTactic: { id: 'group_escort' } } })).toBeNull();
    expect(migrateSaveData({ stats: old, schemaVersion: SAVE_SCHEMA_VERSION + 1 })).toBeNull();
  });

  it.each(TACTICS)('executes $title once, with real time, then rejects replay and an unowned card', tactic => {
    let stats = ready(tactic.id);
    const command = tacticCommand(tactic.id);
    const forged = apply({ ...stats, equippedTactic: null }, command);
    expect(world(forged.stats)).toEqual(world({ ...stats, equippedTactic: null }));
    const preview = getActionPreview(stats, command)!;
    if (tactic.id === 'covered_withdrawal') stats = apply(stats, command).stats;
    const executed = apply(stats, tactic.id === 'covered_withdrawal' ? 'confirm_tactic_retreat' : command);
    expect(executed.result.turnAdvanced).toBe(true);
    expect(executed.stats.equippedTactic).toEqual({ id: tactic.id, spent: true });
    expect(executed.result.summary?.durationMinutes).toBe(tactic.id === 'covered_withdrawal' ? 30 : preview.durationMinutes);
    const replay = apply(executed.stats, command);
    expect(replay.result.turnAdvanced).not.toBe(true);
    expect(world(replay.stats)).toEqual(world(executed.stats));
  });

  it.each(TACTICS)('keeps previews, advisor and unsafe expressions read-only for $title', tactic => {
    const stats = ready(tactic.id);
    const before = structuredClone(stats);
    getActionPreview(stats, tacticCommand(tactic.id));
    expect(localAdvisorResponse(`使用${tactic.title}`, stats).text).toContain('尚未执行');
    expect(stats).toEqual(before);
    for (const input of [`不要使用${tactic.title}`, `“使用${tactic.title}”`, `如果安全就使用${tactic.title}`,
      `我刚才说使用${tactic.title}`, `使用${tactic.title}然后休息`, `“${tacticCommand(tactic.id)}”`,
      `tactic_use:${tactic.id}:屋顶:额外`, 'constructor', 'toString', '__proto__', `使用${tactic.title}` + '啊'.repeat(600)]) {
      expect(world(apply(stats, input).stats), input).toEqual(world(stats));
    }
  });

  it('separates grouped escort capacity from discovery and checks extra ammunition', () => {
    const stats = ready('group_escort');
    const next = apply(stats, tacticCommand('group_escort')).stats;
    expect(next.mission!.evacuated).toBe(8);
    expect(next.mission!.found).toBe(8);
    expect(next.ammo).toBe(stats.ammo - 20);
    expect(next.siegeMeter - stats.siegeMeter).toBe(26);
    for (const partial of [{ ammo: 19 }, { mission: { ...stats.mission!, found: 6 } }, { mission: { ...stats.mission!, recon: false, route: null } }]) {
      const blocked = { ...stats, ...partial };
      expect(world(apply(blocked, tacticCommand('group_escort')).stats)).toEqual(world(blocked));
    }
  });

  it('trades extra escort time for pressure reduction without stopping the deadline', () => {
    const stats = ready('wall_hug');
    const next = apply(stats, tacticCommand('wall_hug')).stats;
    expect(next.mission!.elapsedMinutes).toBe(35);
    expect(next.siegeMeter - stats.siegeMeter).toBe(3);
    const late = { ...stats, mission: { ...stats.mission!, elapsedMinutes: 150 } };
    expect(getActionPreview(late, tacticCommand('wall_hug'))?.risk).toBe('critical');
    expect(apply(late, tacticCommand('wall_hug')).stats.gameResult).toBe('defeat_mission');
  });

  it('moves real bridge traffic within caps and charges extra ammunition and fatigue', () => {
    const stats = ready('rapid_crossing');
    const next = apply(stats, tacticCommand('rapid_crossing')).stats;
    expect(next.mission!.crossed).toBe(60);
    expect(next.mission!.elapsedMinutes).toBe(20);
    expect(next.ammo).toBe(stats.ammo - 60);
    expect(next.fatigue).toBe(stats.fatigue + 10);
    expect(next.isGameOver).toBe(false);
    for (const crossed of [50, 55, 60]) {
      const blocked = { ...stats, mission: { ...stats.mission!, crossed } };
      expect(getTacticPlan(blocked, tacticCommand('rapid_crossing'))?.available).toBe(false);
      expect(world(apply(blocked, tacticCommand('rapid_crossing')).stats)).toEqual(world(blocked));
    }
  });

  it('keeps tactical retreat pending until confirmed, cancellable and subject to the exact deadline', () => {
    const stats = ready('covered_withdrawal'); stats.mission!.crossed = 60;
    const pending = apply(stats, tacticCommand('covered_withdrawal')).stats;
    expect(pending.equippedTactic?.spent).toBe(false);
    expect(pending.mission!.elapsedMinutes).toBe(0);
    expect(pending.pendingRetreat).toBe('confirm_tactic_retreat');
    expect(getActionPreview(pending, '确认交替撤离')?.durationMinutes).toBe(30);
    expect(world(apply(pending, 'cancel_retreat').stats)).toEqual(world(stats));
    expect(world(apply(stats, 'confirm_tactic_retreat').stats)).toEqual(world(stats));
    const late = { ...stats, mission: { ...stats.mission!, elapsedMinutes: 150 } };
    const end = apply(apply(late, tacticCommand('covered_withdrawal')).stats, 'confirm_tactic_retreat').stats;
    expect(end.mission!.elapsedMinutes).toBe(180);
    expect(end.gameResult).toBe('defeat_mission');
    const ordinary = apply(apply(late, '组织撤离').stats, 'confirm_chapter_retreat').stats;
    expect(ordinary.gameResult).toBe('victory_cover');
  });

  it('reduces extraction contact casualties without immunity or resuscitating named soldiers', () => {
    const tactical = ready('covered_withdrawal');
    tactical.mission!.crossed = 60; tactical.siegeMeter = 60;
    const ordinary = { ...structuredClone(tactical), equippedTactic: null };
    const a = apply(apply(tactical, tacticCommand('covered_withdrawal')).stats, 'confirm_tactic_retreat').stats;
    const b = apply(apply(ordinary, '组织撤离').stats, 'confirm_chapter_retreat').stats;
    expect(a.soldiers - b.soldiers).toBe(2);
    expect(a.wounded + a.soldiers).toBeGreaterThanOrEqual(b.wounded + b.soldiers);
  });

  it('repairs only a controlled damaged sector, with materials but without raising fortifications', () => {
    const stats = ready('emergency_shoring'); stats.sectorIntegrity['一楼入口'] = 96;
    const next = apply(stats, tacticCommand('emergency_shoring', '一楼入口')).stats;
    expect(next.sectorIntegrity['一楼入口']).toBe(100);
    expect(next.sandbags).toBe(stats.sandbags - 100);
    expect(next.fortificationLevel).toEqual(stats.fortificationLevel);
    for (const partial of [{ sandbags: 99 }, { sectorIntegrity: { ...stats.sectorIntegrity, '一楼入口': 0 } },
      { sectorIntegrity: { ...stats.sectorIntegrity, '一楼入口': 100 } }]) {
      const blocked = { ...stats, ...partial };
      expect(world(apply(blocked, tacticCommand('emergency_shoring')).stats)).toEqual(world(blocked));
    }
  });

  it('advances real enemy contact when a warehouse tactic is executed and matches its preview', () => {
    const stats = ready('emergency_shoring');
    stats.location = '地下室';
    stats.enemyOperation = { ...createInitialStats(1937).enemyOperation!, revealed: true, turnsRemaining: 1 };
    const command = tacticCommand('emergency_shoring', '一楼入口');
    const preview = getActionPreview(stats, command)!;
    expect(preview.attackChance).toBe(1);
    const next = apply(stats, command);
    expect(next.result.eventTriggered).toBe('attack');
    expect(next.stats.equippedTactic?.spent).toBe(true);
    expect(next.result.summary?.durationMinutes).toBe(preview.durationMinutes);
    expect(next.stats.rngState).not.toBe(stats.rngState);
  });

  it('charges two medkits per actually treated person and still needs the hospital', () => {
    const stats = ready('urgent_aid'); stats.medkits = 3;
    const next = apply(stats, tacticCommand('urgent_aid')).stats;
    expect(next.soldiers).toBe(stats.soldiers + 1);
    expect(next.wounded).toBe(stats.wounded - 1);
    expect(next.medkits).toBe(1);
    for (const partial of [{ medkits: 1 }, { wounded: 0 }, { sectorIntegrity: { ...stats.sectorIntegrity, '地下室': 0 } }]) {
      const blocked = { ...stats, ...partial };
      expect(world(apply(blocked, tacticCommand('urgent_aid')).stats)).toEqual(world(blocked));
    }
  });

  it('ties new encounters to their sources while preserving a legacy opportunity and safe decline', () => {
    const stats = createInitialStats(11);
    stats.day = 1; stats.tutorialStep = 3;
    expect(eligibleBattlefieldEncounters(stats, 'rest').map(c => c.id)).toEqual(['morale_boost']);
    expect(eligibleBattlefieldEncounters(stats, 'scavenge').map(c => c.id)).toContain('supplies');
    expect(eligibleBattlefieldEncounters(stats, 'recon').map(c => c.id)).toContain('reinforce');
    expect(eligibleBattlefieldEncounters({ ...stats, day: 3 }, 'recon').map(c => c.id)).not.toContain('reinforce');
    stats.activeTacticalCard = TACTICAL_CARDS[2]; stats.usedTacticalCards = ['supplies']; stats.day = 3;
    const loaded = migrateSaveData({ schemaVersion: 10, stats })!.stats;
    expect(apply(loaded, 'CARD_RESOLVE:supplies:extra').stats.ammo).toBe(stats.ammo);
    expect(apply(loaded, 'CARD_RESOLVE:supplies').stats.ammo).toBe(stats.ammo + 500);
    const declined = apply(loaded, 'encounter_skip').stats;
    expect(declined.activeTacticalCard).toBeNull();
    expect(declined.ammo).toBe(stats.ammo);
    expect(apply(declined, 'CARD_RESOLVE:supplies').stats.ammo).toBe(stats.ammo);
    expect(eligibleBattlefieldEncounters(declined, 'scavenge').map(c => c.id)).not.toContain('supplies');
  });
});
