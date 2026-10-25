import React, { useState } from 'react';
import type { ChapterId, EndingType, SaveSlotMeta, TacticId } from '../types';
import { TacticPicker } from './TacticControls';
import { ACHIEVEMENTS } from '../constants';
import { CHAPTERS, getChapter } from '../data/chapters';
import { chapterTransition, type ChapterArchive } from '../storage/chapterArchive';

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
  return <div className="relative h-full w-full overflow-y-auto bg-[#080808] px-4 py-7 text-neutral-200 sm:px-8">
    <div className="linen-texture pointer-events-none absolute inset-0 opacity-20" />
    <div className="relative mx-auto max-w-xl">
      <header className="mb-6 text-center">
        <p className="text-[11px] font-bold tracking-[0.35em] text-red-500">一九三七 · 战役档案</p>
        <h1 className="mt-2 font-serif text-5xl font-bold tracking-widest sm:text-6xl">孤军</h1>
        <p className="mt-3 text-sm text-neutral-400">不同的阵地，许多个想回家的人。</p>
      </header>
      {showAchievements ? <section className="rounded border border-neutral-700 bg-neutral-950 p-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-xl text-amber-300">四行勋章</h2>
          <button type="button" onClick={() => setShowAchievements(false)} className="rounded border border-neutral-700 px-3 py-2 text-xs">返回选关</button></div>
        <div className="space-y-3">{ACHIEVEMENTS.map(achievement => {
          const unlocked = props.unlockedAchievements.includes(achievement.id);
          return <div key={achievement.id} className="flex gap-3 rounded border border-neutral-800 p-3">
            <span className="text-2xl">{unlocked ? achievement.icon : '🔒'}</span>
            <div><h3 className="font-bold">{achievement.isSecret && !unlocked ? '未揭示的结局' : achievement.title}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-400">{achievement.isSecret && !unlocked ? '完成相应结局后查看。' : achievement.desc}</p></div>
          </div>;
        })}</div>
      </section> : <>
        <div className="mb-3 flex items-center justify-between text-xs"><h2 className="font-bold tracking-wider text-neutral-300">选择章节</h2><span className="text-amber-300">已完成 {completed}/{CHAPTERS.length}</span></div>
        <div className="space-y-2" aria-label="战役章节">
          {CHAPTERS.map(item => <button key={item.id} type="button" aria-pressed={item.id === chapter.id}
            aria-label={`选择第${item.number}章 ${item.title}`} onClick={() => props.onSelectChapter(item.id)}
            className={`w-full rounded border p-3 text-left transition-colors ${item.id === chapter.id ? 'border-amber-700 bg-amber-950/20' : 'border-neutral-800 bg-neutral-950 hover:border-neutral-600'}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-neutral-400">第{item.number}章 · {item.setting}</span>
              <span className="shrink-0 text-[11px] text-amber-300">{props.archive[item.id]?.cleared ? '已完成' : props.chapterSaves[item.id] ? '已有自动档' : '可开始'}</span></div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3"><h3 className="font-serif text-lg font-bold">{item.title}</h3><span className="text-xs text-neutral-400">{item.subtitle}</span></div>
          </button>)}
        </div>
        <section className="mt-4 rounded border border-neutral-800 p-3" aria-label="所选章节说明">
          <p className="text-[11px] text-amber-400">{chapter.duration}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-300">{chapter.description}</p>
          <p className="mt-2 text-xs leading-5 text-amber-200">任务：{chapter.objective}</p>
          <p className="mt-2 text-xs leading-5 text-neutral-400">{chapterTransition(chapter.id, props.archive)}</p>
        </section>
        <TacticPicker chapterId={chapter.id} selected={props.selectedTactic} onSelect={props.onSelectTactic} hasSave={!!saved} />
        <div className="mt-4 space-y-2 border-t border-neutral-800 bg-[#080808] py-3">
          {saved && <button type="button" onClick={props.onContinueChapter} className="w-full rounded border border-amber-700 bg-amber-950/30 py-3 text-sm font-bold text-amber-200">
            继续本关 · {chapter.title}
          </button>}
          <button type="button" onClick={props.onNewGame} className="w-full rounded border border-red-800 bg-red-950/30 py-3 text-sm font-bold text-neutral-100">
            {saved ? '重新开始本关' : `开始${chapter.title}`}
          </button>
          {props.recentSave && props.recentSave.chapterId !== chapter.id && <button type="button" onClick={props.onContinueAutoSave} className="w-full rounded border border-neutral-700 py-2.5 text-xs text-neutral-300">
            继续最近战役 · {getChapter(props.recentSave.chapterId).title}
          </button>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={props.onOpenLoadMenu} disabled={!props.hasSaves} className="rounded border border-neutral-700 py-2.5 text-xs text-neutral-300 disabled:opacity-40">读取手动档案</button>
            <button type="button" onClick={() => setShowAchievements(true)} className="rounded border border-neutral-700 py-2.5 text-xs text-neutral-300">四行勋章 {props.unlockedAchievements.length}/{ACHIEVEMENTS.length}</button>
          </div>
        </div>
      </>}
      <footer className="mt-5 pb-4 text-center text-[11px] leading-5 text-neutral-400">
        <p>成人战争叙事，含具体伤势、死亡与战地创伤。</p>
        <p>前两章为虚构支线；对白及可变战况不作史料。</p>
        <p className="mt-1 text-neutral-500">v3.4.1 · 三章均可本地游玩 · 大嘴鸭游戏出品</p>
      </footer>
    </div>
  </div>;
};
export default StartScreen;
