
import React, { useState } from 'react';
import { Agent } from '../types';
import { Bot, FileText, FlaskConical, Image as ImageIcon, Table, Plus, X, ArrowRight, Settings, Code, GitMerge, Eye, Terminal } from 'lucide-react';
import { generateAgentPrompt } from '../services/geminiService';

interface WorkflowBuilderProps {
  agents: Agent[];
  onAddAgent: (index: number, agent: Agent) => void;
  onRemoveAgent: (id: string) => void;
  isLocked: boolean;
}

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ agents, onAddAgent, onRemoveAgent, isLocked }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [insertIndex, setInsertIndex] = useState<number>(0);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

  const [viewingAgent, setViewingAgent] = useState<Agent | null>(null);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'layout': return <FileText className="w-5 h-5" />;
      case 'flask': return <FlaskConical className="w-5 h-5" />;
      case 'image': return <ImageIcon className="w-5 h-5" />;
      case 'table': return <Table className="w-5 h-5" />;
      case 'code': return <Code className="w-5 h-5" />;
      case 'merge': return <GitMerge className="w-5 h-5" />;
      default: return <Bot className="w-5 h-5" />;
    }
  };

  const handleOpenAddModal = (index: number) => {
    if (isLocked) return;
    setInsertIndex(index);
    setNewAgentName('');
    setNewAgentDesc('');
    setIsAddModalOpen(true);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName || !newAgentDesc) return;
    setIsGeneratingPrompt(true);
    try {
      // NOTE: We use default API for meta-prompting here for simplicity
      const generatedPrompt = await generateAgentPrompt(newAgentName, newAgentDesc);
      
      const newAgent: Agent = {
        id: Date.now().toString(),
        name: newAgentName,
        role: '自定义模块',
        description: newAgentDesc,
        icon: 'bot',
        status: 'idle',
        systemPrompt: generatedPrompt,
        isCustom: true
      };
      
      onAddAgent(insertIndex, newAgent);
      setIsAddModalOpen(false);
    } catch (e) {
      alert("Failed to generate prompt. Please check your connection.");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          工作流设计器 (Workflow Designer)
        </h3>
        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">点击卡片查看详细提示词，点击 "+" 插入模块</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-4 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto min-h-[120px]">
        {agents.map((agent, idx) => (
          <React.Fragment key={agent.id}>
            <button 
              onClick={() => handleOpenAddModal(idx)}
              disabled={isLocked}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                isLocked ? 'opacity-0 w-0 overflow-hidden' : 'bg-slate-200 hover:bg-indigo-500 hover:text-white text-slate-400'
              }`}
            >
              <Plus className="w-3 h-3" />
            </button>

            <div 
              onClick={() => setViewingAgent(agent)}
              className={`relative flex flex-col items-center justify-center p-3 rounded-lg border w-36 h-32 text-center bg-white transition-all cursor-pointer hover:shadow-lg group ${
               agent.status === 'working' ? 'border-indigo-500 ring-2 ring-indigo-200 scale-105 shadow-md' :
               agent.status === 'completed' ? 'border-green-500 bg-green-50' :
               agent.status === 'error' ? 'border-red-500 bg-red-50' : 'border-slate-300 hover:border-indigo-300'
            }`}>
              {!isLocked && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveAgent(agent.id); }}
                  className="absolute -top-2 -right-2 bg-slate-100 text-slate-400 rounded-full p-1 hover:bg-red-500 hover:text-white transition-colors z-10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <Eye className="w-3 h-3 text-indigo-400" />
              </div>
              
              <div className={`p-2 rounded-full mb-2 ${
                agent.status === 'working' ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 
                agent.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {getIcon(agent.icon)}
              </div>
              <span className="text-xs font-bold text-slate-800 line-clamp-1">{agent.name}</span>
              <span className="text-[10px] text-slate-500 line-clamp-2 leading-tight mt-1">{agent.description}</span>
            </div>

            {idx < agents.length - 1 && (
               <ArrowRight className="text-slate-300 w-4 h-4 flex-shrink-0" />
            )}
          </React.Fragment>
        ))}

        <button 
          onClick={() => handleOpenAddModal(agents.length)}
          disabled={isLocked}
          className={`ml-2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            isLocked ? 'opacity-50 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-500 hover:text-white text-indigo-400 border border-indigo-200 border-dashed'
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      
      {/* ADD AGENT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold mb-4 text-slate-800">添加自定义工作流模块</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">模块名称</label>
                <input 
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="例如：文献检查员、代码审核员..."
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">模块功能说明</label>
                <textarea 
                  value={newAgentDesc}
                  onChange={(e) => setNewAgentDesc(e.target.value)}
                  placeholder="描述这个Agent应该做什么..."
                  className="w-full p-2 border border-slate-300 rounded-lg h-24 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleCreateAgent}
                  disabled={isGeneratingPrompt || !newAgentName || !newAgentDesc}
                  className="flex-1 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {isGeneratingPrompt ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      生成提示词...
                    </>
                  ) : '添加模块'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW AGENT MODAL */}
      {viewingAgent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${viewingAgent.status === 'working' ? 'bg-indigo-100 text-indigo-600' : 'bg-white border border-slate-200 text-slate-600'}`}>
                     {getIcon(viewingAgent.icon)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{viewingAgent.name}</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 font-medium">{viewingAgent.role}</span>
                        {viewingAgent.isCustom && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Custom</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => setViewingAgent(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-8 bg-white">
                 <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">模块功能说明 (Description)</h4>
                    <p className="text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm leading-relaxed">
                      {viewingAgent.description}
                    </p>
                 </div>

                 <div>
                    <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                       <Terminal className="w-4 h-4" /> 系统核心提示词 (System Prompt)
                    </h4>
                    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800">
                        <div className="flex gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500/20"></div>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono opacity-60">instruction.md</span>
                      </div>
                      <div className="p-4 max-h-[300px] overflow-auto custom-scrollbar">
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {viewingAgent.systemPrompt}
                        </pre>
                      </div>
                    </div>
                 </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                 <button 
                   onClick={() => setViewingAgent(null)}
                   className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all shadow-sm"
                 >
                   关闭
                 </button>
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowBuilder;
