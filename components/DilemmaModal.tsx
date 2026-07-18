
import React from 'react';
import { Dilemma } from '../types';

interface DilemmaModalProps {
  dilemma: Dilemma;
  onChoice: (actionCmd: string) => void;
}

const DilemmaModal: React.FC<DilemmaModalProps> = ({ dilemma, onChoice }) => {
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-[#1a1a1a] border border-amber-900/50 w-full max-w-md rounded shadow-[0_0_30px_rgba(251,191,36,0.1)] flex flex-col relative overflow-hidden">
        
        {/* Urgent Header */}
        <div className="bg-amber-900/20 border-b border-amber-900/30 p-4 flex items-center gap-3">
            <span className="text-2xl animate-pulse">⚠️</span>
            <h3 className="text-amber-500 font-bold tracking-widest text-lg font-serif">
                突发事态: {dilemma.title}
            </h3>
        </div>

        {/* Content */}
        <div className="p-6 text-neutral-300 font-serif leading-relaxed text-sm sm:text-base border-b border-neutral-800">
            {dilemma.description}
        </div>

        {/* Options */}
        <div className="p-4 bg-[#111] space-y-3">
            {dilemma.options.map((opt, idx) => (
                <button
                    key={idx}
                    onClick={() => onChoice(opt.actionCmd)}
                    className="w-full text-left p-4 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 transition-all group"
                >
                    <div className="font-bold text-neutral-200 group-hover:text-white mb-1">
                        {String.fromCharCode(65 + idx)}. {opt.label}
                    </div>
                    {opt.riskText && (
                        <div className="text-xs text-neutral-500 font-mono group-hover:text-amber-500/80">
                            后果: {opt.riskText}
                        </div>
                    )}
                </button>
            ))}
        </div>
        
        <div className="bg-black text-[10px] text-center text-neutral-600 py-2 font-mono uppercase">
            AWAITING ORDERS /// COMMANDER XIE
        </div>
      </div>
    </div>
  );
};

export default DilemmaModal;
