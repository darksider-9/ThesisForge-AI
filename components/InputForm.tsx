
import React, { useState } from 'react';
import { UserInput, ApiConfig } from '../types';
import { Wand2, Loader2, Settings2, Sparkles, ArrowDown, ClipboardCopy } from 'lucide-react';
import { runIdeaRefinementAgent } from '../services/geminiService';

interface InputFormProps {
  input: UserInput;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
  isGenerating: boolean;
  // Pass config for the internal refinement call
  apiConfig?: ApiConfig;
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
  const [rawIdea, setRawIdea] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refinedResult, setRefinedResult] = useState<{title: string, field: string, refinedContext: string} | null>(null);

  const handleRefine = async () => {
    if (!rawIdea.trim()) return;
    setIsRefining(true);
    try {
        const result = await runIdeaRefinementAgent(rawIdea, apiConfig);
        setRefinedResult(result);
    } catch (e) {
        alert("优化失败，请检查网络或API配置。");
    } finally {
        setIsRefining(false);
    }
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
                想法深度优化
            </span>
            <span className="text-[10px] text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-100">Recommended</span>
        </div>
        <p className="text-xs text-blue-600 mb-3 leading-relaxed">
            只有零散的实验想法？粘贴在这里，AI 科研顾问将为您整理成标准的论文结构、实验矩阵和章节逻辑。
        </p>
        <button 
            onClick={() => setIsRefineModalOpen(true)}
            disabled={isGenerating}
            className="w-full py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors shadow-sm"
        >
            ✨ 打开想法优化器
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

      {/* Refinement Modal */}
      {isRefineModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-600" />
                          科研想法深度优化 (Research Idea Refiner)
                      </h3>
                      <button onClick={() => setIsRefineModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
                          <Settings2 className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                      {/* Left: Raw Input */}
                      <div className="flex-1 p-4 flex flex-col border-r border-slate-100 bg-white">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2">原始想法 (Raw Input)</label>
                          <textarea 
                              value={rawIdea}
                              onChange={(e) => setRawIdea(e.target.value)}
                              placeholder="在此处粘贴您杂乱的实验记录、创新点片段、对比方法列表..."
                              className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm leading-relaxed"
                          />
                          <button 
                              onClick={handleRefine}
                              disabled={isRefining || !rawIdea.trim()}
                              className="mt-4 w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                              {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              {isRefining ? "AI 正在整理文献逻辑..." : "开始整理与分析"}
                          </button>
                      </div>

                      {/* Right: Preview */}
                      <div className="flex-1 p-4 flex flex-col bg-slate-50/50">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2">优化结果预览 (Preview)</label>
                          {refinedResult ? (
                              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Field</span>
                                      <div className="text-sm font-semibold text-slate-800">{refinedResult.field}</div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Title</span>
                                      <div className="text-sm font-semibold text-indigo-700">{refinedResult.title}</div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Structured Context</span>
                                      <div className="text-xs font-mono text-slate-600 whitespace-pre-wrap leading-relaxed h-[300px] overflow-y-auto custom-scrollbar p-2 bg-slate-50 rounded border border-slate-100">
                                          {refinedResult.refinedContext}
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                  <ClipboardCopy className="w-8 h-8 mb-2 opacity-50" />
                                  <p className="text-sm">等待分析结果...</p>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                      <button 
                          onClick={() => setIsRefineModalOpen(false)}
                          className="px-6 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                      >
                          取消
                      </button>
                      <button 
                          onClick={applyRefinement}
                          disabled={!refinedResult}
                          className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-green-200"
                      >
                          <ArrowDown className="w-4 h-4" />
                          应用到表格
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default InputForm;
