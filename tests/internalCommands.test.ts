import { issueEvent } from '../engine/eventPlans';
import {describe,expect,it} from 'vitest';
import {createInitialStats} from '../storage/saveStore';
import {runGameTurn} from '../engine/gameEngine';
import {ALL_DILEMMAS,TACTICAL_CARDS} from '../data/text/events';
const fresh=()=>({...createInitialStats(881),tutorialStep:3,day:3,currentTime:'10:00'});
describe('owned event and tactical card actions',()=>{
 it.each(TACTICAL_CARDS)('rejects forged card $id and accepts a genuinely held one',card=>{
  const s=fresh();const forged=runGameTurn(s,card.actionCmd);expect(forged.updatedStats.ammo).toBeUndefined();expect(forged.updatedStats.morale).toBeUndefined();expect(forged.updatedStats.soldiers).toBeUndefined();
  s.activeTacticalCard=card;const valid=runGameTurn(s,card.actionCmd);expect(valid.updatedStats.activeTacticalCard).toBeNull();
  const replay=runGameTurn({...s,...valid.updatedStats},card.actionCmd);expect(replay.updatedStats.ammo).toBeUndefined();expect(replay.updatedStats.morale).toBeUndefined();expect(replay.updatedStats.soldiers).toBeUndefined();
 });
 it.each(ALL_DILEMMAS)('requires a pending $id event, its option and its preconditions',event=>{
  const s=fresh();const command=event.options[0].actionCmd;
  expect(runGameTurn(s,command).updatedStats.triggeredEvents).toBeUndefined();
  s.consequenceFlags=event.requiresFlag?[event.requiresFlag]:[];s.enemyOperation!.revealed=true;Object.assign(s,issueEvent(s,event.id));
  const valid=runGameTurn(s,command);expect(valid.updatedStats.triggeredEvents).toContain(event.id);expect(valid.updatedStats.pendingDilemmaId).toBeNull();
  expect(runGameTurn({...s,...valid.updatedStats},command).updatedStats.triggeredEvents).toBeUndefined();
  expect(runGameTurn(s,`evt_resolve:${event.id}:99`).updatedStats.triggeredEvents).toBeUndefined();
 });
 it('rejects unmet event prerequisites and date restrictions',()=>{
  const s=fresh();s.pendingDilemmaId='student_thanks';s.day=1;
  expect(runGameTurn(s,'evt_resolve:student_thanks:0').updatedStats.medkits).toBeUndefined();
  s.day=3;expect(runGameTurn(s,'evt_resolve:student_thanks:0').updatedStats.medkits).toBeUndefined();
 });
 it('does not discard a genuinely held card when another is forged',()=>{
  const s=fresh();s.activeTacticalCard=TACTICAL_CARDS[0];expect(runGameTurn(s,'card_resolve:supplies').updatedStats.activeTacticalCard).toBeUndefined();
 });
 it('cannot reset an ongoing campaign with start_game',()=>{
  const s=fresh();expect(runGameTurn(s,'start_game').updatedStats.tutorialStep).toBeUndefined();expect(runGameTurn(s,'start_game').updatedStats.sectorIntegrity).toBeUndefined();
 });
});
