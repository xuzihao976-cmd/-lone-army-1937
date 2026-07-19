import React from 'react';
import type { GameStats } from '../types';
import { getDayProfile } from '../data/dayProfiles';
import { formatCampaignDate, minutesUntilMidnight } from '../engine/time';

interface StatsPanelProps {
  stats: GameStats;
  enemyIntel?: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats, enemyIntel }) => {
  const currentDate = formatCampaignDate(stats.day);
  const dayProfile = getDayProfile(stats.day);
  const activeHmgCount = stats.hmgSquads.reduce((total, squad) =>
    total + (squad.status === 'active' ? squad.count : 0), 0);
  const combatReady = stats.soldiers + activeHmgCount;
  const lostSectorCount = Object.values(stats.sectorIntegrity).filter((integrity) => integrity <= 0).length;
  const untilMidnight = minutesUntilMidnight(stats.currentTime);
  const countdownLabel = `${Math.floor(untilMidnight / 60)}小时${untilMidnight % 60 ? `${untilMidnight % 60}分` : ''}`;
  const siegePercent = stats.siegeMeter || 0;
  const siegeColor = siegePercent > 80
    ? 'bg-red-500 animate-pulse'
    : siegePercent > 50
      ? 'bg-orange-500'
      : siegePercent > 20
        ? 'bg-amber-500'
        : 'bg-green-700';

  const getLocCode = (location: string) => {
    if (location.includes('一楼')) return '1F';
    if (location.includes('二楼')) return '2F';
    if (location.includes('屋顶')) return 'RF';
    if (location.includes('地下')) return 'B1';
    return '??';
  };

  const primaryStats = [
    { label: '可战人员', value: combatReady, tone: combatReady < 100 ? 'text-red-400' : 'text-neutral-100', alert: combatReady < 100 },
    { label: '待救伤员', value: stats.wounded, tone: stats.wounded > 0 ? 'text-orange-400' : 'text-neutral-300', alert: stats.wounded > 20 },
    { label: '部队士气', value: stats.morale, tone: stats.morale < 30 ? 'text-red-400' : 'text-amber-300', alert: stats.morale < 30 },
    { label: '仓库结构', value: stats.health, tone: stats.health < 30 ? 'text-red-400' : 'text-cyan-200', alert: stats.health < 30 },
  ];

  const resources = [
    { label: '七九弹', value: stats.ammo, tone: stats.ammo < 5000 ? 'text-red-400' : 'text-amber-200' },
    { label: '机枪弹', value: stats.machineGunAmmo, tone: stats.machineGunAmmo < 2000 ? 'text-red-400' : 'text-orange-300' },
    { label: '手榴弹', value: stats.grenades, tone: stats.grenades < 50 ? 'text-red-400' : 'text-neutral-200' },
    { label: '筑垒物资', value: stats.sandbags, tone: stats.sandbags < 150 ? 'text-red-400' : 'text-stone-300' },
    { label: '急救包', value: stats.medkits, tone: stats.medkits < 10 ? 'text-red-400' : 'text-green-300' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-700 bg-black/95 shadow-2xl backdrop-blur" aria-label="战况总览">
      <div className="mx-auto max-w-4xl font-sans">
        <div className="grid grid-cols-[1fr_auto] items-stretch border-b border-neutral-800">
          <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
            <div className="shrink-0 border-r border-neutral-700 pr-3">
              <div className="text-[11px] font-bold tracking-wide text-neutral-400">第 {stats.day} 天 · {currentDate}</div>
              <div className="mt-0.5 font-mono text-xl font-black leading-none text-amber-300">{stats.currentTime}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-wider text-neutral-400">指挥部位置</div>
              <div className="truncate text-base font-black tracking-wide text-amber-100">{stats.location}</div>
              <div className="truncate text-[11px] text-neutral-500">距换日 {countdownLabel}</div>
            </div>
          </div>

          <div className="flex min-w-[88px] flex-col items-center justify-center border-l border-neutral-800 px-3 text-center">
            <span className="text-[11px] font-bold text-neutral-500">国旗</span>
            <span className={`mt-1 rounded border px-2 py-1 text-xs font-black ${stats.hasFlagRaised
              ? 'border-red-700 bg-red-950/60 text-red-300'
              : 'border-neutral-700 bg-neutral-900 text-neutral-300'}`}>
              ⚑ {stats.hasFlagRaised ? '飘扬' : '未升起'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-neutral-800 border-b border-neutral-800 bg-[#0b0b0b]">
          {primaryStats.map((item) => (
            <div key={item.label} className={`relative flex min-w-0 flex-col items-center justify-center px-1 py-2 ${item.alert ? 'bg-red-950/15' : ''}`}>
              <span className="text-[11px] font-bold text-neutral-400">{item.label}</span>
              <span className={`font-mono text-lg font-black leading-tight ${item.tone}`}>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_128px] border-b border-neutral-800 bg-neutral-950 sm:grid-cols-[minmax(0,1fr)_190px]">
          <div className="min-w-0 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 text-xs font-black ${lostSectorCount > 0 ? 'text-red-400' : 'text-neutral-300'}`}>
                ⚠ {lostSectorCount > 0 ? `失守 ${lostSectorCount}/4` : dayProfile.title}
              </span>
              <span className="truncate text-xs text-neutral-300" title={enemyIntel}>{enemyIntel || '通讯中断……'}</span>
            </div>
          </div>
          <div className="border-l border-neutral-800 px-3 py-2" title="威胁达到100%时，日军将发动进攻。">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-neutral-400">敌袭威胁</span>
              <span className={siegePercent >= 80 ? 'text-red-400' : 'text-neutral-200'}>{siegePercent}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-neutral-800 bg-black">
              <div className={`h-full transition-all duration-500 ${siegeColor}`} style={{ width: `${siegePercent}%` }} />
            </div>
          </div>
        </div>

        <div className="flex overflow-x-auto border-b border-neutral-800 bg-[#080808] no-scrollbar">
          {resources.map((item) => (
            <div key={item.label} className="flex min-w-[92px] flex-1 items-center justify-between gap-2 border-r border-neutral-800 px-2.5 py-2 last:border-r-0">
              <span className="whitespace-nowrap text-[11px] font-bold text-neutral-500">{item.label}</span>
              <span className={`font-mono text-xs font-black ${item.tone}`}>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-2 bg-neutral-950 px-3 py-1.5 sm:flex">
          <span className="shrink-0 text-[11px] font-black tracking-wider text-neutral-500">核心火力</span>
          {stats.hmgSquads.map((squad) => (
            <div key={squad.name} className={`flex flex-1 items-center justify-between rounded border px-2 py-1 text-xs ${squad.status === 'active'
              ? 'border-orange-900/60 bg-orange-950/20'
              : 'border-red-900/60 bg-red-950/20'}`}>
              <span className={squad.status === 'active' ? 'font-bold text-orange-300' : 'font-bold text-red-500 line-through'}>{squad.name}</span>
              <span className="font-mono text-neutral-300">{getLocCode(squad.location)} · {squad.status === 'active' ? `${squad.count}/30` : '损失'}</span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};

export default StatsPanel;
