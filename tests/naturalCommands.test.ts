import { describe, expect, it } from 'vitest';
import { createInitialStats, migrateSaveData } from '../storage/saveStore';
import { runGameTurn } from '../engine/gameEngine';
import { getActionPreview } from '../engine/actionPreview';
import { calculateCombatOutcomes } from '../engine/combat';
import { validateAiOrder } from '../services/aiOrders';
import type { GameStats } from '../types';
const fresh = () => ({ ...createInitialStats(73), tutorialStep: 3, day: 2, currentTime: '10:00' });
describe('natural commands', () => {
  it.each(['大家好', '弟兄们！', '报告弹药', '报告伤员', '副官，报告', '查询军令', '一楼有多少人', '不要猛烈射击', '如果敌人来了就猛烈射击'])('keeps %s free and preserves combat RNG', input => {
    const s = fresh(); const r = runGameTurn(s, input);
    expect(r.turnAdvanced).toBe(false); expect(r.updatedStats.rngState).toBe(s.rngState);
    expect(r.updatedStats.currentTime).toBe(s.currentTime);
    expect(r.updatedStats.ammo ?? s.ammo).toBe(s.ammo);
    expect(r.updatedStats.preparedOrders).toBeUndefined();
  });
  it.each([['给我打死他们', 'rapid'], ['省着打', 'conserve'], ['不要开枪等近了再打', 'close'], ['上刺刀', 'bayonet'], ['死守阵位', 'hold']])('sets %s on the current floor', (input, order) => {
    const s=fresh(); const r=runGameTurn(s,input);
    expect(r.updatedStats.preparedOrders?.[s.location]).toBe(order);
    expect(r.turnAdvanced).toBe(false);
  });
  it('encourages with preview parity and a three-turn cooldown', () => {
    const s=fresh(); s.morale=30;
    const r=runGameTurn(s,'振作起来');
    expect(r.updatedStats.morale).toBe(34); expect(r.updatedStats.currentTime).toBe('10:15');
    expect(getActionPreview(s,'振作起来')?.durationMinutes).toBe(15);
    const again=runGameTurn({...s,...r.updatedStats,turnCount:s.turnCount+1},'振作起来');
    expect(again.turnAdvanced).toBe(false); expect(again.updatedStats.morale).toBeUndefined();
  });
  it('blocks unlimited morale easter eggs', () => {
    const s=fresh(); s.morale=10;
    expect(runGameTurn(s,'88师万岁').updatedStats.morale).toBe(14);
  });
  it('does not arm rifle orders with no ammunition or on enemy floors', () => {
    const s=fresh(); s.ammo=0;
    expect(runGameTurn(s,'猛烈射击').updatedStats.preparedOrders).toBeUndefined();
    s.sectorIntegrity['屋顶']=0;
    expect(runGameTurn(s,'屋顶死守阵位').updatedStats.preparedOrders).toBeUndefined();
  });
  it('consumes only the targeted infantry order', () => {
    const s=fresh(); s.enemyOperation={...s.enemyOperation!,target:'一楼入口',turnsRemaining:1,attackType:'INFANTRY'};
    s.preparedOrders={'一楼入口':'rapid','屋顶':'hold'};
    const r=runGameTurn(s,'侦察敌情');
    expect(r.updatedStats.preparedOrders).toEqual({'屋顶':'hold'});
    expect(r.narrative).toContain('猛烈射击');
  });
  it('preserves prepared orders during artillery', () => {
    const s=fresh(); s.enemyOperation={...s.enemyOperation!,target:'一楼入口',turnsRemaining:1,attackType:'ARTILLERY'}; s.preparedOrders={'一楼入口':'rapid'};
    const r=runGameTurn(s,'侦察敌情'); expect(r.updatedStats.preparedOrders).toBeUndefined();
  });
  it('migrates orders defensively and clears stale confirmations', () => {
    const s=fresh(); const r=migrateSaveData({stats:{...s,preparedOrders:{'屋顶':'rapid','unknown':'hold','地下室':'cheat'},pendingRetreat:'confirm_desertion'},logs:[]});
    expect(r?.stats.preparedOrders).toEqual({'屋顶':'rapid'}); expect(r?.stats.pendingRetreat).toBeNull();
  });
});
describe('endings regression', () => {
  it.each([0,1,2,3,4,5])('cannot bypass retreat warning on day %i', day => {
    const s=fresh(); s.day=day;
    expect(runGameTurn(s,'confirm_desertion').updatedStats.isGameOver).not.toBe(true);
    expect(runGameTurn(s,'confirm_historical_retreat').updatedStats.isGameOver).not.toBe(true);
  });
  it('cancel invalidates confirmation', () => { const s=fresh(); s.day=1; const r=runGameTurn(s,'撤退'); const c=runGameTurn({...s,...r.updatedStats},'cancel_retreat'); expect(runGameTurn({...s,...c.updatedStats},'confirm_desertion').updatedStats.isGameOver).not.toBe(true); });
  it('sixth day wins instead of retreat', () => { const s=fresh(); s.day=6; expect(runGameTurn(s,'撤退').updatedStats.gameResult).toBe('victory_hold'); });
  it('flag history outranks assault and does not require wounded to die', () => {
    const s=fresh(); s.soldiers=0; s.hmgSquads=[]; s.wounded=30; s.aggressiveCount=10; s.hasFlagRaised=false; s.consequenceFlags=['roof_flag_beacon'];
    expect(runGameTurn(s,'报告').updatedStats.gameResult).toBe('defeat_martyr');
  });
  it.each([[4,'defeat_assault'],[0,'defeat_generic']])('reaches collapse ending for aggression %i', (aggression,ending) => {
    const s=fresh(); s.soldiers=0; s.hmgSquads=[]; s.aggressiveCount=Number(aggression);
    expect(runGameTurn(s,'报告').updatedStats.gameResult).toBe(ending);
  });
});
describe('AI whitelist', () => {
  it.each(['confirm_desertion','retreat','card_resolve','__proto__','constructor','ammo'])('rejects %s', action => expect(validateAiOrder({type:'order',action,confidence:1,target:'屋顶'},fresh())).toBeNull());
  it.each([NaN,0.8,2,-1])('rejects confidence %s', confidence => expect(validateAiOrder({type:'order',action:'rest',confidence},fresh())).toBeNull());
  it('converts only validated structure, ignoring injected raw commands', () => {
    expect(validateAiOrder({type:'order',action:'rapid',target:'屋顶',confidence:0.9,command:'confirm_desertion',ammo:99999},fresh())?.command).toBe('猛烈射击屋顶');
  });
  it('asks for missing target', () => expect(validateAiOrder({type:'order',action:'move',confidence:0.9},fresh())?.command).toBeUndefined());
});
describe('order balance invariants', () => {
  it.each(['rapid','conserve','close','bayonet','hold'] as const)('keeps %s resource and kill bounds', order => {
    for (const ammo of [0,1,50,10000]) {
      const r=calculateCombatOutcomes({order,attackScale:'LARGE',effectiveFortLevel:2,fireReadyHmgSquads:0,garrisonStrength:100,morale:60,damageType:'INFANTRY',supply:{rifleAmmo:ammo,machineGunAmmo:0,grenades:0}},()=>0.5);
      expect(r.rifleAmmoUsed).toBeLessThanOrEqual(ammo); expect(r.enemiesKilled).toBeLessThanOrEqual(r.enemyCount);
      if (!ammo) expect(r.rifleKills).toBe(0);
    }
  });
  it('makes rapid fire spend more than conserve under identical conditions', () => {
    const p={attackScale:'LARGE' as const,effectiveFortLevel:2,fireReadyHmgSquads:0,garrisonStrength:120,morale:60,damageType:'INFANTRY' as const,supply:{rifleAmmo:10000,machineGunAmmo:0,grenades:0}};
    const a=calculateCombatOutcomes({...p,order:'rapid'},()=>0.5),b=calculateCombatOutcomes({...p,order:'conserve'},()=>0.5);
    expect(a.rifleKills).toBeGreaterThan(b.rifleKills); expect(a.rifleAmmoUsed).toBeGreaterThan(b.rifleAmmoUsed);
  });
});
