import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createInitialStats } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import type { ChapterId, GameStats } from '../types';
import { chapterTactics, tacticCommand } from '../data/tactics';
import { getTacticPlan } from '../engine/tacticPlans';

const requested = Number(process.argv.find(arg => arg.startsWith('--runs='))?.split('=')[1] ?? 1000);
const runs = Number.isSafeInteger(requested) ? Math.max(1, requested) : 1000;
const report: Record<string, unknown> = {};
let checkedCommands = 0;
const world = ({ localDialogue: _memory, pendingRetreat: _pending, ...stats }: GameStats) => stats;
const apply = (stats: GameStats, command: string) => {
  const result = runGameTurn(stats, command);
  const after: GameStats = { ...stats, ...result.updatedStats, turnCount: stats.turnCount + (result.turnAdvanced ? 1 : 0) };
  for (const key of ['soldiers', 'wounded', 'ammo', 'medkits', 'sandbags'] as const) assert(after[key] >= 0 && Number.isFinite(after[key]), `${key} invalid`);
  for (const key of ['morale', 'fatigue', 'siegeMeter'] as const) assert(after[key] >= 0 && after[key] <= 100, `${key} invalid`);
  assert.equal(Object.values(after.soldierDistribution).reduce((a, b) => a + b, 0), after.soldiers);
  assert(after.mission!.evacuated <= after.mission!.found && after.mission!.found <= 12);
  assert(after.mission!.crossed <= 60);
  const reportedKills = [...result.narrative.matchAll(/确认毙敌(\d+)人/g)]
    .reduce((sum, match) => sum + Number(match[1]), 0);
  assert.equal(after.enemiesKilled - stats.enemiesKilled, reportedKills, 'Battle report and cumulative kills differ');
  if (result.turnAdvanced) {
    assert.equal(after.mission!.elapsedMinutes - stats.mission!.elapsedMinutes, getActionPreview(stats, command)?.durationMinutes);
  }
  checkedCommands++;
  return after;
};

for (const id of ['street', 'bridge'] as const satisfies readonly ChapterId[]) {
 for (const loadout of [null, ...chapterTactics(id).map(card => card.id)]) {
  let wins = 0, survivors = 0, escorted = 0, crossed = 0;
  let minutes = 0, used = 0, ammo = 0, healthy = 0, wounded = 0;
  for (let seed = 1; seed <= runs; seed++) {
    let stats = apply(createInitialStats(19370000 + seed * 7919, id, loadout), 'start_game');
    let decisions = 0;
    while (!stats.isGameOver && decisions++ < 30) {
      const before = stats;
      // An intervening message deliberately cancels a pending confirmation.
      // Exercise chatter before orders, then confirm withdrawal immediately.
      for (const input of stats.pendingRetreat ? [] : ['我想家了', '不要组织撤离', '如果安全就压制射击', '“搜救街巷”', '报告任务']) {
        const after = apply(stats, input);
        assert(isDeepStrictEqual(world(stats), world(after)), `${id}/${seed}: chat changed state`);
        stats = after;
      }
      assert.equal(stats.rngState, before.rngState);
      let command: string;
      if (stats.pendingRetreat) command = stats.pendingRetreat;
      else if (id === 'street') command = !stats.mission!.recon ? '侦察路线'
        : !stats.mission!.route ? seed % 2 ? '选择内巷' : '选择沿河'
          : stats.mission!.evacuated >= 8 ? '组织撤离'
            : stats.mission!.found < 8 ? '搜救街巷'
              : loadout && getTacticPlan(stats, tacticCommand(loadout))?.available ? tacticCommand(loadout) : '护送民众';
      else command = stats.mission!.crossed >= 60
        ? loadout === 'covered_withdrawal' && !stats.equippedTactic?.spent ? tacticCommand(loadout) : '组织撤离'
        : loadout === 'rapid_crossing' && getTacticPlan(stats, tacticCommand(loadout))?.available ? tacticCommand(loadout)
        : seed % 3 === 0 && stats.mission!.cover < 1 ? '加固桥头'
          : stats.fatigue > 40 ? '轮换掩护' : '压制射击';
      stats = apply(stats, command);
    }
    assert(stats.isGameOver, `${id}/${seed}: stalled`);
    assert(stats.gameResult === (id === 'street' ? 'victory_evacuation' : 'victory_cover'), `${id}/${seed}: planned route failed`);
    assert(stats.mission!.elapsedMinutes < 180);
    wins++;
    survivors += stats.soldiers + stats.wounded;
    escorted += stats.mission!.evacuated;
    crossed += stats.mission!.crossed;
    minutes += stats.mission!.elapsedMinutes;
    used += stats.equippedTactic?.spent ? 1 : 0;
    ammo += stats.ammo;
    healthy += stats.soldiers; wounded += stats.wounded;
  }
  report[`${id}/${loadout ?? 'none'}`] = { campaigns: runs, completed: wins, tacticUsed: used,
    averageMinutes: minutes / runs, averageFinalAmmo: Math.round(ammo / runs * 10) / 10,
    averageCombatReady: Math.round(healthy / runs * 10) / 10, averageWounded: Math.round(wounded / runs * 10) / 10,
    averageSquadSurvivors: Math.round(survivors / runs * 10) / 10,
    averageSafelyEscorted: Math.round(escorted / runs * 10) / 10, averageCrossed: crossed / runs };
 }
}
console.log(JSON.stringify({ runsPerLoadout: runs, totalRuns: runs * 6, checkedCommands, generatedAt: new Date().toISOString(), report }, null, 2));
