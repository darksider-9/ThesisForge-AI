import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UserInput, ApiConfig } from '../types';
import { Wand2, Loader2, Settings2, Sparkles, ArrowDown, ClipboardCopy, Send, RotateCcw, Bot, User } from 'lucide-react';
import { runRefinementChat } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface InputFormProps {
  input: UserInput;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
  isGenerating: boolean;
  // Pass config for the internal refinement call
  apiConfig?: ApiConfig;
}

interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

const InputForm: React.FC<InputFormProps & { apiConfig?: ApiConfig }> = ({ 
  input, 
  onChange, 
  onSubmit, 
  onOpenSettings, 
  isGenerating,
  apiConfig 
}) => {
  const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);
  
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Result State
  const [refinedResult, setRefinedResult] = useState<{title: string, field: string, refinedContext: string} | null>(null);

  useEffect(() => {
      if (isRefineModalOpen && messages.length === 0) {
          // Initial greeting
          setMessages([{
              role: 'model',
              content: "您好，我是您的学术论文代笔顾问（Ghostwriter）。\n\n为了帮您撰写一篇达到 Top Conference/Journal 水准的硕士论文，我需要先了解您的**研究领域**和初步的**选题想法**。\n\n您想研究哪个方向？（例如：医学图像分割、大语言模型微调、自动驾驶感知等）"
          }]);
      }
  }, [isRefineModalOpen]);

  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMsg: ChatMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsRefining(true);

    try {
        const history = [...messages, userMsg];
        const result = await runRefinementChat(history, apiConfig);
        
        // Add model response
        setMessages(prev => [...prev, { role: 'model', content: result.text }]);
        
        // Check if finished
        if (result.finished && result.data) {
            setRefinedResult(result.data);
        }

    } catch (e) {
        setMessages(prev => [...prev, { role: 'model', content: "❌ 连接中断，请检查 API 配置或重试。" }]);
    } finally {
        setIsRefining(false);
    }
  };

  const handleResetChat = () => {
      setMessages([]);
      setRefinedResult(null);
      // Effect will re-trigger greeting
  };

  const applyRefinement = () => {
      if (refinedResult) {
          const eventField = { target: { name: 'field', value: refinedResult.field } } as any;
          const eventTopic = { target: { name: 'topic', value: refinedResult.title } } as any;
          const eventFocus = { target: { name: 'specificFocus', value: refinedResult.refinedContext } } as any;
          
          onChange(eventField);
          onChange(eventTopic);
          onChange(eventFocus);
          
          setIsRefineModalOpen(false);
      }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="bg-indigo-600 w-2 h-6 rounded-full inline-block"></span>
            论文基础信息
        </h2>
        <button 
            onClick={onOpenSettings}
            className="text-slate-400 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg"
            title="Configure API"
        >
            <Settings2 className="w-5 h-5" />
        </button>
      </div>
      
      {/* Refine Button */}
      <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
        <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-blue-800 flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                学术想法顾问 (Ghostwriter)
            </span>
            <span className="text-[10px] text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-100">AI Interview</span>
        </div>
        <p className="text-xs text-blue-600 mb-3 leading-relaxed">
            不知道如何下笔？AI 顾问将通过专业访谈，帮您梳理核心算法、实验矩阵和创新点，生成完美的开题报告。
        </p>
        <button 
            onClick={() => setIsRefineModalOpen(true)}
            disabled={isGenerating}
            className="w-full py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors shadow-sm"
        >
            ✨ 开启学术访谈
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">研究领域 / 专业 (Field)</label>
          <input
            type="text"
            name="field"
            value={input.field}
            onChange={onChange}
            placeholder="例如：计算机科学、分子生物学"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
            disabled={isGenerating}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">论文题目 / 主题 (Topic)</label>
          <input
            type="text"
            name="topic"
            value={input.topic}
            onChange={onChange}
            placeholder="例如：基于LLM的边缘设备优化研究"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
            disabled={isGenerating}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">具体侧重点 / 核心假设 (Focus)</label>
          <textarea
            name="specificFocus"
            value={input.specificFocus}
            onChange={onChange}
            placeholder="描述你的研究假设、预期目标..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all h-32 resize-none custom-scrollbar text-xs font-mono"
            disabled={isGenerating}
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={isGenerating || !input.topic}
          className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
            isGenerating || !input.topic
              ? 'bg-slate-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-200'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Agent集群工作中...
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              开始执行工作流
            </>
          )}
        </button>
      </div>

      {/* Refinement Modal - Rendered via Portal */}
      {isRefineModalOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-600" />
                          学术代笔顾问 (Ghostwriter Interview)
                      </h3>
                      <div className="flex items-center gap-2">
                         <button onClick={handleResetChat} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 text-xs flex items-center gap-1 font-medium transition-colors">
                            <RotateCcw className="w-4 h-4" /> 重置
                         </button>
                         <button onClick={() => setIsRefineModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                            <Settings2 className="w-5 h-5" />
                         </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                      {/* Left: Chat Interface */}
                      <div className="flex-[3] flex flex-col border-r border-slate-100 bg-white">
                          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                              {messages.map((msg, idx) => (
                                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                      {msg.role === 'model' && (
                                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                              <Bot className="w-5 h-5 text-indigo-600" />
                                          </div>
                                      )}
                                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                          msg.role === 'user' 
                                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                                          : 'bg-slate-50 border border-slate-100 text-slate-700 rounded-tl-none'
                                      }`}>
                                          <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 text-inherit">
                                            <ReactMarkdown>
                                              {msg.content}
                                            </ReactMarkdown>
                                          </div>
                                      </div>
                                      {msg.role === 'user' && (
                                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                                              <User className="w-5 h-5 text-slate-500" />
                                          </div>
                                      )}
                                  </div>
                              ))}
                              {isRefining && (
                                  <div className="flex gap-3 justify-start">
                                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                          <Bot className="w-5 h-5 text-indigo-600" />
                                      </div>
                                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                          <span className="text-xs text-slate-400">思考中...</span>
                                      </div>
                                  </div>
                              )}
                              <div ref={chatEndRef} />
                          </div>

                          <div className="p-4 border-t border-slate-100 bg-slate-50">
                              <div className="flex gap-2">
                                  <input 
                                      type="text"
                                      value={inputMessage}
                                      onChange={(e) => setInputMessage(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && !isRefining && handleSendMessage()}
                                      placeholder="回复顾问的问题 (例如：我的核心算法是基于Transformer改进的...)"
                                      className="flex-1 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                      disabled={isRefining}
                                  />
                                  <button 
                                      onClick={handleSendMessage}
                                      disabled={!inputMessage.trim() || isRefining}
                                      className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                      <Send className="w-5 h-5" />
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* Right: Final Result Preview */}
                      <div className="flex-[2] flex flex-col bg-slate-50/50 p-4 border-l border-slate-100">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                              <ClipboardCopy className="w-4 h-4" /> 最终方案 (Final Plan)
                          </label>
                          
                          {refinedResult ? (
                              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                                  <div className="bg-green-50 border border-green-200 p-3 rounded-lg flex items-start gap-2">
                                      <div className="bg-green-100 p-1 rounded-full text-green-600 mt-0.5"><Sparkles className="w-3 h-3" /></div>
                                      <div>
                                          <h4 className="text-sm font-bold text-green-800">方案已生成</h4>
                                          <p className="text-xs text-green-700 mt-1">顾问已整理完毕，您可以点击右下角按钮应用到系统。</p>
                                      </div>
                                  </div>
                                  
                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                      <div>
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Field</span>
                                          <div className="text-sm font-medium text-slate-800">{refinedResult.field}</div>
                                      </div>
                                      <div className="h-px bg-slate-100"></div>
                                      <div>
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thesis Title</span>
                                          <div className="text-sm font-bold text-indigo-700">{refinedResult.title}</div>
                                      </div>
                                  </div>

                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detailed Context</span>
                                      <div className="text-xs font-mono text-slate-600 whitespace-pre-wrap leading-relaxed overflow-y-auto custom-scrollbar flex-1 bg-slate-50 p-2 rounded border border-slate-100 h-64">
                                          {refinedResult.refinedContext}
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                  <Bot className="w-12 h-12 mb-3 opacity-20" />
                                  <p className="text-sm font-medium">等待生成最终方案...</p>
                                  <p className="text-xs mt-2 text-center max-w-[200px] opacity-60">请继续与顾问对话，直到信息收集完毕。</p>
                              </div>
                          )}
                          
                          <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-slate-200">
                                <button 
                                    onClick={() => setIsRefineModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg text-sm"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={applyRefinement}
                                    disabled={!refinedResult}
                                    className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-green-200 text-sm"
                                >
                                    <ArrowDown className="w-4 h-4" />
                                    应用方案
                                </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>,
          document.body
      )}
    </div>
  );
};

export default InputForm;