import React, { useEffect, useMemo, useState } from 'react';
import type { GameStats, Location } from '../types';
import { getActionPreview } from '../engine/actionPreview';

interface TacticalMapProps {
  stats: GameStats;
  onAction?: (cmd: string) => void;
  attackLocation?: Location | null;
}

interface SectorDefinition {
  location: Location;
  code: string;
  icon: string;
  role: string;
  danger: string;
  accent: string;
}

const SECTORS: SectorDefinition[] = [
  { location: '屋顶', code: 'RF', icon: '⌃', role: '观察、防空与升旗点', danger: '空袭 / 航弹', accent: 'text-sky-500' },
  { location: '二楼阵地', code: '2F', icon: '▥', role: '射击窗与纵深支援', danger: '平射炮 / 炮击', accent: 'text-cyan-600' },
  { location: '一楼入口', code: '1F', icon: '▣', role: '正面主防线与大门', danger: '步兵 / 装甲强攻', accent: 'text-red-500' },
  { location: '地下室', code: 'B1', icon: '▽', role: '医院、弹药与后勤中枢', danger: '结构坍塌', accent: 'text-green-600' },
];

const TacticalMap: React.FC<TacticalMapProps> = ({ stats, onAction, attackLocation }) => {
  const [selectedLocation, setSelectedLocation] = useState<Location>(stats.location);
  const [flashingLocation, setFlashingLocation] = useState<Location | null>(null);

  useEffect(() => {
    if (!attackLocation) return;
    setSelectedLocation(attackLocation);
    setFlashingLocation(attackLocation);
    const timer = window.setTimeout(() => setFlashingLocation(null), 2200);
    return () => window.clearTimeout(timer);
  }, [attackLocation]);

  const selectedSector = SECTORS.find((sector) => sector.location === selectedLocation) ?? SECTORS[2];
  const selectedGarrison = stats.soldierDistribution[selectedLocation] || 0;
  const selectedFort = stats.fortificationLevel[selectedLocation] || 0;
  const selectedHmg = stats.hmgSquads.filter((squad) => squad.status === 'active' && squad.location === selectedLocation);

  const donor = useMemo(() => SECTORS
    .filter((sector) => sector.location !== selectedLocation)
    .map((sector) => ({ location: sector.location, soldiers: stats.soldierDistribution[sector.location] || 0 }))
    .sort((a, b) => b.soldiers - a.soldiers)[0], [selectedLocation, stats.soldierDistribution]);
  const transferable = donor ? Math.min(30, Math.max(0, donor.soldiers - 20)) : 0;
  const maxGarrison = Math.max(1, ...SECTORS.map((sector) => stats.soldierDistribution[sector.location] || 0));
  const defenseScore = Math.min(100, Math.round(selectedFort * 22 + Math.min(45, selectedGarrison / 3) + selectedHmg.length * 16));

  const execute = (command: string) => {
    if (stats.isGameOver) return;
    onAction?.(command);
  };

  const TacticalAction = ({ command, label, tone = 'neutral', disabled = false }: {
    command: string;
    label: string;
    tone?: 'neutral' | 'amber' | 'red' | 'green';
    disabled?: boolean;
  }) => {
    const preview = getActionPreview(stats, command);
    const tones = {
      neutral: 'border-neutral-700 text-neutral-300 hover:bg-neutral-800',
      amber: 'border-amber-900/70 text-amber-500 hover:bg-amber-950/30',
      red: 'border-red-900/70 text-red-500 hover:bg-red-950/30',
      green: 'border-green-900/70 text-green-500 hover:bg-green-950/30',
    };
    return (
      <button
        type="button"
        onClick={() => execute(command)}
        disabled={disabled || stats.isGameOver || preview?.available === false}
        className={`min-w-[112px] rounded border bg-black/40 px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
      >
        <span className="block whitespace-nowrap text-[10px] font-bold">{label}</span>
        <span className="mt-0.5 block whitespace-nowrap text-[8px] text-neutral-600">{preview?.short || '即时命令'}</span>
      </button>
    );
  };

  return (
    <section className="select-none border-b border-neutral-800 bg-[#080808] p-3 font-sans" aria-label="仓库战略地图">
      <div className="mx-auto max-w-3xl">
        <header className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold tracking-[0.2em] text-neutral-300">仓库剖面指挥图</h2>
            <p className="mt-0.5 text-[9px] text-neutral-600">点击防区查看调兵与火力部署 · 驻军和机枪位置会影响真实战损</p>
          </div>
          <div className="shrink-0 text-right text-[8px] text-red-700">
            <div>敌军主攻轴</div>
            <div className="font-mono">1F → 2F　RF空袭</div>
          </div>
        </header>

        <div className="relative grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-red-950 to-transparent sm:top-auto sm:bottom-[-5px]" />
          {SECTORS.map((sector) => {
            const garrison = stats.soldierDistribution[sector.location] || 0;
            const fort = stats.fortificationLevel[sector.location] || 0;
            const hmgs = stats.hmgSquads.filter((squad) => squad.status === 'active' && squad.location === sector.location);
            const selected = selectedLocation === sector.location;
            const current = stats.location === sector.location;
            const underAttack = flashingLocation === sector.location;

            return (
              <button
                type="button"
                key={sector.location}
                aria-pressed={selected}
                onClick={() => setSelectedLocation(sector.location)}
                className={`relative z-10 min-h-[90px] overflow-hidden rounded border p-2 text-left transition-all ${
                  underAttack
                    ? 'border-red-500 bg-red-950/40 shadow-[0_0_18px_rgba(220,38,38,0.35)] animate-pulse'
                    : selected
                      ? 'border-amber-700 bg-amber-950/15'
                      : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-mono text-sm ${sector.accent}`}>{sector.icon}</span>
                    <div>
                      <div className="text-[10px] font-bold text-neutral-300">{sector.location}</div>
                      <div className="text-[8px] font-mono text-neutral-600">{sector.code} · {sector.danger}</div>
                    </div>
                  </div>
                  {current && <span className="rounded bg-amber-900/30 px-1 py-0.5 text-[7px] text-amber-500">指挥部</span>}
                </div>

                <div className="mt-2 flex items-center justify-between text-[8px]">
                  <span className="text-neutral-600">驻军 <b className="text-neutral-300">{garrison}</b></span>
                  <span className="text-neutral-600">工事 <b className={fort < 1 ? 'text-red-500' : 'text-stone-400'}>Lv.{fort}</b></span>
                  <span className="text-neutral-600">机枪 <b className={hmgs.length ? 'text-orange-500' : 'text-neutral-700'}>{hmgs.length}</b></span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-black">
                  <div className="h-full bg-neutral-600 transition-all" style={{ width: `${Math.max(5, garrison / maxGarrison * 100)}%` }} />
                </div>
                <div className="mt-1.5 truncate text-[8px] text-neutral-600">{sector.role}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-2 rounded border border-neutral-800 bg-neutral-950/80 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${selectedSector.accent}`}>{selectedLocation}</span>
                <span className="text-[8px] text-neutral-600">防守评分 {defenseScore}/100</span>
                {flashingLocation === selectedLocation && <span className="text-[8px] font-bold text-red-500 animate-pulse">交战中</span>}
              </div>
              <div className="mt-0.5 text-[8px] text-neutral-500">
                驻军 {selectedGarrison} · 工事 Lv.{selectedFort} · {selectedHmg.length ? selectedHmg.map((squad) => squad.name).join('、') : '无机枪组'}
              </div>
            </div>
            <div className="h-1.5 w-24 overflow-hidden rounded bg-black">
              <div className={`h-full ${defenseScore < 35 ? 'bg-red-700' : defenseScore < 65 ? 'bg-amber-700' : 'bg-green-800'}`} style={{ width: `${defenseScore}%` }} />
            </div>
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {stats.location !== selectedLocation && (
              <TacticalAction command={`前往${selectedLocation}`} label="🏃 移动指挥部" />
            )}
            {donor && (
              <TacticalAction
                command={`调派30人从${donor.location}至${selectedLocation}`}
                label={`↔ 增援${transferable}人（来自${donor.location}）`}
                tone="green"
                disabled={transferable <= 0}
              />
            )}
            <TacticalAction command={`加固${selectedLocation}`} label="🛠 加固该防区" tone="amber" disabled={selectedFort >= 3} />
            {stats.hmgSquads.map((squad) => squad.status === 'active' && squad.location !== selectedLocation && (
              <TacticalAction
                key={squad.name}
                command={`部署${squad.name}至${selectedLocation}`}
                label={`♜ 调${squad.name}`}
                tone="amber"
              />
            ))}
            {selectedLocation === '屋顶' && !stats.hasFlagRaised && (
              <TacticalAction command="升旗" label="⚑ 升起国旗" tone="red" />
            )}
            {selectedLocation === '地下室' && stats.wounded > 0 && (
              <TacticalAction command="治疗伤员" label="✚ 救治伤员" tone="green" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TacticalMap;
