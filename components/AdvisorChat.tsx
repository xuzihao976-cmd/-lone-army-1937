
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
}

const AdvisorChat: React.FC<AdvisorChatProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: 'advisor', text: '指挥官，我是您的战地顾问。关于【胜利条件】、【数值作用】或【新手教程】，请随时询问我。' }
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
    const newMsg: Message = { id: Date.now().toString(), role: 'user', text: userText };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);

    // Prepare history for API (exclude init message if needed, or keep it)
    const apiHistory = updatedMessages
        .filter(m => m.id !== 'init')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));

    try {
        const controller = new AbortController();
        requestRef.current = controller;
        const reply = await generateAdvisorResponse(apiHistory, userText, controller.signal);
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
        <div className="bg-[#1a1a1a] w-full max-w-md h-[500px] border border-neutral-600 rounded-sm shadow-2xl flex flex-col relative font-mono">
            {/* Header */}
            <div className="bg-neutral-800 p-3 border-b border-neutral-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <h3 className="text-neutral-200 font-bold tracking-widest text-sm">战地顾问 / 教程指南</h3>
                </div>
                <button onClick={closeAdvisor} className="text-neutral-400 hover:text-white transition-colors" aria-label="关闭战地顾问">
                    ✕
                </button>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#111]">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] text-xs sm:text-sm p-2 rounded leading-relaxed border ${
                            msg.role === 'user' 
                                ? 'bg-neutral-800 text-neutral-300 border-neutral-700' 
                                : 'bg-[#0a200a] text-green-100/90 border-green-900/50'
                        }`}>
                            {msg.role === 'advisor' && <div className="text-[9px] text-green-700/70 mb-1 font-bold">参谋部:</div>}
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[#0a200a] border border-green-900/50 p-2 rounded text-xs text-green-500 animate-pulse">
                            正在查阅档案...
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-neutral-800 border-t border-neutral-700">
                <div className="flex items-center justify-between mb-2 text-[9px] font-mono">
                    <span className={source === 'siliconflow' ? 'text-green-500' : 'text-neutral-500'}>
                        {source === 'siliconflow' ? '● 免费 AI 增强' : '● 本地规则顾问'}
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
                        className="flex-1 bg-black text-white text-sm px-3 py-2 border border-neutral-600 focus:border-neutral-400 outline-none rounded-sm placeholder-neutral-600"
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 text-xs font-bold border border-neutral-600 rounded-sm transition-colors disabled:opacity-50"
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
