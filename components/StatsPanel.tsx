import React from 'react';
import type { GameStats } from '../types';
import { getDayProfile } from '../data/dayProfiles';
import { getOperationIntel } from '../engine/battlefield';
import { calculateCommanderDeathRisk, formatCommanderRisk } from '../engine/strategicDefense';

export default function StatsPanel({ stats }: { stats: GameStats }) {
  const activeHmgCount = stats.hmgSquads.reduce((total, squad) => total + (squad.status === 'active' ? squad.count : 0), 0);
  const combatReady = stats.soldiers + activeHmgCount;
  const lost = Object.values(stats.sectorIntegrity).filter(value => value <= 0).length;
  const operation = stats.enemyOperation;
  const threatened = !!operation?.revealed && operation.target === stats.location;
  const primary = [
    { label: '可战', value: combatReady, alert: combatReady < 100 },
    { label: '伤员', value: stats.wounded, alert: stats.wounded > 20 },
    { label: '士气', value: stats.morale, alert: stats.morale < 30 },
    { label: '总结构', value: stats.health, alert: stats.health < 30 },
  ];
  const resources = [
    { label: '七九弹', value: stats.ammo, alert: stats.ammo < 5000 },
    { label: '机枪弹', value: stats.machineGunAmmo, alert: stats.machineGunAmmo < 2000 },
    { label: '手榴弹', value: stats.grenades, alert: stats.grenades < 50 },
    { label: '工事材料', value: stats.sandbags, alert: stats.sandbags < 150 },
    { label: '急救包', value: stats.medkits, alert: stats.medkits < 10 },
  ];
  return <section className="battle-overview" aria-label="战况总览" tabIndex={0}>
    <dl className="battle-metrics">
      {primary.map(item => <div key={item.label} className={item.alert ? 'state-warning' : ''}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>
    <dl className="supply-grid" aria-label="现有物资">
      {resources.map(item => <div key={item.label} className={`supply-cell ${item.alert ? 'state-warning' : ''}`}><dt>{item.label}</dt><dd>{item.value.toLocaleString('en-US')}</dd></div>)}
    </dl>
    <div className="battle-readouts">
      <span className={stats.siegeMeter >= 80 ? 'state-warning' : ''}>压力 {stats.siegeMeter}%</span>
      <span className={stats.fatigue >= 55 ? 'state-warning' : ''}>疲劳 {stats.fatigue}%</span>
      <span className={operation?.turnsRemaining === 1 ? 'state-warning' : ''}>接敌 {operation ? `${operation.turnsRemaining}回合` : '重整中'}</span>
      <span>国旗 {stats.hasFlagRaised ? '飘扬' : '未升起'}</span>
    </div>
    {stats.tutorialStep >= 3 && <p className="battle-intel"><b>{lost ? `失守 ${lost}/4` : getDayProfile(stats.day).title}</b><span>{getOperationIntel(operation)}</span></p>}
    {threatened && <p className="battle-warning" role="alert">指挥部将在 {operation?.turnsRemaining} 回合后遭袭 · 阵亡风险 {formatCommanderRisk(calculateCommanderDeathRisk(stats, stats.location))}</p>}
  </section>;
}
