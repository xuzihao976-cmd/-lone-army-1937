import React, { useEffect, useMemo, useState } from 'react';
import type { GameStats, Location } from '../types';
import { getActionPreview } from '../engine/actionPreview';
import {
  calculateCommanderDeathRisk,
  canRecaptureSector,
  formatCommanderRisk,
  getGroundAttackTargets,
  getSectorCondition,
  getSectorIntegrity,
  isApproachExposed,
  isSectorHeld,
} from '../engine/strategicDefense';

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
  lossEffect: string;
}

const SECTORS: SectorDefinition[] = [
  { location: '屋顶', code: 'RF', icon: '⌃', role: '观察、防空与升旗点', danger: '空袭 / 航弹', accent: 'text-sky-500', lossEffect: '无法升旗，后续空袭会转向二楼与纵深' },
  { location: '二楼阵地', code: '2F', icon: '▥', role: '射击窗与纵深支援', danger: '平射炮 / 炮击', accent: 'text-cyan-600', lossEffect: '屋顶暴露，一楼失去二楼交叉火力支援' },
  { location: '一楼入口', code: '1F', icon: '▣', role: '正面主防线与大门', danger: '步兵 / 装甲强攻', accent: 'text-red-500', lossEffect: '敌军获得突破口，后续分兵二楼与地下室' },
  { location: '地下室', code: 'B1', icon: '▽', role: '医院、弹药与后勤中枢', danger: '结构坍塌', accent: 'text-green-600', lossEffect: '治疗停摆，伤员恶化加快并立即损失部分物资' },
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
  const selectedIntegrity = getSectorIntegrity(stats, selectedLocation);
  const selectedCondition = getSectorCondition(selectedIntegrity);
  const selectedHeld = isSectorHeld(stats, selectedLocation);
  const commanderRisk = calculateCommanderDeathRisk(stats, selectedLocation);
  const groundTargets = getGroundAttackTargets(stats);

  const donor = useMemo(() => SECTORS
    .filter((sector) => sector.location !== selectedLocation && isSectorHeld(stats, sector.location))
    .map((sector) => ({ location: sector.location, soldiers: stats.soldierDistribution[sector.location] || 0 }))
    .sort((a, b) => b.soldiers - a.soldiers)[0], [selectedLocation, stats.soldierDistribution]);
  const transferable = donor ? Math.min(30, Math.max(0, donor.soldiers - 20)) : 0;
  const defenseScore = selectedHeld
    ? Math.min(100, Math.round(selectedFort * 18 + Math.min(38, selectedGarrison / 3) + selectedHmg.length * 14 + selectedIntegrity * 0.12))
    : 0;
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
        className={`min-w-[144px] rounded-md border bg-black/40 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
      >
        <span className="block whitespace-nowrap text-xs font-black">{label}</span>
        <span className="mt-1 block whitespace-nowrap text-[11px] text-neutral-400">{preview?.short || '即时命令'}</span>
      </button>
    );
  };

  return (
    <section className="select-none border-b border-neutral-800 bg-[#080808] p-3 font-sans sm:p-4" aria-label="仓库战略地图">
      <div className="mx-auto max-w-3xl">
        <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-[0.16em] text-neutral-100">仓库纵深防御图</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">选择楼层查看兵力和操作。防区失守会改变敌军路线。</p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 rounded border border-red-900/60 bg-red-950/20 px-3 py-2 sm:block sm:text-right">
            <div className="text-[11px] font-bold text-red-400">敌军当前推进目标</div>
            <div className="font-mono text-xs font-black text-red-200">{groundTargets.length ? groundTargets.join(' / ') : '仓库纵深已突破'}</div>
          </div>
        </header>

        <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-red-950 to-transparent sm:top-auto sm:bottom-[-5px]" />
          {SECTORS.map((sector) => {
            const garrison = stats.soldierDistribution[sector.location] || 0;
            const fort = stats.fortificationLevel[sector.location] || 0;
            const hmgs = stats.hmgSquads.filter((squad) => squad.status === 'active' && squad.location === sector.location);
            const integrity = getSectorIntegrity(stats, sector.location);
            const condition = getSectorCondition(integrity);
            const held = integrity > 0;
            const selected = selectedLocation === sector.location;
            const current = stats.location === sector.location;
            const underAttack = flashingLocation === sector.location;

            return (
              <button
                type="button"
                key={sector.location}
                aria-pressed={selected}
                onClick={() => setSelectedLocation(sector.location)}
                className={`relative z-10 min-h-[138px] overflow-hidden rounded-md border p-3 text-left transition-all ${
                  underAttack
                    ? 'border-red-500 bg-red-950/40 shadow-[0_0_18px_rgba(220,38,38,0.35)] animate-pulse'
                    : !held
                      ? 'border-red-950 bg-red-950/20'
                    : selected
                      ? 'border-amber-700 bg-amber-950/15'
                      : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-lg font-black ${sector.accent}`}>{sector.icon}</span>
                    <div>
                      <div className="text-sm font-black text-neutral-100">{sector.location}</div>
                      <div className="text-[11px] font-mono text-neutral-500">{sector.code} · {sector.danger}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {current && <span className="rounded border border-amber-800/50 bg-amber-900/30 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">指挥部</span>}
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${condition === 'lost' ? 'bg-red-900/50 text-red-300' : condition === 'critical' ? 'bg-orange-900/40 text-orange-300' : condition === 'strained' ? 'bg-amber-900/30 text-amber-300' : 'bg-green-950/50 text-green-400'}`}>
                      {conditionLabels[condition]}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 divide-x divide-neutral-800 rounded border border-neutral-800 bg-black/40 py-1.5 text-center">
                  <span className="text-[11px] text-neutral-500">驻军 <b className="block font-mono text-xs text-neutral-100">{garrison}</b></span>
                  <span className="text-[11px] text-neutral-500">工事 <b className={`block text-xs ${fort < 1 ? 'text-red-400' : 'text-stone-200'}`}>Lv.{fort}</b></span>
                  <span className="text-[11px] text-neutral-500">机枪 <b className={`block text-xs ${hmgs.length ? 'text-orange-300' : 'text-neutral-600'}`}>{hmgs.length}</b></span>
                </div>
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
                    <span className="text-neutral-500">防区完整度</span>
                    <span className={integrity < 25 ? 'text-red-300' : integrity < 60 ? 'text-amber-300' : 'text-green-300'}>{integrity}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border border-neutral-800 bg-black">
                    <div className={`h-full transition-all ${integrity < 25 ? 'bg-red-600' : integrity < 60 ? 'bg-amber-600' : 'bg-green-700'}`} style={{ width: `${integrity}%` }} />
                  </div>
                </div>
                <div className={`mt-2 text-[11px] leading-snug ${held ? 'text-neutral-400' : 'font-bold text-red-400'}`}>{held ? sector.role : '敌军已建立突破口'}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-md border border-neutral-700 bg-neutral-950/90 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-base font-black ${selectedSector.accent}`}>{selectedLocation}</span>
                <span className="rounded bg-neutral-800 px-2 py-1 text-[11px] font-bold text-neutral-300">防守评分 {defenseScore}/100</span>
                <span className={`rounded px-2 py-1 text-[11px] font-black ${selectedCondition === 'lost' ? 'bg-red-950 text-red-300' : selectedCondition === 'critical' ? 'bg-orange-950 text-orange-300' : 'bg-green-950/50 text-green-300'}`}>
                  防区 {selectedIntegrity}%
                </span>
                {flashingLocation === selectedLocation && <span className="text-xs font-black text-red-400 animate-pulse">● 交战中</span>}
              </div>
              <div className="mt-2 text-xs text-neutral-300">
                驻军 {selectedGarrison} · 工事 Lv.{selectedFort} · {selectedHmg.length ? selectedHmg.map((squad) => squad.name).join('、') : '无机枪组'}
              </div>
              {stats.location === selectedLocation && (
                <div className={`mt-2 rounded border px-2.5 py-2 text-xs font-black ${commanderRisk >= 0.03 ? 'border-red-800 bg-red-950/40 text-red-300 animate-pulse' : commanderRisk >= 0.015 ? 'border-amber-900 bg-amber-950/20 text-amber-300' : 'border-green-900 bg-green-950/20 text-green-300'}`}>
                  🎖 指挥官在此 · 本层遇袭阵亡概率 {formatCommanderRisk(commanderRisk)}
                </div>
              )}
              {stats.sealedApproaches.includes(selectedLocation) && (
                <div className="mt-2 text-xs font-bold text-cyan-300">⛓ 楼梯已封锁：下一次步兵推进将被削弱</div>
              )}
              {!selectedHeld && (
                <div className="mt-2 rounded border border-red-900/60 bg-red-950/30 px-2.5 py-2 text-xs font-bold leading-relaxed text-red-300">失守后果：{selectedSector.lossEffect}</div>
              )}
            </div>
            <div className="mt-1 h-2.5 w-28 overflow-hidden rounded-full border border-neutral-800 bg-black">
              <div className={`h-full ${defenseScore < 35 ? 'bg-red-700' : defenseScore < 65 ? 'bg-amber-700' : 'bg-green-800'}`} style={{ width: `${defenseScore}%` }} />
            </div>
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {!selectedHeld ? (
              <TacticalAction
                command={`反冲锋夺回${selectedLocation}`}
                label={`⚔ 反冲锋夺回${selectedLocation}`}
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
