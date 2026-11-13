
import React from 'react';
import { TacticalCard } from '../types';

interface TacticalCardDisplayProps {
  card: TacticalCard;
  onExecute: (cmd: string) => void;
  onDecline: () => void;
  onClose: () => void;
}

const TacticalCardDisplay: React.FC<TacticalCardDisplayProps> = ({ card, onExecute, onDecline, onClose }) => {
  let borderColor = 'border-amber-500';
  let textColor = 'text-amber-500';
  
  if (card.color === 'red') {
      borderColor = 'border-red-600';
      textColor = 'text-red-500';
  } else if (card.color === 'blue') {
      borderColor = 'border-blue-500';
      textColor = 'text-blue-400';
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="战地际遇">
       <div 
         className={`relative max-h-[90dvh] w-full max-w-md overflow-y-auto break-words rounded-lg border-2 bg-neutral-950 p-4 ${borderColor} shadow-2xl custom-scrollbar`}
       >
          <p className="mb-2 text-[11px] font-bold tracking-wider text-neutral-300">战地际遇 · 不占本章战术牌</p>
          
          <div className="flex items-center gap-2 mb-2">
              <span className={`min-w-0 break-words font-serif text-lg font-bold tracking-wider ${textColor}`}>
                  {card.title}
              </span>
          </div>
          <button type="button" onClick={onClose} className="mt-2 min-h-11 w-full rounded border border-neutral-700 px-2 py-2.5 text-xs text-neutral-300">稍后再看</button>
          
          <p className="text-xs text-neutral-300 font-serif leading-relaxed mb-3">
              {card.description}
          </p>
          
          <div className={`border-t border-white/10 pt-2 text-xs font-bold uppercase tracking-wider ${textColor}`}>
              接受后生效： {card.effectText}
          </div>
          
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <button type="button" onClick={() => onExecute(card.actionCmd)} className="min-h-11 rounded border border-amber-700 bg-neutral-950 px-2 py-2.5 font-bold text-amber-100">{card.id === 'morale_boost' ? '收下家书' : '接受际遇'}</button>
            <button type="button" onClick={onDecline} className="min-h-11 rounded border border-neutral-500 bg-neutral-950 px-2 py-2.5 text-neutral-300">放弃本次机会</button>
          </div>
       </div>
    </div>
  );
};

export default TacticalCardDisplay;
