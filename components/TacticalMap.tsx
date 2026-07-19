import React, { useEffect, useMemo, useState } from 'react';
import type { GameStats, Location } from '../types';
import { getActionPreview } from '../engine/actionPreview';
import {
  calculateCommanderDeathRisk,
  canRecaptureSector,
  formatCommanderRisk,
  getSectorDefenseProfile,
  getSectorCondition,
  getSectorIntegrity,
  isApproachExposed,
  isSectorHeld,
} from '../engine/strategicDefense';
import { SPECIALIST_EFFECTS } from '../engine/specialists';

interface TacticalMapProps {
  stats: GameStats;
  onAction?: (cmd: string) => void;
  attackLocation?: Location | null;
}

interface SectorDefinition {
  location: Location;
  code: string;
  icon: string;
  accent: string;
  lossEffect: string;
}

const SECTORS: SectorDefinition[] = [
  { location: '屋顶', code: 'RF', icon: '⌃', accent: 'text-sky-500', lossEffect: '无法升旗，空袭转向纵深' },
  { location: '二楼阵地', code: '2F', icon: '▥', accent: 'text-cyan-600', lossEffect: '屋顶暴露，一楼失去火力支援' },
  { location: '一楼入口', code: '1F', icon: '▣', accent: 'text-red-500', lossEffect: '敌军将分兵二楼与地下室' },
  { location: '地下室', code: 'B1', icon: '▽', accent: 'text-green-600', lossEffect: '治疗停摆，伤员和物资受损' },
];

