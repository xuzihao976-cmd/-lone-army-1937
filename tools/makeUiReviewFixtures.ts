import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {ALL_DILEMMAS,TACTICAL_CARDS} from '../data/text/events';
import {createInitialStats,migrateSaveData,SAVE_SCHEMA_VERSION} from '../storage/saveStore';
import {issueEvent} from '../engine/eventPlans';
import {runGameTurn} from '../engine/gameEngine';
import type {GameStats} from '../types';
const dir=(process.env.UI_REVIEW_OUTPUT || 'test-artifacts/night-archive').replace(/\/$/,'')+'/';
mkdirSync(dir,{recursive:true});
const fresh=(chapter:'street'|'sihang'='sihang')=>{
 const s=createInitialStats(1,chapter);s.tutorialStep=3;s.pendingRetreat=null;
 if(s.mission){Object.assign(s.mission,{started:true,recon:true,route:'inner',found:4,elapsedMinutes:35});s.currentTime='17:35';}
 else{Object.assign(s,{day:3,currentTime:'10:00',activeTacticalCard:TACTICAL_CARDS[0]});s.enemyOperation!.turnsRemaining=6;}
 return migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:s})!.stats;
};
const own=(s:GameStats,id:string)=>{s.triggeredEvents=ALL_DILEMMAS.filter(e=>e.id!==id).map(e=>e.id);const e=ALL_DILEMMAS.find(e=>e.id===id)!;s.consequenceFlags=e.requiresFlag?[e.requiresFlag]:[];Object.assign(s,issueEvent(s,id));return s;};
const apply=(s:GameStats,cmd:string)=>{const r=runGameTurn(s,cmd);return {...s,...r.updatedStats,turnCount:s.turnCount+(r.turnAdvanced?1:0)};};
const fixtures:Record<string,unknown>={},expected:Record<string,GameStats>={};
const save=(name:string,s:GameStats,cmd:string)=>{s=migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:s})!.stats;fixtures[name]={schemaVersion:SAVE_SCHEMA_VERSION,stats:s,logs:[{id:'review',sender:'system',text:'界面验收接防记录（测试样本）。'}],savedAt:Date.now()};expected[name]=migrateSaveData({schemaVersion:SAVE_SCHEMA_VERSION,stats:apply(s,cmd)})!.stats;};
const blocked=fresh();blocked.ammo=299;save('blocked',own(blocked,'smuggler_return'),'evt_resolve:smuggler_return:1');
const paid=fresh();paid.ammo=300;save('paid',own(paid,'smuggler_return'),'evt_resolve:smuggler_return:0');
const student=fresh();Object.assign(student,{soldiers:2,hmgSquads:[],specialistSquads:[],roster:[],lastStandUsed:true,soldierDistribution:{'一楼入口':2,'二楼阵地':0,'地下室':0,'屋顶':0}});save('student',own(student,'student_run'),'evt_resolve:student_run:0');
const side=fresh();side.sectorIntegrity['地下室']=0;side.enemyOperation!.target='地下室';side.soldierDistribution={'一楼入口':side.soldiers,'二楼阵地':0,'地下室':0,'屋顶':0};save('side',own(side,'british_pressure'),'evt_resolve:british_pressure:0');
const jam=fresh();jam.lastBattle={turn:jam.turnCount,location:'一楼入口',attackType:'ARTILLERY',hmgFired:['机枪一连']};save('jam',own(jam,'hmg_jam'),'evt_resolve:hmg_jam:1');expected.repair=apply(expected.jam,'检修机枪一连');
const corner=fresh('street');save('corner',own(corner,'street_corner'),'evt_resolve:street_corner:1');expected.clear=apply(expected.corner,'清理内巷障碍');
const knock=fresh('street');knock.mission!.found=11;save('knock',own(knock,'wall_knocking'),'evt_resolve:wall_knocking:0');
const medicine=fresh();medicine.medkits=1;medicine.wounded=3;save('medicine',own(medicine,'wet_medicine'),'evt_resolve:wet_medicine:1');
const beam=fresh();beam.sectorIntegrity['一楼入口']=40;beam.fortificationLevel['一楼入口']=2;beam.fortificationBuildCounts['一楼入口']=4;beam.lastBattle={turn:beam.turnCount,location:'一楼入口',attackType:'ARTILLERY',hmgFired:[]};save('beam',own(beam,'beam_creak'),'evt_resolve:beam_creak:0');
for(const chapter of ['street','bridge','sihang'] as const){
 const s=apply(createInitialStats(19371115,chapter),'start_game');
 save('order_'+chapter,s,chapter==='street'?'侦察路线':chapter==='bridge'?'压制射击':'加固一楼入口');
}
const tactic=apply(createInitialStats(19371115,'street','group_escort'),'start_game');
save('tactic',tactic,'侦察路线');
const legacy=JSON.parse(readFileSync('design/ui-verification/legacy-v10-storage.json','utf8'));expected.legacy=migrateSaveData(JSON.parse(legacy.lone_army_autosave))!.stats;expected.manual=migrateSaveData(JSON.parse(legacy.lone_army_slot_2))!.stats;
writeFileSync(dir+'fixtures.json',JSON.stringify(fixtures));writeFileSync(dir+'expected.json',JSON.stringify(expected));
writeFileSync(dir+'legacy-storage.json', JSON.stringify(legacy));
console.log('Night Archive fixtures and exact engine outcomes written.');
