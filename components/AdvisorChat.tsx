import type { GameStats } from '../types';

import React, { useState, useRef, useEffect } from 'react';
import { generateAdvisorResponse, type AiSource } from '../services/aiClient';

interface Message {
  id: string;
  role: 'user' | 'advisor';
  text: string;
}

interface AdvisorChatProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStats;
  aiEnabled: boolean;
}

const AdvisorChat: React.FC<AdvisorChatProps> = ({ isOpen, onClose, stats, aiEnabled }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: 'advisor', text: '长官，我在。问战况、问规则，或说两句都行。这里仅答复和预览，不执行军令；要行动，请回主界面下令。本地问答无需 AI。' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<AiSource>('local');
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { if (!aiEnabled) { requestRef.current?.abort(); setSource('local'); } }, [aiEnabled]);

  const closeAdvisor = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsLoading(false);
    onClose();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);

    // Add User Message
    const newMsg: Message = { id: Date.now().toString(), role: 'user', text: userText.length > 500 ? '[超长输入：'+userText.length+'字，未执行]' : userText };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);

    // Prepare history for API (exclude init message if needed, or keep it)
    const apiHistory = updatedMessages
        .filter(m => m.id !== 'init')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));

    try {
        const controller = new AbortController();
        requestRef.current = controller;
        const reply = await generateAdvisorResponse(apiHistory, userText, controller.signal, {stats, enabled: aiEnabled});
        if (!controller.signal.aborted) {
          setSource(reply.source);
          setMessages(prev => [...prev, { id: Date.now().toString() + '_adv', role: 'advisor', text: reply.text }]);
        }
    } catch {
        setMessages(prev => [...prev, { id: Date.now().toString() + '_err', role: 'advisor', text: '通讯中断。请重新提问，本地规则查询仍然可用。' }]);
    } finally {
        requestRef.current = null;
        setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-neutral-950 w-full max-w-md h-[min(560px,calc(100dvh-2rem))] border border-neutral-600 rounded-sm shadow-2xl flex flex-col relative readable-panel" role="dialog" aria-modal="true" aria-labelledby="advisor-title">
            {/* Header */}
            <div className="bg-neutral-900 px-4 py-2 border-b border-neutral-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <h3 id="advisor-title" className="text-neutral-200 font-bold tracking-wider text-sm">战地顾问 · 只读问答</h3>
                </div>
                <button onClick={closeAdvisor} className="min-h-11 min-w-11 text-neutral-300 hover:text-white transition-colors" aria-label="关闭战地顾问">
                    ✕
                </button>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-950">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[95%] whitespace-pre-wrap break-words text-sm p-3 rounded-sm leading-7 border ${
                            msg.role === 'user' 
                                ? 'bg-neutral-800 text-neutral-300 border-neutral-700' 
                                : 'bg-neutral-900 text-neutral-100 border-neutral-700'
                        }`}>
                            {msg.role === 'advisor' && <div className="mb-1 text-xs font-bold text-amber-200">参谋部：</div>}
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[#0a200a] border border-green-900/50 p-2 rounded text-xs text-green-500 animate-pulse">
                            正在整理答复……
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-neutral-800 border-t border-neutral-700">
                <div className="mb-2 flex items-center justify-between text-[11px] font-mono">
                    <span className={source === 'cloudflare' ? 'text-green-500' : 'text-neutral-500'}>
                        {source === 'cloudflare' ? '● 本次由 AI 回答' : '● 本地规则顾问'}
                    </span>
                    {isLoading && (
                      <button type="button" onClick={() => requestRef.current?.abort()} className="text-red-500/70 hover:text-red-400">
                        取消查询
                      </button>
                    )}
                </div>
                <form onSubmit={handleSend} className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="询问：怎么获胜？士气有什么用？"
                        aria-label="顾问问题"
                        className="min-h-11 min-w-0 flex-1 bg-neutral-950 text-neutral-100 text-base px-3 py-2 border border-neutral-600 rounded-sm placeholder-neutral-400"
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="min-h-11 shrink-0 bg-neutral-700 hover:bg-neutral-600 text-neutral-100 px-4 py-2 text-sm font-bold border border-neutral-600 rounded-sm transition-colors disabled:opacity-50"
                    >
                        查询
                    </button>
                </form>
            </div>
        </div>
    </div>
  );
};

export default AdvisorChat;
