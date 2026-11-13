import React, { useState } from 'react';
import type { ChapterId, GameStats, Location, TacticId } from '../types';
import { chapterTactics, getTactic, tacticCommand } from '../data/tactics';
import { getTacticPlan } from '../engine/tacticPlans';
import { getActionPreview } from '../engine/actionPreview';
import { SECTOR_LOCATIONS } from '../engine/strategicDefense';
import ActionPreviewBar from './ActionPreviewBar';

export function TacticPicker({ chapterId, selected, onSelect, hasSave }: {
  chapterId: ChapterId; selected: TacticId | null; onSelect: (id: TacticId | null) => void; hasSave: boolean;
}) {
  return <section className="mt-4 rounded border border-neutral-800 p-3" aria-label="新战役战术选择">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-amber-200">本章战术 · 二选一</h2>
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className="min-h-10 rounded border border-neutral-700 px-3 text-xs text-neutral-300">不携带</button></div>
    <p className="mt-1 text-xs leading-5 text-neutral-400">新开本关时携带，局内最多使用一次。普通军令始终可用。{hasSave ? '继续已有档案会沿用档内选择。' : ''}</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">{chapterTactics(chapterId).map(card => <button type="button" key={card.id}
      aria-pressed={selected === card.id} aria-label={`携带${card.title}`} onClick={() => onSelect(card.id)}
      className={`rounded border p-3 text-left ${selected === card.id ? 'border-amber-700 bg-amber-950/25' : 'border-neutral-700 bg-neutral-950'}`}>
      <h3 className="text-sm font-bold text-neutral-100">{card.title}{selected === card.id ? ' · 已选' : ''}</h3>
      <p className="mt-1 text-xs leading-5 text-neutral-300">{card.effect}</p>
      <p className="mt-1 text-xs leading-5 text-amber-200">代价：{card.tradeoff}</p>
    </button>)}</div>
  </section>;
}

export function TacticStatus({ stats, disabled, onPreview }: { stats: GameStats; disabled: boolean; onPreview: () => void }) {
  const card = getTactic(stats.equippedTactic?.id);
  if (!card) return null;
  return <div className="flex items-center justify-between gap-2 rounded border border-amber-900/50 bg-black/30 px-3 py-1.5 text-xs">
    <span className="min-w-0 text-amber-200">战术：{card.title} · {stats.equippedTactic?.spent ? '已使用' : '本章一次'}</span>
    <button type="button" onClick={onPreview} disabled={disabled || stats.equippedTactic?.spent}
      className="shrink-0 rounded border border-neutral-600 px-3 py-2 text-neutral-200 disabled:opacity-40">查看战术</button>
  </div>;
}

export function TacticUseModal({ stats, onClose, onExecute }: {
  stats: GameStats; onClose: () => void; onExecute: (command: string, label: string) => void;
}) {
  const [target, setTarget] = useState<Location>(stats.location);
  const card = getTactic(stats.equippedTactic?.id);
  if (!card) return null;
  const command = tacticCommand(card.id, card.id === 'emergency_shoring' ? target : undefined);
  const plan = getTacticPlan(stats, command)!;
  const retreat = card.id === 'covered_withdrawal';
  // Project the confirmed retreat, without arming or mutating the actual game.
  const preview = getActionPreview(retreat ? { ...stats, pendingRetreat: 'confirm_tactic_retreat' } : stats,
    retreat ? 'confirm_tactic_retreat' : command);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="tactic-title">
    <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded border border-amber-800 bg-neutral-950 p-4 text-neutral-200">
      <div className="flex items-start justify-between gap-2"><h2 id="tactic-title" className="font-serif text-xl font-bold text-amber-200">{card.title} · 行动预览</h2>
        <button type="button" onClick={onClose} aria-label="关闭战术预览" className="min-h-10 min-w-10 rounded border border-neutral-700">✕</button></div>
      <p className="mt-3 text-sm leading-6">{card.description}</p>
      {card.id === 'emergency_shoring' && <label className="mt-3 block text-sm">修补楼层
        <select value={target} onChange={event => setTarget(event.target.value as Location)} className="mt-1 w-full rounded border border-neutral-600 bg-neutral-900 p-3">
          {SECTOR_LOCATIONS.map(location => <option key={location} value={location}>{location} · 完整度{stats.sectorIntegrity[location]}%</option>)}
        </select></label>}
      <div className="mt-3"><ActionPreviewBar preview={preview} /></div>
      <p className="mt-3 text-xs leading-5 text-neutral-400">查看和取消都不消耗战术牌、资源或行动时间。{retreat ? '继续后还需二次确认，届时才执行撤离。' : '确认执行后按本次行动结算。'}</p>
      <div className="mt-4 grid gap-2">
        <button type="button" disabled={!plan.available} onClick={() => onExecute(command, `${card.title} · ${plan.baseCommand}`)}
          className="min-h-12 rounded border border-amber-700 bg-amber-950/30 px-3 py-3 text-sm font-bold text-amber-100 disabled:opacity-40">
          {!plan.available ? '当前不可执行' : retreat ? '继续确认撤离' : `确认执行 · ${plan.minutes}分钟`}
        </button>
        <button type="button" onClick={onClose} className="min-h-12 rounded border border-neutral-700 px-3 py-3 text-sm">取消，保留战术牌</button>
      </div>
    </div>
  </div>;
}