const FORTIFICATION_NAMES = ['无掩体', '沙袋防线', '加固掩体', '堡垒化阵地'] as const;

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
  const selectedSpecialists = stats.specialistSquads.filter((squad) => squad.status === 'active' && squad.location === selectedLocation);
  const selectedIntegrity = getSectorIntegrity(stats, selectedLocation);
  const selectedCondition = getSectorCondition(selectedIntegrity);
  const selectedHeld = isSectorHeld(stats, selectedLocation);
  const selectedDefense = getSectorDefenseProfile(stats, selectedLocation);
  const commanderRisk = calculateCommanderDeathRisk(stats, selectedLocation);
  const operation = stats.enemyOperation;
  const operationVisible = !!operation?.revealed;
  const visibleTargets = operationVisible && operation ? [operation.target] : [];
  const enemyPressure = stats.siegeMeter >= 85
    ? '总攻迫近'
    : stats.siegeMeter >= 55
      ? '主力推进'
      : stats.siegeMeter >= 25
        ? '前沿集结'
        : '零星侦察';
  const targetCodes = visibleTargets
    .map((location) => SECTORS.find((sector) => sector.location === location)?.code)
    .filter(Boolean)
    .join(' / ');

  const donor = useMemo(() => SECTORS
    .filter((sector) => sector.location !== selectedLocation && isSectorHeld(stats, sector.location))
    .map((sector) => ({ location: sector.location, soldiers: stats.soldierDistribution[sector.location] || 0 }))
    .sort((a, b) => b.soldiers - a.soldiers)[0], [selectedLocation, stats.soldierDistribution]);
  const transferable = donor ? Math.min(30, Math.max(0, donor.soldiers - 20)) : 0;
  const defenseMitigation = Math.round(selectedDefense.mitigation * 100);
  const conditionLabels = {
    secure: '稳固',
    strained: '吃紧',
    critical: '濒临失守',
    lost: '敌军控制',
  } as const;

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
        className={`min-w-[124px] rounded-md border bg-black/40 px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
      >
        <span className="block whitespace-nowrap text-xs font-black">{label}</span>
        <span className="mt-0.5 block whitespace-nowrap text-[11px] text-neutral-400">{preview?.short || '即时'}</span>
      </button>
    );
  };

  return (
    <section className="select-none border-b border-neutral-800 bg-[#080808] p-2.5 font-sans" aria-label="仓库战略地图">
      <div className="mx-auto max-w-3xl">
        <header className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-black tracking-wider text-neutral-100">战略地图</h2>
          <div className="truncate text-right text-xs font-bold text-red-300">{operationVisible && operation ? `敌军 → ${operation.target}` : '敌军目标尚未查明'}</div>
        </header>

        <div className="mb-2 grid grid-cols-[88px_1fr_78px] items-center gap-2 rounded border border-red-950/80 bg-red-950/15 px-2 py-2" aria-label={`敌军态势：${enemyPressure}`}>
          <div>
            <div className="text-[11px] font-black text-red-300">日军前沿</div>
            <div className="text-[11px] text-red-500">{operation ? `${operation.turnsRemaining}回合接敌` : enemyPressure}</div>
          </div>
          <div className="relative h-4 overflow-hidden">
            <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-red-800" />
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="frontline-dot absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                style={{
                  animationDelay: `${index * -0.7}s`,
                  animationDuration: `${Math.max(1.4, 3.8 - stats.siegeMeter * 0.022)}s`,
                }}
              />
            ))}
          </div>
          <div className="text-right">
            <div className="text-[11px] text-neutral-500">确证目标</div>
            <div className="font-mono text-xs font-black text-amber-200">{targetCodes || '??'}</div>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-3 gap-1.5 text-[11px] font-bold">
          <div className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-neutral-400">
            兵力 <span className={operationVisible ? 'text-red-300' : 'text-neutral-600'}>{operationVisible && operation ? operation.scale === 'LARGE' ? '大规模' : operation.scale === 'MEDIUM' ? '中等' : '小股' : '待侦察'}</span>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-neutral-400">
            武器 <span className={operationVisible ? 'text-amber-300' : 'text-neutral-600'}>{operationVisible && operation ? operation.attackType === 'BOMBING' ? '航空兵' : operation.attackType === 'ARTILLERY' ? '炮兵' : '步兵' : '待侦察'}</span>
          </div>
          <div className="truncate rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-neutral-400" title={operationVisible ? operation?.routeName : '执行侦察后显示'}>
            路线 <span className={operationVisible ? 'text-cyan-300' : 'text-neutral-600'}>{operationVisible && operation ? operation.routeName : '待侦察'}</span>
          </div>
        </div>

        {operationVisible && operation?.target === stats.location && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-red-600 bg-red-950/40 px-3 py-2" role="alert">
            <div>
              <div className="text-xs font-black text-red-200">⚠ 指挥部位于敌军预定攻击区</div>
              <div className="text-[11px] text-red-300">{operation.turnsRemaining}回合后接敌；若命中本层，指挥官阵亡风险 {formatCommanderRisk(calculateCommanderDeathRisk(stats, stats.location))}</div>
            </div>
            <span className="text-[11px] font-black text-amber-200">请考虑移动指挥部</span>
          </div>
        )}

        <div className="relative grid grid-cols-4 gap-1.5 sm:gap-2">
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-red-950 to-transparent sm:top-auto sm:bottom-[-5px]" />
          {SECTORS.map((sector) => {
            const garrison = stats.soldierDistribution[sector.location] || 0;
            const integrity = getSectorIntegrity(stats, sector.location);
            const mitigation = Math.round(getSectorDefenseProfile(stats, sector.location).mitigation * 100);
            const condition = getSectorCondition(integrity);
            const held = integrity > 0;
            const selected = selectedLocation === sector.location;
            const current = stats.location === sector.location;
            const underAttack = flashingLocation === sector.location;
            const targeted = visibleTargets.includes(sector.location);

            return (
              <button
                type="button"
                key={sector.location}
                aria-pressed={selected}
                onClick={() => setSelectedLocation(sector.location)}
                className={`relative z-10 min-h-[82px] overflow-hidden rounded-md border p-1.5 text-left transition-all sm:p-2 ${
                  underAttack
                    ? 'border-red-500 bg-red-950/40 shadow-[0_0_18px_rgba(220,38,38,0.35)] animate-pulse'
                    : !held
                      ? 'border-red-950 bg-red-950/20'
                    : selected
                      ? 'border-amber-700 bg-amber-950/15'
                      : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-600'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className={`hidden font-mono text-sm font-black sm:inline ${sector.accent}`}>{sector.icon}</span>
                    <div>
                      <div className="whitespace-nowrap text-[11px] font-black text-neutral-100 sm:text-xs">{sector.location}</div>
                      <div className="font-mono text-[11px] text-neutral-500">{sector.code}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      {targeted && <span title="敌军正在向此处推进" className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />}
                      {current && <span title="指挥部" className="text-xs text-amber-300">🎖</span>}
                    </div>
                    <span className={`hidden rounded px-1.5 py-0.5 text-[11px] font-bold sm:block ${condition === 'lost' ? 'bg-red-900/50 text-red-300' : condition === 'critical' ? 'bg-orange-900/40 text-orange-300' : condition === 'strained' ? 'bg-amber-900/30 text-amber-300' : 'bg-green-950/50 text-green-400'}`}>{conditionLabels[condition]}</span>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-neutral-400">
                  <span>兵 <b className="text-neutral-100">{garrison}</b></span>
                  <span className={mitigation < 35 ? 'text-red-300' : mitigation < 65 ? 'text-amber-300' : 'text-green-300'}>减伤 {mitigation}%</span>
                </div>
                <div className="mt-1">
                  <div
                    className="h-2 overflow-hidden rounded-full border border-neutral-800 bg-black"
                    aria-label={`${sector.location}实际减伤 ${mitigation}%`}
                    title={`实际减伤 ${mitigation}%`}
                  >
                    <div className={`h-full transition-all ${mitigation < 35 ? 'bg-red-600' : mitigation < 65 ? 'bg-amber-600' : 'bg-green-700'}`} style={{ width: `${mitigation}%` }} />
                  </div>
                </div>
                <div className={`mt-1 truncate text-[11px] font-bold ${targeted ? 'text-red-400' : condition === 'lost' ? 'text-red-400' : 'text-neutral-500'}`}>
                  {targeted ? `${operation?.turnsRemaining ?? '?'}回合后接敌` : conditionLabels[condition]}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-2 rounded-md border border-neutral-700 bg-neutral-950/90 p-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-base font-black ${selectedSector.accent}`}>{selectedLocation}</span>
                <span className="rounded bg-neutral-800 px-2 py-1 text-[11px] font-bold text-neutral-300">实际减伤 {defenseMitigation}%</span>
                <span className={`rounded px-2 py-1 text-[11px] font-black ${selectedCondition === 'lost' ? 'bg-red-950 text-red-300' : selectedCondition === 'critical' ? 'bg-orange-950 text-orange-300' : 'bg-green-950/50 text-green-300'}`}>
                  防区完整度 {selectedIntegrity}%
                </span>
                {flashingLocation === selectedLocation && <span className="text-xs font-black text-red-400 animate-pulse">● 交战中</span>}
              </div>
              <div className="mt-1 text-xs text-neutral-300">
                驻军 {selectedGarrison} · {FORTIFICATION_NAMES[Math.max(0, Math.min(3, selectedFort))]} · {selectedHmg.length
                  ? `${selectedHmg.map((squad) => squad.name).join('、')}（${selectedDefense.fireReadyHmgSquads}/${selectedHmg.length}可开火）`
                  : '无机枪组'}
              </div>
              {selectedSpecialists.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {selectedSpecialists.map((squad) => (
                    <div key={squad.id} className="rounded bg-cyan-950/30 px-1.5 py-1 text-[11px] text-cyan-200">
                      <b>◆ {squad.name}</b> · {SPECIALIST_EFFECTS[squad.role]}
                    </div>
                  ))}
                </div>
              )}
              {stats.location === selectedLocation && (
                <div className={`mt-1 text-xs font-black ${commanderRisk >= 0.03 ? 'text-red-300 animate-pulse' : commanderRisk >= 0.015 ? 'text-amber-300' : 'text-green-300'}`}>
                  🎖 阵亡风险 {formatCommanderRisk(commanderRisk)}
                </div>
              )}
              {stats.sealedApproaches.includes(selectedLocation) && (
                <div className="mt-1 text-xs font-bold text-cyan-300">⛓ 楼梯已封锁</div>
              )}
              {!selectedHeld && (
                <div className="mt-1 text-xs font-bold text-red-300">失守：{selectedSector.lossEffect}</div>
              )}
            </div>
            <div className="mt-1 w-28 shrink-0">
              <div className="mb-1 text-right font-mono text-[11px] font-black text-neutral-300">减伤 {defenseMitigation}%</div>
              <div
                className="h-2.5 overflow-hidden rounded-full border border-neutral-800 bg-black"
                aria-label={`${selectedLocation}实际减伤 ${defenseMitigation}%`}
              >
                <div className={`h-full ${defenseMitigation < 35 ? 'bg-red-700' : defenseMitigation < 65 ? 'bg-amber-700' : 'bg-green-800'}`} style={{ width: `${defenseMitigation}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {!selectedHeld ? (
              <TacticalAction
                command={`反冲锋夺回${selectedLocation}`}
                label={`${stats.ammo < 200 ? '⚔ 刺刀反攻夺回' : '⚔ 反冲锋夺回'}${selectedLocation}`}
                tone="red"
                disabled={!canRecaptureSector(stats, selectedLocation)}
              />
            ) : (
              <>
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
                <TacticalAction
                  command={`加固${selectedLocation}`}
                  label="🛠 修复并加固"
                  tone="amber"
                  disabled={selectedFort >= 3 && selectedIntegrity >= 100}
                />
                {isApproachExposed(stats, selectedLocation) && !stats.sealedApproaches.includes(selectedLocation) && (
                  <TacticalAction command={`封锁通往${selectedLocation}的楼梯`} label="⛓ 封锁楼梯" tone="red" />
                )}
                {stats.hmgSquads.map((squad) => squad.status === 'active' && squad.location !== selectedLocation && (
                  <TacticalAction
                    key={squad.name}
                    command={`部署${squad.name}至${selectedLocation}`}
                    label={`♜ 调${squad.name}`}
                    tone="amber"
                  />
                ))}
                {stats.specialistSquads.map((squad) => squad.status === 'active' && squad.location !== selectedLocation && (
                  <TacticalAction
                    key={squad.id}
                    command={`部署小队${squad.name}至${selectedLocation}`}
                    label={`◆ 调${squad.name}`}
                    tone="green"
                  />
                ))}
                {selectedLocation === '屋顶' && !stats.hasFlagRaised && (
                  <TacticalAction command="升旗" label="⚑ 升起国旗" tone="red" />
                )}
                {selectedLocation === '地下室' && stats.wounded > 0 && (
                  <TacticalAction command="治疗伤员" label="✚ 救治伤员" tone="green" />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TacticalMap;
