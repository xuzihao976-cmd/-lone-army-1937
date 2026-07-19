
import React from 'react';
import { TacticalCard } from '../types';

interface TacticalCardDisplayProps {
  card: TacticalCard;
  onExecute: (cmd: string) => void;
}

const TacticalCardDisplay: React.FC<TacticalCardDisplayProps> = ({ card, onExecute }) => {
  let borderColor = 'border-amber-500';
  let bgColor = 'bg-amber-900/20';
  let textColor = 'text-amber-500';
  
  if (card.color === 'red') {
      borderColor = 'border-red-600';
      bgColor = 'bg-red-900/30';
      textColor = 'text-red-500';
  } else if (card.color === 'blue') {
      borderColor = 'border-blue-500';
      bgColor = 'bg-blue-900/30';
      textColor = 'text-blue-400';
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 w-[min(18rem,calc(100vw-2rem))] animate-slide-up">
       <div 
         className={`relative max-h-[52vh] overflow-y-auto break-words rounded-lg border-2 p-4 ${borderColor} ${bgColor} cursor-pointer shadow-2xl backdrop-blur-md transition-transform duration-200 hover:scale-[1.02] custom-scrollbar`}
         onClick={() => onExecute(card.actionCmd)}
       >
          <div className="absolute top-0 right-0 p-1 opacity-20 text-4xl">★</div>
          
          <div className="flex items-center gap-2 mb-2">
              <span className={`min-w-0 break-words font-serif text-lg font-bold tracking-wider ${textColor}`}>
                  {card.title}
              </span>
          </div>
          
          <p className="text-xs text-neutral-300 font-serif leading-relaxed mb-3">
              {card.description}
          </p>
          
          <div className={`border-t border-white/10 pt-2 text-xs font-bold uppercase tracking-wider ${textColor}`}>
              效果: {card.effectText}
          </div>
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none"></div>
          
          <div className="absolute bottom-0 left-0 w-full h-1 bg-white/20">
              <div className="h-full bg-white/60 animate-progress-shrink w-full origin-left"></div>
          </div>
       </div>
    </div>
  );
};

export default TacticalCardDisplay;
