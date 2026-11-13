import React, { useState } from 'react';
import type { ChapterId, EndingType, SaveSlotMeta, TacticId } from '../types';
import { TacticPicker } from './TacticControls';
import { ACHIEVEMENTS } from '../constants';
import { CHAPTERS, getChapter } from '../data/chapters';
import { chapterTransition, type ChapterArchive } from '../storage/chapterArchive';
import { getTactic } from '../data/tactics';

interface StartScreenProps {
  onNewGame: () => void;
  onContinueAutoSave: () => void;
  onContinueChapter: () => void;
  onOpenLoadMenu: () => void;
  onSelectChapter: (id: ChapterId) => void;
  selectedChapter: ChapterId;
  selectedTactic: TacticId | null;
  onSelectTactic: (id: TacticId | null) => void;
  chapterSaves: Partial<Record<ChapterId, SaveSlotMeta>>;
  archive: ChapterArchive;
  recentSave: SaveSlotMeta | null;
  hasSaves: boolean;
  unlockedAchievements: EndingType[];
}

const StartScreen: React.FC<StartScreenProps> = (props) => {
  const [showAchievements, setShowAchievements] = useState(false);
  const chapter = getChapter(props.selectedChapter);
  const saved = props.chapterSaves[chapter.id];
  const completed = Object.values(props.archive).filter(record => record?.cleared).length;
  const tactic = getTactic(props.selectedTactic ?? undefined);
  return <div className="archive-screen">
    <div className="archive-scroll custom-scrollbar">
    <div className="archive-layout">
      <header className="archive-heading">
        <p className="archive-kicker">文字策略 / 一九三七</p>
        <h1>孤军<span aria-hidden="true" className="archive-seal">战役档案</span></h1>
        <p className="archive-tagline">不同的阵地，<br className="hidden lg:block" />许多个想回家的人。</p>
        <div className="archive-rule" aria-hidden="true"><span>一</span><span>九</span><span>三</span><span>七</span></div>
        <p className="archive-note hidden lg:block">三处阵地，三份独立记录。<br />在字里行间，做出你的选择。</p>
      </header>
      <div className="min-w-0">
      {showAchievements ? <section className="archive-sheet p-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-xl text-amber-300">四行勋章</h2>
          <button type="button" onClick={() => setShowAchievements(false)} className="min-h-11 rounded border border-neutral-700 px-3 py-2 text-xs">返回选关</button></div>
        <div className="space-y-3">{ACHIEVEMENTS.map(achievement => {
          const unlocked = props.unlockedAchievements.includes(achievement.id);
          return <div key={achievement.id} className="flex gap-3 rounded border border-neutral-800 p-3">
            <span aria-hidden="true" className="archive-medal">{unlocked ? '✦' : '—'}</span>
            <div><h3 className="font-bold">{achievement.isSecret && !unlocked ? '未揭示的结局' : achievement.title}</h3>
              <p className="mt-1 text-xs text-amber-200">{unlocked ? '已获得' : '未获得'}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-400">{achievement.isSecret && !unlocked ? '完成相应结局后查看。' : achievement.desc}</p></div>
          </div>;
        })}</div>
      </section> : <>
        <div className="archive-section-label"><h2>选择章节</h2><span>已完成 {completed}/{CHAPTERS.length}</span></div>
        <div className="chapter-list" aria-label="战役章节">
          {CHAPTERS.map(item => <button key={item.id} type="button" aria-pressed={item.id === chapter.id}
            aria-label={`选择第${item.number}章 ${item.title}`} onClick={() => props.onSelectChapter(item.id)}
            className="chapter-entry">
            <span className="chapter-number" aria-hidden="true">{item.number}</span>
            <div className="min-w-0 flex-1"><div className="chapter-meta"><span>{item.setting}</span>
              <span className="chapter-state">{props.archive[item.id]?.cleared ? '已完成' : props.chapterSaves[item.id] ? '已有自动档' : '可开始'}</span></div>
              <div className="chapter-title"><h3>{item.title}</h3><span>{item.subtitle}</span></div>
            </div>
            <span className="chapter-check" aria-hidden="true">{item.id === chapter.id ? '✓' : '›'}</span>
          </button>)}
        </div>
        <section className="chapter-brief" aria-label="所选章节说明">
          <p className="text-xs text-neutral-400">{chapter.duration}</p>
          <p className="mt-2 text-sm leading-6 text-amber-100">任务：{chapter.objective}</p>
          <details className="chapter-background">
            <summary>背景与小队档案</summary>
            <p>{chapter.description}</p>
            <p>{chapterTransition(chapter.id, props.archive)}</p>
          </details>
        </section>
        <TacticPicker chapterId={chapter.id} selected={props.selectedTactic} onSelect={props.onSelectTactic} hasSave={!!saved} />
        <div className="archive-utilities">
          {saved && <button type="button" onClick={props.onNewGame}>重新开始本关</button>}
          {props.recentSave && props.recentSave.chapterId !== chapter.id && <button type="button" onClick={props.onContinueAutoSave} className="w-full rounded border border-neutral-700 py-2.5 text-xs text-neutral-300">
            继续最近战役 · {getChapter(props.recentSave.chapterId).title}
          </button>}
          <button type="button" onClick={props.onOpenLoadMenu} disabled={!props.hasSaves}>读取手动档案</button>
          <button type="button" onClick={() => setShowAchievements(true)}>四行勋章 {props.unlockedAchievements.length}/{ACHIEVEMENTS.length}</button>
        </div>
      </>}
      <footer className="archive-footer">
        <p>成人战争叙事，含具体伤势、死亡与战地创伤。</p>
        <p>前两章为虚构支线；对白及可变战况不作史料。</p>
        <p className="mt-1 text-neutral-500">v3.7.0 · 三章均可本地游玩 · 大嘴鸭游戏出品</p>
      </footer>
      </div>
    </div>
    </div>
    {!showAchievements && <div className="archive-dock">
      <div className="archive-dock-inner">
        <div className="archive-selection"><span>{chapter.title}</span><span>{saved ? '继续沿用档内战术' : `新开战术：${tactic?.title ?? '不携带'}（上方可选）`}</span></div>
        <button type="button" className="archive-primary" onClick={saved ? props.onContinueChapter : props.onNewGame}>
          <span>{saved ? `继续本关 · ${chapter.title}` : `开始${chapter.title}`}</span><span aria-hidden="true">→</span>
        </button>
      </div>
    </div>}
  </div>;
};
export default StartScreen;
