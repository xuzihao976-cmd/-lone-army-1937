
import React from 'react';
import { SaveSlotMeta } from '../types';

interface SaveLoadModalProps {
  mode: 'save' | 'load';
  slots: SaveSlotMeta[];
  onSelectSlot: (slotId: number) => void;
  onClose: () => void;
}

const SaveLoadModal: React.FC<SaveLoadModalProps> = ({ mode, slots, onSelectSlot, onClose }) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col p-4 sm:p-8 animate-fade-in text-neutral-200">
      <div className="max-w-5xl mx-auto w-full flex flex-col h-full border border-neutral-800 bg-[#0a0a0a] rounded shadow-2xl">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 bg-neutral-900">
            <h2 className="text-xl font-bold font-serif tracking-widest text-amber-500">
                {mode === 'save' ? '保存作战记录' : '读取作战记录'}
            </h2>
            <button onClick={onClose} className="text-neutral-500 hover:text-white px-2 text-xl">✕</button>
        </div>

        {/* Grid Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {slots.map((slot) => (
                    <button
                        key={slot.id}
                        onClick={() => onSelectSlot(slot.id)}
                        className={`
                            relative h-24 border rounded text-left p-3 transition-all duration-200 group flex flex-col justify-between
                            ${slot.isEmpty 
                                ? 'border-neutral-800 bg-neutral-900/30 text-neutral-600 hover:bg-neutral-800 hover:border-neutral-600' 
                                : 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 hover:border-amber-600/50'
                            }
                        `}
                    >
                        <div className="flex justify-between w-full text-[10px] font-mono opacity-50 mb-1">
                            <span>编号 {String(slot.id + 1).padStart(2, '0')}</span>
                            {!slot.isEmpty && <span>{formatDate(slot.savedAt)}</span>}
                        </div>

                        {slot.isEmpty ? (
                            <div className="flex items-center justify-center h-full text-xs tracking-widest opacity-30">
                                -- 空白档案 --
                            </div>
                        ) : (
                            <>
                                <div className="text-amber-500 font-bold text-sm">
                                    第 {slot.day} 天 <span className="text-neutral-500 text-xs font-normal">| {slot.location}</span>
                                </div>
                                <div className="flex justify-between items-end w-full">
                                    <span className="text-xs text-neutral-400">幸存: {slot.soldiers}人</span>
                                    {mode === 'save' && (
                                        <span className="text-[9px] text-amber-700 uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                                            覆盖存档
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                    </button>
                ))}
            </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-900 text-center text-[10px] text-neutral-600 font-mono">
            {mode === 'save' ? '选择一个位置保存当前进度。' : '选择一个档案以继续指挥。'}
        </div>
      </div>
    </div>
  );
};

export default SaveLoadModal;
