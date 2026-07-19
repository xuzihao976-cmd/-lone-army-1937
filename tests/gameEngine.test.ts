import { describe, expect, it } from 'vitest';
import { runGameTurn } from '../engine/gameEngine';
import { createInitialStats } from '../storage/saveStore';
import type { GameStats } from '../types';

const applyTurnUpdate = (stats: GameStats, update: Partial<GameStats>): GameStats => ({
  ...stats,
  ...update,
  fortificationLevel: { ...stats.fortificationLevel, ...(update.fortificationLevel ?? {}) },
  fortificationBuildCounts: { ...stats.fortificationBuildCounts, ...(update.fortificationBuildCounts ?? {}) },
  sectorIntegrity: { ...stats.sectorIntegrity, ...(update.sectorIntegrity ?? {}) },
});

describe('local game engine endings', () => {
  it('advances turns only for actions that consume battlefield time', () => {
    const stats = createInitialStats(79);
    stats.tutorialStep = 3;
    stats.location = '一楼入口';

    expect(runGameTurn(stats, '询问当前情况').turnAdvanced).toBe(false);
    expect(runGameTurn(stats, 'cancel_retreat').turnAdvanced).toBeUndefined();
    expect(runGameTurn(stats, '升旗').turnAdvanced).toBe(false);
    expect(runGameTurn(stats, '侦察敌情').turnAdvanced).toBe(true);
  });

  it('resolves tactical cards with the exact advertised effects', () => {
    const moraleStats = createInitialStats(80);
    moraleStats.tutorialStep = 3;
    moraleStats.morale = 50;
    const morale = runGameTurn(moraleStats, 'CARD_RESOLVE:morale_boost');
    expect(morale.updatedStats.morale).toBe(65);
    expect(morale.updatedStats.activeTacticalCard).toBeNull();
    expect(morale.updatedStats.currentTime).toBeUndefined();

    const reinforceStats = createInitialStats(81);
    reinforceStats.tutorialStep = 3;
    reinforceStats.location = '二楼阵地';
    const reinforce = runGameTurn(reinforceStats, 'CARD_RESOLVE:reinforce');
    expect(reinforce.updatedStats.soldiers).toBe(reinforceStats.soldiers + 5);
    expect(reinforce.updatedStats.soldierDistribution?.['二楼阵地']).toBe(reinforceStats.soldierDistribution['二楼阵地'] + 5);

    const supplyStats = createInitialStats(82);
    supplyStats.tutorialStep = 3;
    const supply = runGameTurn(supplyStats, 'CARD_RESOLVE:supplies');
    expect(supply.updatedStats.ammo).toBe(supplyStats.ammo + 500);
  });

  it('turns event choices into persistent, mechanical consequences', () => {
    const students = createInitialStats(83);
    students.tutorialStep = 3;
    const rescue = runGameTurn(students, 'EVT_RESOLVE:student_run:0');
    expect(rescue.updatedStats.consequenceFlags).toContain('students_rescued');
    expect(rescue.updatedStats.ammo).toBe(students.ammo - 600);
    expect(rescue.updatedStats.campaignHistory?.some((entry) => entry.title === '学生冲桥')).toBe(true);
    expect(Object.values(rescue.updatedStats.soldierDistribution || {}).reduce((sum, count) => sum + count, 0))
      .toBe(rescue.updatedStats.soldiers);

    const british = createInitialStats(84);
    british.tutorialStep = 3;
    const defiance = runGameTurn(british, 'EVT_RESOLVE:brit_ceasefire:1');
    expect(defiance.updatedStats.consequenceFlags).toContain('british_defied');
    expect(defiance.updatedStats.enemyOperation?.target).toBe('地下室');
    expect(defiance.updatedStats.enemyOperation?.turnsRemaining).toBeLessThan(british.enemyOperation!.turnsRemaining);
  });

  it('uses scouting to reveal a turn-based enemy operation and improve a raid', () => {
    const stats = createInitialStats(85);
    stats.tutorialStep = 3;
    stats.siegeMeter = 0;
    stats.enemyOperation!.turnsRemaining = 3;
    const result = runGameTurn(stats, '侦察敌情');
    expect(result.updatedStats.enemyOperation?.revealed).toBe(true);
    expect(result.updatedStats.enemyOperation?.turnsRemaining).toBe(2);
    expect(result.updatedStats.reconBonus).toBe(20);
    expect(result.narrative).toContain('敌情确证');
  });

  it('advances enemy formations once per meaningful action and attacks at contact', () => {
    const stats = createInitialStats(86);
    stats.tutorialStep = 3;
    stats.siegeMeter = 0;
    stats.enemyOperation!.turnsRemaining = 2;
    stats.location = '地下室';
    const first = runGameTurn(stats, '前往屋顶');
    expect(first.eventTriggered).not.toBe('attack');
    expect(first.updatedStats.enemyOperation?.turnsRemaining).toBe(1);

    const progressed = { ...stats, ...first.updatedStats, turnCount: stats.turnCount + 1 };
    const second = runGameTurn(progressed, '前往二楼');
    expect(second.eventTriggered).toBe('attack');
    expect(second.attackLocation).toBe('一楼入口');
  });

  it('makes specialist squads matter without adding phantom soldiers', () => {
    const stats = createInitialStats(87);
    stats.tutorialStep = 3;
    stats.siegeMeter = 0;
    stats.sectorIntegrity['一楼入口'] = 70;
    const beforeTotal = stats.soldiers;
    const build = runGameTurn(stats, '加固一楼入口');
    expect(build.updatedStats.sandbags).toBe(stats.sandbags - 170);
    expect(build.updatedStats.sectorIntegrity?.['一楼入口']).toBe(94);
    expect(build.updatedStats.soldiers).toBeUndefined();

    const redeploy = runGameTurn(stats, '部署小队湖北老兵班至屋顶');
    expect(redeploy.updatedStats.specialistSquads?.find((squad) => squad.id === 'veteran')?.location).toBe('屋顶');
    expect(stats.soldiers).toBe(beforeTotal);
  });

  it('applies diminishing returns to repeated speeches and searches', () => {
    const stats = createInitialStats(88);
    stats.tutorialStep = 3;
    stats.siegeMeter = 0;
    stats.morale = 40;
    stats.enemyOperation!.turnsRemaining = 5;
    const firstSpeech = runGameTurn(stats, '演讲鼓舞');
    expect(firstSpeech.updatedStats.morale).toBe(49);
    const afterSpeech = { ...stats, ...firstSpeech.updatedStats, turnCount: 1 };
    const secondSpeech = runGameTurn(afterSpeech, '演讲鼓舞');
    expect(secondSpeech.updatedStats.morale).toBe(55);

    const search = runGameTurn(stats, '搜寻物资');
    expect(search.updatedStats.searchExhaustion).toBe(1);
  });

  it('keeps the tutorial fortification after the real battle begins', () => {
    const initial = createInitialStats(1937);
    const started = applyTurnUpdate(initial, runGameTurn(initial, 'start_game').updatedStats);
    const fortified = applyTurnUpdate(started, runGameTurn(started, '加固一楼').updatedStats);

    expect(fortified.tutorialStep).toBe(2);
    expect(fortified.fortificationLevel['一楼入口']).toBe(2);
    expect(fortified.fortificationBuildCounts['一楼入口']).toBe(4);

    const formal = applyTurnUpdate(fortified, runGameTurn(fortified, '休息整顿').updatedStats);
    expect(formal.tutorialStep).toBe(3);
    expect(formal.day).toBe(1);
    expect(formal.fortificationLevel['一楼入口']).toBe(2);
    expect(formal.fortificationBuildCounts['一楼入口']).toBe(4);

    formal.siegeMeter = 0;
    const nextBuild = applyTurnUpdate(formal, runGameTurn(formal, '加固一楼').updatedStats);
    expect(nextBuild.fortificationLevel['一楼入口']).toBe(2);
    expect(nextBuild.fortificationBuildCounts['一楼入口']).toBe(5);
  });

  it('only accepts fortifying the first floor for tutorial step one', () => {
    const initial = createInitialStats(1937);
    const started = applyTurnUpdate(initial, runGameTurn(initial, 'start_game').updatedStats);
    const wrongFloor = runGameTurn(started, '加固屋顶');

    expect(wrongFloor.updatedStats.tutorialStep).toBeUndefined();
    expect(wrongFloor.narrative).toContain('加固');
    expect(wrongFloor.narrative).toContain('1/2');
  });

  it('skips the tutorial without putting returning players at a disadvantage', () => {
    const initial = createInitialStats(1937);
    const started = applyTurnUpdate(initial, runGameTurn(initial, 'start_game').updatedStats);
    const skipped = applyTurnUpdate(started, runGameTurn(started, 'skip_tutorial').updatedStats);

    expect(skipped.tutorialStep).toBe(3);
    expect(skipped.day).toBe(1);
    expect(skipped.currentTime).toBe('08:00');
    expect(skipped.fortificationLevel['一楼入口']).toBe(2);
    expect(skipped.fortificationBuildCounts['一楼入口']).toBe(4);
    expect(skipped.morale).toBe(95);
  });

  it('requires confirmation before an early retreat ending', () => {
    const stats = createInitialStats();
    stats.tutorialStep = 3;
    stats.day = 1;

    const warning = runGameTurn(stats, '全军撤退');
    expect(warning.updatedStats.isGameOver).not.toBe(true);
    expect(warning.dilemma?.id).toBe('confirm_desertion');

    const ending = runGameTurn(stats, 'confirm_desertion');
    expect(ending.updatedStats.isGameOver).toBe(true);
    expect(ending.updatedStats.gameResult).toBe('defeat_deserter');
  });

  it('allows the historical retreat only from day four', () => {
    const early = createInitialStats();
    early.tutorialStep = 3;
    early.day = 2;
    expect(runGameTurn(early, 'confirm_historical_retreat').updatedStats.isGameOver).not.toBe(true);

    const late = createInitialStats();
    late.tutorialStep = 3;
    late.day = 4;
    const warning = runGameTurn(late, '撤入租界');
    expect(warning.dilemma?.id).toBe('confirm_historical_retreat');
    const ending = runGameTurn(late, 'confirm_historical_retreat');
    expect(ending.updatedStats.gameResult).toBe('victory_retreat');
  });

  it('treats walking to the roof as movement, not desertion', () => {
    const stats = createInitialStats();
    stats.tutorialStep = 3;
    stats.day = 1;
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '走到屋顶');
    expect(result.updatedStats.location).toBe('屋顶');
    expect(result.updatedStats.gameResult).not.toBe('defeat_deserter');
    expect(result.dilemma?.id).not.toBe('confirm_desertion');
  });

  it('repeats the same outcome from the same saved random state', () => {
    const stats = createInitialStats(20260719);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '19:00';
    stats.siegeMeter = 0;

    const first = runGameTurn(stats, '搜寻物资');
    const replay = runGameTurn(structuredClone(stats), '搜寻物资');
    expect(replay).toEqual(first);
    expect(first.updatedStats.rngState).not.toBe(stats.rngState);
  });

  it('creates a separate settlement summary after an attack', () => {
    const stats = createInitialStats(1937);
    stats.tutorialStep = 3;
    stats.day = 3;
    stats.currentTime = '19:00';
    stats.siegeMeter = 100;
    stats.enemyOperation!.turnsRemaining = 1;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.eventTriggered).toBe('attack');
    expect(result.summary?.kind).toBe('battle');
    expect(result.summary?.title).toBe('敌军进攻结算');
    expect(result.summary?.notes.some((note) => note.includes('实际减伤'))).toBe(true);
  });

  it('does not spend time or count aggression for a blocked daytime raid', () => {
    const stats = createInitialStats(2026);
    stats.tutorialStep = 3;
    stats.currentTime = '14:00';
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '火力突袭');
    expect(result.updatedStats.currentTime).toBe('14:00');
    expect(result.updatedStats.aggressiveCount).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it('counts active HMG crews in the collapse check', () => {
    const stats = createInitialStats(88);
    stats.tutorialStep = 3;
    stats.soldiers = 10;
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '询问当前情况');
    expect(result.updatedStats.isGameOver).not.toBe(true);
    expect(result.updatedStats.lastStandUsed).not.toBe(true);
  });

  it('gives one explicit last-stand recovery chance before defeat', () => {
    const stats = createInitialStats(99);
    stats.tutorialStep = 3;
    stats.soldiers = 10;
    stats.siegeMeter = 0;
    stats.hmgSquads = stats.hmgSquads.map((squad) => ({ ...squad, status: 'destroyed', count: 0 }));

    const warning = runGameTurn(stats, '询问当前情况');
    expect(warning.updatedStats.isGameOver).not.toBe(true);
    expect(warning.updatedStats.lastStandUsed).toBe(true);
    expect(warning.narrative).toContain('最后防线');

    const doomed = { ...stats, ...warning.updatedStats };
    const ending = runGameTurn(doomed, '询问当前情况');
    expect(ending.updatedStats.isGameOver).toBe(true);
    expect(ending.updatedStats.gameOverReason).toBe('combat_force_collapsed');
  });

  it('does not erase surviving floor garrisons when global structure reaches zero', () => {
    const stats = createInitialStats(100);
    stats.tutorialStep = 3;
    stats.health = 0;
    stats.lastStandUsed = true;
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '询问当前情况');
    expect(result.updatedStats.isGameOver).not.toBe(true);
    expect(result.updatedStats.gameOverReason).toBeUndefined();
    expect(result.narrative).not.toContain('战役结束');
  });

  it('keeps the battle recoverable after only the first floor is lost', () => {
    const stats = createInitialStats(102);
    stats.tutorialStep = 3;
    stats.health = 0;
    stats.lastStandUsed = true;
    stats.siegeMeter = 0;
    stats.soldiers = 60;
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.soldierDistribution = {
      '一楼入口': 0,
      '二楼阵地': 40,
      '屋顶': 10,
      '地下室': 10,
    };
    stats.hmgSquads = stats.hmgSquads.map((squad) => ({ ...squad, status: 'destroyed', count: 0 }));

    const result = runGameTurn(stats, '询问当前情况');
    expect(result.updatedStats.isGameOver).not.toBe(true);
    expect(result.updatedStats.gameOverReason).toBeUndefined();
    expect(result.narrative).not.toContain('战役结束');
  });

  it('does not call surviving flag defenders martyred because of structure damage alone', () => {
    const stats = createInitialStats(101);
    stats.tutorialStep = 3;
    stats.health = 0;
    stats.lastStandUsed = true;
    stats.hasFlagRaised = true;
    stats.siegeMeter = 0;

    const result = runGameTurn(stats, '询问当前情况');
    expect(result.updatedStats.isGameOver).not.toBe(true);
    expect(result.narrative).not.toContain('壮烈殉国');
  });

  it('keeps attack settlement when combat crosses midnight', () => {
    const stats = createInitialStats(1937);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '23:45';
    stats.siegeMeter = 100;
    stats.enemyOperation!.turnsRemaining = 1;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.updatedStats.day).toBe(3);
    expect(result.updatedStats.currentTime).toBe('00:00');
    expect(result.eventTriggered).toBe('attack');
    expect(result.summary?.kind).toBe('battle');
  });

  it('moves infantry and HMG squads through strategic-map commands', () => {
    const stats = createInitialStats(7);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '10:00';
    stats.siegeMeter = 0;

    const infantry = runGameTurn(stats, '调派30人从二楼阵地至屋顶');
    expect(infantry.updatedStats.currentTime).toBe('10:30');
    expect(infantry.updatedStats.soldierDistribution?.['二楼阵地']).toBe(150);
    expect(infantry.updatedStats.soldierDistribution?.['屋顶']).toBeGreaterThan(10);
    expect(Object.values(infantry.updatedStats.soldierDistribution ?? {}).reduce((sum, value) => sum + value, 0))
      .toBe(stats.soldiers);

    const movedStats = { ...stats, ...infantry.updatedStats };
    const hmg = runGameTurn(movedStats, '部署机枪一连至屋顶');
    expect(hmg.updatedStats.currentTime).toBe('10:50');
    expect(hmg.updatedStats.hmgSquads?.find((squad) => squad.name === '机枪一连')?.location).toBe('屋顶');
  });

  it('can kill the commander only when the attacked sector contains the command post', () => {
    let fatal: ReturnType<typeof runGameTurn> | undefined;
    let fatalSeed = 0;
    for (let seed = 1; seed <= 600 && !fatal; seed += 1) {
      const exposed = createInitialStats(seed);
      exposed.tutorialStep = 3;
      exposed.day = 3;
      exposed.currentTime = '23:00';
      exposed.siegeMeter = 100;
      exposed.enemyOperation!.turnsRemaining = 1;
      exposed.location = '一楼入口';
      exposed.fortificationLevel['一楼入口'] = 0;
      exposed.sectorIntegrity['一楼入口'] = 20;
      exposed.soldierDistribution['一楼入口'] = 15;
      exposed.soldierDistribution['二楼阵地'] += 125;
      const candidate = runGameTurn(exposed, '侦察敌情');
      if (candidate.updatedStats.gameOverReason === 'commander_killed') {
        fatal = candidate;
        fatalSeed = seed;
      }
    }

    expect(fatal).toBeDefined();
    if (!fatal) throw new Error('No deterministic commander casualty seed found');
    expect(fatal.attackLocation).toBe('一楼入口');
    expect(fatal.updatedStats.gameResult).toBe('defeat_commander');
    expect(fatal.updatedStats.gameOverReason).toBe('commander_killed');
    expect(fatal.narrative).toContain('将星陨落');

    const sheltered = createInitialStats(fatalSeed);
    sheltered.tutorialStep = 3;
    sheltered.day = 3;
    sheltered.currentTime = '23:00';
    sheltered.siegeMeter = 100;
    sheltered.enemyOperation!.turnsRemaining = 1;
    sheltered.fortificationLevel['一楼入口'] = 0;
    sheltered.sectorIntegrity['一楼入口'] = 20;
    sheltered.soldierDistribution['一楼入口'] = 15;
    sheltered.soldierDistribution['二楼阵地'] += 125;
    sheltered.location = '地下室';
    const survived = runGameTurn(sheltered, '侦察敌情');
    expect(survived.attackLocation).toBe('一楼入口');
    expect(survived.updatedStats.gameOverReason).not.toBe('commander_killed');
  });

  it('loses a breached floor, withdraws its garrison and redirects later attacks', () => {
    const stats = createInitialStats(1);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '10:00';
    stats.siegeMeter = 100;
    stats.enemyOperation!.turnsRemaining = 1;
    stats.location = '地下室';
    stats.sectorIntegrity['一楼入口'] = 1;

    const breach = runGameTurn(stats, '侦察敌情');
    expect(breach.attackLocation).toBe('一楼入口');
    expect(breach.updatedStats.sectorIntegrity?.['一楼入口']).toBe(0);
    expect(breach.updatedStats.soldierDistribution?.['一楼入口']).toBe(0);
    expect(breach.updatedStats.hmgSquads?.some((squad) => squad.status === 'active' && squad.location === '一楼入口')).toBe(false);
    expect(breach.narrative).toContain('防区失守：一楼入口');

    const afterBreach = { ...stats, ...breach.updatedStats, currentTime: '23:00', siegeMeter: 100, turnCount: 2, lastAttackTurn: 1 };
    if (afterBreach.enemyOperation) afterBreach.enemyOperation.turnsRemaining = 1;
    const nextAttack = runGameTurn(afterBreach, '侦察敌情');
    expect(['二楼阵地', '地下室']).toContain(nextAttack.attackLocation);
    expect(nextAttack.attackLocation).not.toBe('一楼入口');
  });

  it('withdraws the command post automatically when its floor falls and the commander survives', () => {
    const stats = createInitialStats(1);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '23:00';
    stats.siegeMeter = 100;
    stats.enemyOperation!.turnsRemaining = 1;
    stats.location = '一楼入口';
    stats.sectorIntegrity['一楼入口'] = 1;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.updatedStats.gameOverReason).not.toBe('commander_killed');
    expect(result.updatedStats.sectorIntegrity?.['一楼入口']).toBe(0);
    expect(result.updatedStats.location).toBe('二楼阵地');
    expect(result.narrative).toContain('残余守军沿内部通道撤往二楼阵地');
  });

  it('blocks organized treatment after the basement hospital is lost', () => {
    const stats = createInitialStats(12);
    stats.tutorialStep = 3;
    stats.wounded = 20;
    stats.sectorIntegrity['地下室'] = 0;

    const result = runGameTurn(stats, '治疗伤员');
    expect(result.updatedStats.soldiers).toBeUndefined();
    expect(result.updatedStats.wounded).toBeUndefined();
    expect(result.narrative).toContain('地下室医院已经失守');
  });

  it('can seal an exposed stairwell and consume the barrier on the next advance', () => {
    const stats = createInitialStats(9);
    stats.tutorialStep = 3;
    stats.day = 2;
    stats.currentTime = '23:00';
    stats.siegeMeter = 0;
    stats.location = '屋顶';
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.sectorIntegrity['地下室'] = 0;

    const sealed = runGameTurn(stats, '封锁通往二楼阵地的楼梯');
    expect(sealed.updatedStats.sealedApproaches).toContain('二楼阵地');
    expect(sealed.updatedStats.sandbags).toBe(stats.sandbags - 150);
    expect(sealed.updatedStats.grenades).toBe(stats.grenades - 20);

    const prepared = { ...stats, ...sealed.updatedStats, siegeMeter: 100 };
    if (prepared.enemyOperation) prepared.enemyOperation = { ...prepared.enemyOperation, turnsRemaining: 1 };
    const attack = runGameTurn(prepared, '侦察敌情');
    expect(attack.attackLocation).toBe('二楼阵地');
    expect(attack.updatedStats.sealedApproaches).not.toContain('二楼阵地');
    expect(attack.narrative).toContain('楼梯封锁触发');
  });

  it('guarantees a respite action immediately after an enemy attack', () => {
    const stats = createInitialStats(77);
    stats.tutorialStep = 3;
    stats.day = 5;
    stats.currentTime = '23:00';
    stats.siegeMeter = 100;
    stats.enemyOperation!.turnsRemaining = 1;
    stats.turnCount = 12;
    stats.lastAttackTurn = 12;

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.eventTriggered).not.toBe('attack');
    expect(result.attackLocation).toBeNull();
  });

  it('enters close combat when rifles are empty and no local HMG can fire', () => {
    const stats = createInitialStats(78);
    stats.tutorialStep = 3;
    stats.day = 5;
    stats.currentTime = '23:00';
    stats.siegeMeter = 100;
    stats.enemyOperation!.turnsRemaining = 1;
    stats.location = '地下室';
    stats.ammo = 0;
    stats.grenades = 0;
    stats.machineGunAmmo = 7832;
    stats.enemiesKilled = 0;
    stats.hmgSquads = stats.hmgSquads.map((squad) => ({ ...squad, location: '二楼阵地' }));

    const result = runGameTurn(stats, '侦察敌情');
    expect(result.eventTriggered).toBe('attack');
    expect(result.attackLocation).toBe('一楼入口');
    expect(result.narrative).toContain('白刃防守');
    expect(result.updatedStats.enemiesKilled).toBeLessThanOrEqual(20);
    expect(result.updatedStats.machineGunAmmo).toBe(7832);
  });

  it('can counterattack to recover a lost sector', () => {
    const stats = createInitialStats(1);
    stats.tutorialStep = 3;
    stats.day = 1;
    stats.currentTime = '10:00';
    stats.siegeMeter = 0;
    stats.morale = 100;
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.soldierDistribution['一楼入口'] = 0;
    stats.soldierDistribution['二楼阵地'] += 140;

    const result = runGameTurn(stats, '反冲锋夺回一楼入口');
    expect(result.updatedStats.sectorIntegrity?.['一楼入口']).toBe(30);
    expect(result.updatedStats.soldierDistribution?.['一楼入口']).toBeGreaterThan(0);
    expect(result.narrative).toContain('反冲锋成功');
  });

  it('allows a high-casualty bayonet counterattack with no ammunition', () => {
    const stats = createInitialStats(4);
    stats.tutorialStep = 3;
    stats.day = 1;
    stats.currentTime = '10:00';
    stats.siegeMeter = 0;
    stats.morale = 90;
    stats.ammo = 0;
    stats.grenades = 0;
    stats.sectorIntegrity['一楼入口'] = 0;
    stats.soldierDistribution['一楼入口'] = 0;
    stats.soldierDistribution['二楼阵地'] += 140;

    const result = runGameTurn(stats, '反冲锋夺回一楼入口');
    expect(result.updatedStats.currentTime).toBe('11:00');
    expect(result.updatedStats.ammo).toBe(0);
    expect(result.narrative).toContain('火力不足');
    expect(result.narrative).not.toContain('反冲锋无法发动');
  });
});
