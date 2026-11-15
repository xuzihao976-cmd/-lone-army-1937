import React from 'react';
import type { GameStats } from '../types';
import { getChapter, isShortChapter } from '../data/chapters';
import { formatCampaignDate } from '../engine/time';

export default function BattleMasthead({ stats, onMenu }: { stats: GameStats; onMenu: () => void }) {
  const chapter = getChapter(stats.chapterId);
  const short = isShortChapter(stats);
  return <header className="battle-masthead">
    <div className="battle-identity">
      <div><span className="battle-brand">孤军</span><span className="battle-chapter">{chapter.title}</span></div>
      <p>{short ? `第${chapter.number}章 · 虚构支线` : `第${stats.day}天 · ${stats.location}`}</p>
    </div>
    <div className="battle-clock"><time>{stats.currentTime}</time><span>{short ? '本章作战时间' : formatCampaignDate(stats.day)}</span></div>
    <button type="button" className="masthead-menu" onClick={onMenu} aria-label="打开战时菜单">菜单</button>
  </header>;
}
