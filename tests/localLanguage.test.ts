import {describe,expect,it} from 'vitest';
import {createInitialStats,migrateSaveData} from '../storage/saveStore';
import {runGameTurn} from '../engine/gameEngine';
import {getActionPreview} from '../engine/actionPreview';
import {localAdvisorResponse} from '../engine/localAdvisor';
import {LOCAL_DIALOGUE,CONTEXT_DIALOGUE} from '../data/text/localDialogue';
import {getLocalDialogue} from '../engine/localConversation';
import {PASSIVE_INPUTS,TIMED_COMMANDS,TACTICAL_COMMANDS} from './fixtures/playerLanguage';
import type {GameStats} from '../types';
const fresh=():GameStats=>({...createInitialStats(7001),tutorialStep:3,day:2,currentTime:'10:00',morale:60,wounded:10,turnCount:8,lastAttackTurn:0});
const apply=(s:GameStats,input:string)=>{const r=runGameTurn(s,input);return {r,s:{...s,...r.updatedStats,turnCount:s.turnCount+(r.turnAdvanced?1:0)}};};
const world=({localDialogue:_memory,pendingRetreat:_pending,...state}:GameStats)=>state;
describe('independent player language and settlement boundaries',()=>{
 it.each(PASSIVE_INPUTS)('keeps hostile or conversational input read-only: %s',input=>{
  const before=fresh();before.preparedOrders={'一楼入口':'rapid'};
  const {r,s}=apply(before,input);
  expect(r.turnAdvanced,input).not.toBe(true);expect(r.dilemma,input).toBeUndefined();
  expect(world(s),input).toEqual(world(before));expect(r.narrative.length).toBeGreaterThan(8);
  expect(getActionPreview(before,input)?.durationMinutes,input).toBe(0);
 });
 it.each(TIMED_COMMANDS)('executes an explicit action with consistent preview: %s',(input,minutes)=>{
  const before=fresh();const r=runGameTurn(before,input);
  expect(r.turnAdvanced,r.narrative).toBe(true);expect(r.summary?.durationMinutes,input).toBe(minutes);
  expect(getActionPreview(before,input)?.durationMinutes,input).toBe(minutes);
 });
 it.each(TACTICAL_COMMANDS)('sets only the requested infantry preparation: %s',(input,order)=>{
  const before=fresh(),r=runGameTurn(before,input);const target=/屋顶/.test(input)?'屋顶':before.location;
  expect(r.updatedStats.preparedOrders?.[target],r.narrative).toBe(order);expect(r.turnAdvanced).toBe(false);expect(r.updatedStats.rngState).toBe(before.rngState);
 });
 it('hundreds of chats do not alter the next real battle',()=>{
  const before=fresh();before.enemyOperation={...before.enemyOperation!,revealed:true,turnsRemaining:1};
  let chatted=structuredClone(before);for(const input of [...PASSIVE_INPUTS,...PASSIVE_INPUTS])chatted=apply(chatted,input).s;
  expect(world(apply(chatted,'休息整顿').s)).toEqual(world(apply(before,'休息整顿').s));
 });
 it('all encouragement variants share one cooldown',()=>{
  let s=fresh();s=apply(s,'振作起来').s;const morale=s.morale;
  for(const input of ['打起精神','兄弟们别怕','大家加油','加把劲','88师万岁','我们能行']){
   const next=apply(s,input);expect(next.r.turnAdvanced).toBe(false);expect(next.s.morale).toBe(morale);s=next.s;
  }
 });
 it('has exactly 304 distinct authored replies across 42 topics and 13 contexts',()=>{
  const lines=[...Object.values(LOCAL_DIALOGUE).flat(),...Object.values(CONTEXT_DIALOGUE).flat()];
  expect(Object.keys(LOCAL_DIALOGUE)).toHaveLength(42);expect(lines).toHaveLength(304);expect(new Set(lines).size).toBe(304);
 });
 it('rotates repetitive dialogue and preserves its memory across save migration',()=>{
  let s=fresh();const replies=[];for(let i=0;i<8;i++){const next=apply(s,'你好');expect(next.r.narrative).not.toBe(replies.at(-1));replies.push(next.r.narrative);s=next.s;}
  expect(new Set(replies).size).toBeGreaterThanOrEqual(6);
  const restored=migrateSaveData({stats:s,logs:[]})!.stats;expect(restored.localDialogue).toEqual(s.localDialogue);
  expect(runGameTurn(restored,'你好').narrative).toBe(runGameTurn(s,'你好').narrative);expect(s.rngState).toBe(fresh().rngState);
 });
 it.each([null,{}, {sequence:-1}, {sequence:0,topic:'__proto__',variant:0,inputHash:0,repeats:0}])('discards damaged presentation memory %j',memory=>expect(migrateSaveData({stats:{...fresh(),localDialogue:memory},logs:[]})?.stats.localDialogue).toBeUndefined());
 it('reports multiple actual values instead of stopping after one keyword',()=>{
  const s=fresh();s.ammo=123;s.morale=42;const text=runGameTurn(s,'报告弹药、士气和二楼兵力').narrative;
  expect(text).toContain('123');expect(text).toContain('42/100');expect(text).toContain('二楼阵地');
 });
 it('never reveals an unscouted target in a query',()=>{
  const s=fresh();s.enemyOperation={...s.enemyOperation!,revealed:false,target:'屋顶',routeName:'secret-route'};
  const text=runGameTurn(s,'报告敌情').narrative;expect(text).not.toContain('屋顶');expect(text).not.toContain('secret-route');
 });
 it('reads named casualties from the roster',()=>{
  const s=fresh(),person=s.roster[0];person.status='dead';person.deathReason='测试战报';
  expect(runGameTurn(s,person.name+'现在怎么样').narrative).toContain('已阵亡（测试战报）');
 });
 it.each([1,2])('protects tutorial %i from quoted and negative actions',tutorialStep=>{
  for(const input of ['不要加固一楼','不要休息','“加固一楼”','休息有用吗','不要跳过教程']){
   const r=runGameTurn({...fresh(),tutorialStep},input);expect(r.updatedStats.tutorialStep).toBeUndefined();expect(r.updatedStats.morale).toBeUndefined();
  }
 });
 it('rejects the entire oversized message without executing its prefix',()=>{
  for(const input of ['休息'+'啊'.repeat(10000),'休息'+'\u200b'.repeat(1000)]){
   const r=runGameTurn(fresh(),input);expect(r.turnAdvanced).not.toBe(true);expect(r.narrative).toContain('500');
  }
 });
 it.each(['休息整顿','一楼猛烈射击','振作起来','取消一楼军令'])('keeps advisor commands as read-only previews: %s',input=>{
  const s=fresh();s.preparedOrders={'一楼入口':'rapid'};const before=structuredClone(s);
  expect(localAdvisorResponse(input,s).text).toContain('尚未执行');expect(s).toEqual(before);
 });
 it.each([[{ammo:0},'七九弹|步枪弹|弹没了'],[{morale:20},'稀|低落|没什么劲|士气'],[{fatigue:95},'疲劳|揉|晃|沙哑']])('chooses dialogue from current conditions %j',(patch,words)=>{
  const s={...fresh(),...patch};expect(getLocalDialogue(s,'大家好')?.text).toMatch(new RegExp(words as string));
 });
 it('chat does not reset wounded time or consume the last-stand recovery chance',()=>{
  const s=fresh();s.wounded=0;s.woundedTimer=660;expect(apply(s,'你好').s.woundedTimer).toBe(660);
  s.soldiers=10;s.hmgSquads=[];s.soldierDistribution={'一楼入口':10,'二楼阵地':0,'屋顶':0,'地下室':0};
  expect(apply(s,'你好').s.lastStandUsed).toBe(false);
 });
});
