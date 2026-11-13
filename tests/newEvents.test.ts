import { describe, expect, it } from 'vitest';
import { ALL_DILEMMAS, TACTICAL_CARDS } from '../data/text/events';
import { createInitialStats, migrateSaveData, SAVE_SCHEMA_VERSION } from '../storage/saveStore';
import { canOfferEvent, getEvent, getEventPlan, getPendingEvent, issueEvent } from '../engine/eventPlans';
import { getHmgRepairPlan, innerRoadBlocked } from '../engine/eventContext';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { localAdvisorResponse } from '../engine/localAdvisor';
import { calculateCommanderDeathRisk, getSectorDefenseProfile } from '../engine/strategicDefense';
import { getTacticPlan } from '../engine/tacticPlans';
import { finalizeTurn } from '../engine/turnFinalizer';
import type { GameStats } from '../types';

const fresh=(chapter:'street'|'sihang'='sihang',seed=1):GameStats=>{
  const s=createInitialStats(seed,chapter);s.tutorialStep=3;s.pendingRetreat=null;
  if(s.mission)Object.assign(s.mission,{started:true,recon:true,route:'inner',found:4,elapsedMinutes:35});
  else {s.day=3;s.currentTime='10:00';s.enemyOperation!.turnsRemaining=6;s.activeTacticalCard=TACTICAL_CARDS[0];}
  return s;
};
const apply=(s:GameStats,cmd:string)=>{const result=runGameTurn(s,cmd);return {result,stats:{...s,...result.updatedStats,turnCount:s.turnCount+(result.turnAdvanced?1:0)}};};
const own=(s:GameStats,id:string)=>({...s,...issueEvent(s,id)});
const battle=(s:GameStats)=>{s.sectorIntegrity['一楼入口']=40;s.fortificationLevel['一楼入口']=2;s.fortificationBuildCounts['一楼入口']=4;
  s.lastBattle={turn:s.turnCount,location:'一楼入口',attackType:'ARTILLERY',hmgFired:[s.hmgSquads[0].name]};return s;};
const world=({localDialogue,...s}:GameStats)=>s;

describe('five stateful chapter encounters',()=>{
  it('adds exactly the requested five encounters and keeps chapters separate',()=>{
    expect(ALL_DILEMMAS).toHaveLength(14);
    expect(ALL_DILEMMAS.slice(9).map(e=>e.id)).toEqual(['street_corner','wall_knocking','beam_creak','wet_medicine','hmg_jam']);
    const street=fresh('street'),sihang=fresh();
    expect(canOfferEvent(street,getEvent('street_corner')!)).toBe(true);
    expect(canOfferEvent(sihang,getEvent('street_corner')!)).toBe(false);
    expect(canOfferEvent(street,getEvent('student_run')!)).toBe(false);
  });
  it('offers street interruptions only when an ordinary completion remains feasible and at most once per run',()=>{
    const s=fresh('street');s.mission!.elapsedMinutes=155;
    for(const id of ['street_corner','wall_knocking'])expect(canOfferEvent(s,getEvent(id)!)).toBe(false);
    s.mission!.elapsedMinutes=35;s.triggeredEvents=['wall_knocking'];
    expect(canOfferEvent(s,getEvent('street_corner')!)).toBe(false);
    s.triggeredEvents=[];s.mission!.recon=false;expect(canOfferEvent(s,getEvent('wall_knocking')!)).toBe(false);
  });
  it('clears a genuine corner with ten minutes and no automatic escort or extra people',()=>{
    const s=own(fresh('street'),'street_corner');expect(innerRoadBlocked(s)).toBe(true);
    const out=apply(s,'evt_resolve:street_corner:0');
    expect(out.stats.mission).toMatchObject({route:'inner',elapsedMinutes:45,found:4,evacuated:0});
    expect(out.stats.soldiers).toBe(s.soldiers);expect(innerRoadBlocked(out.stats)).toBe(false);
    expect(out.result.summary?.durationMinutes).toBe(10);expect(out.result.dilemma).toBeUndefined();
  });
  it('keeps a bypassed obstacle until actual clearing, including tactic and route guards',()=>{
    const s=own(fresh('street'),'street_corner');
    let next=apply(s,'evt_resolve:street_corner:1').stats;
    expect(next.mission).toMatchObject({route:'river',elapsedMinutes:35});expect(innerRoadBlocked(next)).toBe(true);
    expect(apply(next,'选择内巷').stats.mission!.route).toBe('river');
    next={...next,mission:{...next.mission!,route:'inner'},equippedTactic:{id:'wall_hug',spent:false}};
    expect(getTacticPlan(next,'使用贴墙慢行')?.available).toBe(false);
    expect(apply(next,'护送民众').result.turnAdvanced).not.toBe(true);
    next=apply(next,'清理内巷障碍').stats;
    expect(innerRoadBlocked(next)).toBe(false);expect(next.mission!.elapsedMinutes).toBe(45);
    expect(getActionPreview(next,'护送民众')?.available).toBe(true);
  });
  it('finds the twelfth registered person without granting a thirteenth or immediate safety',()=>{
    const s=fresh('street');s.mission!.found=11;
    const out=apply(own(s,'wall_knocking'),'evt_resolve:wall_knocking:0');
    expect(out.stats.mission).toMatchObject({found:12,evacuated:0,elapsedMinutes:50});
    expect(out.stats.soldiers).toBe(s.soldiers);expect(canOfferEvent(out.stats,getEvent('wall_knocking')!)).toBe(false);
    expect(apply(out.stats,'evt_resolve:wall_knocking:0').stats).toEqual(out.stats);
  });
  it('declines unverified knocks without morale loss, time or invented deaths',()=>{
    const s=own(fresh('street'),'wall_knocking'),out=apply(s,'evt_resolve:wall_knocking:1');
    expect(out.stats.mission).toEqual(s.mission);expect(out.stats.morale).toBe(s.morale);
    expect(out.stats.soldiers).toBe(s.soldiers);expect(out.result.narrative).toContain('没有谁替那边写下死讯');
  });
  it('requires real recent artillery, a held damaged sector and existing fortifications for the beam',()=>{
    const s=battle(fresh()),e=getEvent('beam_creak')!;
    expect(canOfferEvent(s,e)).toBe(true);
    for(const patch of [{lastBattle:{...s.lastBattle!,attackType:'INFANTRY' as const}},
      {lastBattle:{...s.lastBattle!,turn:s.turnCount-1}}, {sectorIntegrity:{...s.sectorIntegrity,'一楼入口':0}},
      {fortificationLevel:{...s.fortificationLevel,'一楼入口':0}}])expect(canOfferEvent({...s,...patch},e)).toBe(false);
    const ready=own(s,e.id),p=getEventPlan(ready,'evt_resolve:beam_creak:0')!;
    const before=getSectorDefenseProfile(s,'一楼入口').mitigation;
    const out=apply(ready,'evt_resolve:beam_creak:0');
    expect(out.stats.sectorIntegrity['一楼入口']).toBe(48);expect(out.stats.fortificationLevel['一楼入口']).toBe(1);
    expect(out.stats.fortificationBuildCounts['一楼入口']).toBeLessThanOrEqual(3);
    expect(getSectorDefenseProfile(out.stats,'一楼入口').mitigation).toBeLessThan(before);
    expect(p.riskText).toContain('40→48%');expect(out.stats.sandbags).toBe(s.sandbags);
  });
  it('can offer the beam immediately after artillery, without offering unrelated supply choices after combat',()=>{
    const s=battle(fresh());s.lastBattle!.turn=1;
    const updates:Partial<GameStats>={lastBattle:s.lastBattle};
    const result=finalizeTurn({currentStats:s,calculatedStats:updates,actionType:'rest',attackLocation:'一楼入口',eventTriggered:'attack',
      visualEffect:'shake',narrativeParts:[],statsLog:[],random:()=>0,allowRandomEvents:true});
    const after={...s,...updates,turnCount:1};expect(result.dilemma?.id).toBe('beam_creak');expect(getPendingEvent(after)?.id).toBe('beam_creak');
  });
  it('preserves medicine with time or loses only actual stock, and does not pretend to heal',()=>{
    const s=fresh();s.medkits=1;s.wounded=3;const ready=own(s,'wet_medicine');
    const loss=apply(ready,'evt_resolve:wet_medicine:1');expect(loss.stats.medkits).toBe(0);expect(loss.stats.wounded).toBe(3);expect(loss.result.turnAdvanced).toBe(false);
    const saved=apply(ready,'evt_resolve:wet_medicine:0');expect(saved.stats.medkits).toBe(1);expect(saved.stats.wounded).toBe(3);expect(saved.result.summary?.durationMinutes).toBe(15);
    for(const patch of [{medkits:0},{wounded:0},{sectorIntegrity:{...s.sectorIntegrity,'地下室':0}}])expect(canOfferEvent({...s,...patch},getEvent('wet_medicine')!)).toBe(false);
  });
  it('records actual gunfire, never faults an empty, waiting or destroyed gun',()=>{
    const s=battle(fresh()),e=getEvent('hmg_jam')!;
    expect(canOfferEvent(s,e)).toBe(true);
    for(const patch of [{machineGunAmmo:0},{lastBattle:{...s.lastBattle!,hmgFired:[]}},
      {hmgSquads:s.hmgSquads.map(q=>({...q,status:'destroyed' as const,count:0}))},
      {hmgSquads:s.hmgSquads.map(q=>({...q,location:'待命' as const}))}])expect(canOfferEvent({...s,...patch},e)).toBe(false);
    const ready=own(s,e.id);expect(ready.hmgSquads[0].jammed).toBe(true);expect(ready.hmgSquads[0].count).toBe(30);
    expect(getPendingEvent(ready)?.id).toBe(e.id);
  });
  it('removes all fire and cover benefits while preserving crew, and retains fault through redeployment',()=>{
    const ready=own(battle(fresh()),'hmg_jam'),s=apply(ready,'evt_resolve:hmg_jam:1').stats;
    expect(getSectorDefenseProfile(s,'一楼入口').fireReadyHmgSquads).toBe(0);
    const healthy={...s,hmgSquads:s.hmgSquads.map(q=>({...q,jammed:false}))};
    expect(calculateCommanderDeathRisk(s,'一楼入口')).toBeGreaterThan(calculateCommanderDeathRisk(healthy,'一楼入口'));
    const moved=apply(s,'部署机枪一连至屋顶').stats;
    expect(moved.hmgSquads[0]).toMatchObject({location:'屋顶',jammed:true,count:30,status:'active'});
    expect(getSectorDefenseProfile(moved,'屋顶').fireReadyHmgSquads).toBe(0);
  });
  it('allows delayed explicit repairs, uses the normal turn pipeline once and never regrants crew or ammunition',()=>{
    const s=apply(own(battle(fresh()),'hmg_jam'),'evt_resolve:hmg_jam:1').stats;
    const preview=getActionPreview(s,'检修机枪一连');const before=structuredClone(s);
    expect(localAdvisorResponse('检修机枪一连',s).known).toBe(true);expect(s).toEqual(before);
    expect(localAdvisorResponse('拉不动的机柄怎么修？',s).text).toContain('可明确下令“检修机枪一连”');expect(s).toEqual(before);
    expect(preview).toMatchObject({durationMinutes:30,available:true});
    const fixed=apply(s,'检修机枪一连');expect(fixed.stats.hmgSquads[0].jammed).toBe(false);
    expect(fixed.stats.hmgSquads[0].count).toBe(30);expect(fixed.stats.machineGunAmmo).toBe(s.machineGunAmmo);
    expect(fixed.stats.enemyOperation!.turnsRemaining).toBe(s.enemyOperation!.turnsRemaining-1);
    expect(fixed.stats.turnCount).toBe(s.turnCount+1);expect(fixed.result.summary?.durationMinutes).toBe(30);
    expect(getHmgRepairPlan(fixed.stats,'检修机枪一连')?.available).toBe(false);
    for(const raw of ['不要检修机枪一连','如果安全就检修机枪一连','“检修机枪一连”','刚才我说检修机枪一连','检修机枪一连然后加固一楼']){
      expect(world(apply(s,raw).stats)).toEqual(world(s));
    }
  });
  it('spends no machine-gun ammunition and records no machine-gun fire when the local gun is jammed',()=>{
    for(let seed=1;seed<=16;seed++){
      const s=apply(own(battle(fresh('sihang',seed)),'hmg_jam'),'evt_resolve:hmg_jam:1').stats;
      s.location='地下室';s.enemyOperation={...s.enemyOperation!,target:'一楼入口',attackType:'INFANTRY',turnsRemaining:1};
      const out=apply(s,'侦察敌情');
      expect(out.result.eventTriggered).toBe('attack');expect(out.stats.machineGunAmmo).toBe(s.machineGunAmmo);
      expect(out.stats.lastBattle?.hmgFired).toEqual([]);expect(out.result.narrative).not.toContain('消耗机枪弹:');
    }
  });
  it('restores pending street and weapon events, validates new state, and preserves legitimate v13 tickets',()=>{
    for(const ready of [own(fresh('street'),'street_corner'),own(battle(fresh()),'hmg_jam')]){
      const round=migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:ready})!;
      expect(round).not.toBeNull();expect(round.stats.pendingEvent).toEqual(ready.pendingEvent);
      expect(getPendingEvent(round.stats)?.id).toBe(ready.pendingDilemmaId);
    }
    const bad=own(battle(fresh()),'hmg_jam');
    expect(migrateSaveData({schemaVersion:14,stats:{...bad,pendingEvent:{...bad.pendingEvent,hmgName:'不存在'}}})).toBeNull();
    expect(migrateSaveData({schemaVersion:14,stats:{...bad,hmgSquads:bad.hmgSquads.map(q=>({...q,jammed:'yes'}))}})).toBeNull();
    const old=own(fresh(),'smuggler_boat');expect(getPendingEvent(migrateSaveData({schemaVersion:13,stats:old})!.stats)?.id).toBe('smuggler_boat');
    expect(migrateSaveData({schemaVersion:13,stats:{...old,hmgSquads:old.hmgSquads.map(q=>({...q,jammed:true}))}})!.stats.hmgSquads.every(q=>!q.jammed)).toBe(true);
  });
  it('keeps new pending worlds locked and rejects forged, cross-chapter and replayed choices',()=>{
    for(const [s,id] of [[fresh('street'),'street_corner'],[fresh('street'),'wall_knocking'],[battle(fresh()),'beam_creak'],[battle(fresh()),'hmg_jam']] as const){
      const ready=own(s,id);const before=structuredClone(ready);
      for(const raw of ['侦察路线','组织撤离','清理内巷障碍','检修机枪一连','evt_resolve:wet_medicine:0',`“evt_resolve:${id}:0”`])expect(apply(ready,raw).stats).toEqual(before);
      const decline=apply(ready,`evt_resolve:${id}:1`).stats;expect(apply(decline,`evt_resolve:${id}:1`).stats).toEqual(decline);
    }
    expect(apply(fresh(),'evt_resolve:street_corner:0').result.turnAdvanced).not.toBe(true);
  });
});
