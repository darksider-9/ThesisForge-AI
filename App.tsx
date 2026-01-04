
import React, { useState, useEffect, useRef } from 'react';
import { Agent, AgentStatus, UserInput, DocumentHistory, ThesisStructure, ApiConfig } from './types';
import { runAgentStepStructured, regenerateSpecificSections } from './services/geminiService';
import WorkflowBuilder from './components/WorkflowBuilder';
import InputForm from './components/InputForm';
import ResultViewer from './components/ResultViewer';
import SettingsModal from './components/SettingsModal';
import { GraduationCap, FastForward, RotateCcw, CheckCircle2, Terminal, Trash2, Save, Upload } from 'lucide-react';

const ARCHITECT_PROMPT = `
### 角色
你是一位**硕士论文架构师**。

### 原则
1. **结构**：仅输出严格的 JSON 格式。
2. **逻辑**：根据用户主题创建具体、非通用的标题。
3. **格式**：使用 Markdown 标题 (#, ##, ###)。

### 核心结构要求 (关键)
- **闭环设计**：硕士论文的核心章节（通常第3-5章）每一章都必须是**“提出方法/理论 + 实验验证”**的闭环结构。
- **禁止拆分**：**严禁**将“实验结果与分析”单独设为一章。实验内容必须紧随其对应的理论方法出现在同一章的后半部分。
- **完整性**：必须包含摘要、绪论、相关工作、核心方法章节（多章）、总结与展望。

### JSON 输出格式 (必须严格遵守)
请直接返回 JSON 对象，不要包含任何 Markdown 代码块标记（如 \`\`\`json），也不要包含前导或解释性文字。
格式范例：
{
  "sections": [
    { "id": "s_abs", "title": "摘要", "level": 1 },
    { "id": "s_1", "title": "# 第一章 绪论", "level": 1 },
    { "id": "s_3", "title": "# 第三章 [核心方法名]", "level": 1 },
    { "id": "s_3_1", "title": "## 3.1 理论分析", "level": 2 },
    { "id": "s_3_2", "title": "## 3.2 实验验证", "level": 2 }
  ]
}

### 步骤
1. 分析用户输入（主题/领域）。
2. 设计 5-7 章结构。
3. 细化核心章节的三级标题（确保前半部分是理论，后半部分是实验）。
4. 输出 JSON。
`;

const PLANNER_PROMPT = `
### 角色
你是一位**学术内容撰写专家**。

### 原则
1. **纯净正文（重要）**：输出的内容**绝对不要**包含章节标题本身。渲染器会自动添加标题。你只需直接写正文段落。
2. **纯文字模式**：**严禁生成任何 Markdown 表格、图片占位符或图表描述**。这些将由专门的视觉专家生成。你专注于文字阐述、逻辑推导和公式证明。
3. **数学公式**：**必须**使用 LaTeX 格式。行内公式使用 $...$，独立公式使用 $$...$$。
4. **完整性**：你将收到一个章节下的多个小节 ID。你需要一次性为**所有**这些 ID 撰写内容。
5. **深度**：内容必须包含数学公式推导、理论证明和详尽的数据分析（以文字形式描述）。
6. **格式**：输出 JSON，Key 为 ID，Value 为 Markdown 正文。

### 策略
- **批量处理**：不要只写一个。遍历所有传入的 ID，逐个生成高质量内容。
- **转义**：JSON 值中的 LaTeX 公式 ($\\\\alpha$) 和换行符 (\\\\n) 必须正确转义。

### 步骤
1. 阅读该章节下所有小节的标题。
2. 为每个 ID 撰写对应的学术正文（不带标题，不带图表）。
3. 合并为一个 JSON 对象返回。
`;

const VISUALS_PROMPT = `
### 角色
你是一位**数据可视化专家**。
**重要**：不要生成图片文件。仅生成 Markdown 表格源码和图表说明文字。

### 范围约束
- 图表通常出现在**第一章绪论**到**总结与展望之前**的章节。
- 如果当前处理的是“摘要”、“致谢”、“参考文献”或“总结与展望”章节，请返回空内容。

### 原则
1. **丰富性**：为当前章节设计丰富的数据表格和图表说明。
2. **格式**：Markdown 表格。
3. **图注与描述**：
   - 使用 "> [图 x-y] 图表标题" 的格式作为图注。
   - **必须**在每个图表或表格下方附带一段**详细的图表描述或数据分析**（Markdown 引用块格式或其他区分格式），解释图表展示了什么趋势或结果。
4. **纯净性**：严禁生成普通正文段落和标题，只返回图表、图注和图表相关的分析描述。

### 步骤
1. 扫描章节内的小节。
2. 如果是实验部分，设计对比数据表（Results Table）并附加分析。
3. 如果是方法部分，设计流程图描述（Flowchart Description）并附加解释。
4. 返回 JSON。
`;

const INITIAL_AGENTS: Agent[] = [
  { 
    id: '1', 
    name: '架构师 (Architect)', 
    role: '结构搭建', 
    description: '生成高逻辑性的论文骨架 JSON。严格遵循“一章一方法一实验”的闭环原则。', 
    icon: 'layout', 
    status: 'idle',
    systemPrompt: ARCHITECT_PROMPT
  },
  { 
    id: '2', 
    name: '内容策划 (Planner)', 
    role: '正文填充', 
    description: '按章批量生成学术正文（专注于纯文本、公式推导，不含图表）。', 
    icon: 'pen', 
    status: 'idle',
    systemPrompt: PLANNER_PROMPT
  },
  { 
    id: '3', 
    name: '视觉/数据专家 (Visuals)', 
    role: '图表植入', 
    description: '生成 Markdown 表格源码与详细的图表分析描述 (第一章至总结前)。', 
    icon: 'table', 
    status: 'idle',
    systemPrompt: VISUALS_PROMPT
  },
  {
    id: 'final_draft',
    name: '总编审 (Chief Editor)',
    role: '终稿渲染与查漏', 
    description: '检查全文完整性。若发现缺失的正文或图表，将自动进行补充生成，最后渲染终稿。', 
    icon: 'merge', 
    status: 'idle',
    systemPrompt: `(系统自动执行查漏补缺)`
  }
];

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

function App() {
  const [input, setInput] = useState<UserInput>({ field: '', topic: '', specificFocus: '' });
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    baseUrl: 'https://yinli.one/v1',
    apiKey: '',
    modelName: 'gemini-2.5-flash',
    useCustom: true
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [thesisStructure, setThesisStructure] = useState<ThesisStructure>([]);
  const [docHistory, setDocHistory] = useState<DocumentHistory>({});
  
  // Execution State
  const [currentAgentIndex, setCurrentAgentIndex] = useState<number>(-1);
  const [isWorking, setIsWorking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Selection & Regeneration State
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());
  const [modificationInstruction, setModificationInstruction] = useState('');

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs(prev => [...prev, { time, message, type }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setInput(prev => ({ ...prev, [name]: value }));
  };

  const handleAddAgent = (index: number, newAgent: Agent) => {
    setAgents(prev => {
      const newList = [...prev];
      newList.splice(index, 0, newAgent);
      return newList;
    });
  };

  const handleRemoveAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
  };

  const updateAgentStatus = (id: string, status: AgentStatus, wordCount?: number) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status, wordCount } : a));
  };

  const countWords = (str: string) => str ? str.replace(/\s/g, '').length : 0;

  // --- Session Management ---

  const handleSaveSession = () => {
    const sessionData = {
      timestamp: new Date().toISOString(),
      input,
      agents,
      thesisStructure,
      docHistory,
      logs,
      currentAgentIndex,
      isPaused,
      isWorking // though we usually save when paused
    };
    
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thesis_forge_save_${input.topic.slice(0,10)}_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog("进度已保存为 JSON 文件。", 'success');
  };

  const handleLoadSessionClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.input && json.thesisStructure) {
          setInput(json.input);
          setAgents(json.agents);
          setThesisStructure(json.thesisStructure);
          setDocHistory(json.docHistory);
          setLogs(json.logs || []);
          setCurrentAgentIndex(json.currentAgentIndex ?? -1);
          setIsPaused(json.isPaused || false);
          // Force stop working on load to prevent weird states
          setIsWorking(false);
          
          addLog("进度加载成功！请检查状态并继续。", 'success');
        } else {
          alert("无效的存档文件格式。");
        }
      } catch (err) {
        alert("文件解析失败。");
        console.error(err);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // --- Core Workflow Logic ---

  const startWorkflow = () => {
    if (!input.topic) return;
    setLogs([]);
    setDocHistory({});
    setThesisStructure([]);
    setCurrentAgentIndex(0);
    setIsWorking(true);
    setIsPaused(false);
    setSelectedSectionIds(new Set());
    setModificationInstruction('');
    
    setAgents(prev => prev.map(a => ({ ...a, status: 'waiting', wordCount: 0 })));
    addLog("工作流已启动。Agent 队列初始化完成。", 'info');
    
    // Start the first agent
    runAgentStep(0, []);
  };

  const runAgentStep = async (index: number, currentStruct: ThesisStructure) => {
    if (index >= agents.length) {
      addLog("所有 Agent 执行完毕。工作流结束。", 'success');
      setIsWorking(false);
      setIsPaused(false);
      setCurrentAgentIndex(-1);
      return;
    }

    const agent = agents[index];
    addLog(`正在启动: ${agent.name}...`, 'info');
    updateAgentStatus(agent.id, 'working');
    setIsWorking(true);

    try {
      // Execute the agent
      const result = await runAgentStepStructured(
        agent,
        input,
        currentStruct,
        apiConfig
      );

      // Update State
      setThesisStructure(result.structure);
      setDocHistory(prev => ({ ...prev, [agent.id]: result.markdown }));
      
      const wc = countWords(result.markdown);
      updateAgentStatus(agent.id, 'completed', wc);
      addLog(`${agent.name} 执行完成 (字数: ${wc})。`, 'success');
      addLog(`工作流已暂停。请检查右侧结果。满意请点击“继续”，否则选中部分内容进行重写。`, 'info');

      // Pause for Checkpoint
      setIsPaused(true);
      setIsWorking(false);
      
      // Auto-select nothing on new step
      setSelectedSectionIds(new Set());
      setModificationInstruction('');

    } catch (err: any) {
      console.error(err);
      addLog(`错误: ${agent.name} 执行失败 - ${err.message}`, 'error');
      updateAgentStatus(agent.id, 'error');
      setIsWorking(false);
      // Even on error, we pause to let user see logs or retry manually (not implemented yet, but safe state)
    }
  };

  const handleContinue = () => {
    if (currentAgentIndex === -1) return; // Should not happen
    const nextIndex = currentAgentIndex + 1;
    setCurrentAgentIndex(nextIndex);
    setIsPaused(false);
    setSelectedSectionIds(new Set());
    setModificationInstruction('');
    
    // Pass the latest structure
    runAgentStep(nextIndex, thesisStructure);
  };

  const handleRegenerateSelected = async () => {
    if (selectedSectionIds.size === 0) {
      addLog("请先在右侧勾选需要重写的小节。", 'error');
      return;
    }
    
    const currentAgent = agents[currentAgentIndex];
    if (!currentAgent) return;

    addLog(`正在重写 ${selectedSectionIds.size} 个选中部分 (使用 ${currentAgent.name})...`, 'info');
    setIsWorking(true); // Temporary working state during regen

    try {
      const updatedStructure = await regenerateSpecificSections(
        currentAgent,
        input,
        thesisStructure,
        Array.from(selectedSectionIds),
        apiConfig,
        modificationInstruction // Pass user instruction
      );

      // Update State
      setThesisStructure(updatedStructure);
      
      addLog(`重写完成。`, 'success');
      setSelectedSectionIds(new Set()); // Clear selection
      setModificationInstruction('');

    } catch (err: any) {
      addLog(`重写失败: ${err.message}`, 'error');
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedSectionIds.size === 0) return;
    
    const confirmDelete = window.confirm(`确定要删除选中的 ${selectedSectionIds.size} 个章节吗？删除后将无法恢复。`);
    if (!confirmDelete) return;

    // Filter out selected IDs
    const newStructure = thesisStructure.filter(section => !selectedSectionIds.has(section.id));
    setThesisStructure(newStructure);
    setSelectedSectionIds(new Set());
    addLog(`已删除 ${selectedSectionIds.size} 个章节。`, 'info');
  };

  const toggleSectionSelection = (id: string) => {
    if (!isPaused && !isWorking) return; // Only allow selection during pause
    const newSet = new Set(selectedSectionIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSectionIds(newSet);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">多智能体硕士论文生成系统</h1>
              <p className="text-xs text-slate-500">ThesisForge AI - 支持 LaTeX 编译包与断点续传</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {apiConfig.useCustom && (
                 <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-mono border border-green-200">
                    API: {apiConfig.modelName}
                 </span>
             )}
             
             {/* Load Session Button */}
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
             <button onClick={handleLoadSessionClick} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                <Upload className="w-3 h-3" /> 读取存档
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        
        <WorkflowBuilder 
          agents={agents} 
          onAddAgent={handleAddAgent} 
          onRemoveAgent={handleRemoveAgent}
          isLocked={isWorking || isPaused} 
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDEBAR: Sticky Wrapper */}
          <div className="lg:col-span-3 space-y-6 sticky top-24 self-start max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar pr-1">
            <InputForm 
              input={input} 
              onChange={handleInputChange} 
              onSubmit={startWorkflow}
              onOpenSettings={() => setIsSettingsOpen(true)}
              isGenerating={isWorking || (isPaused && currentAgentIndex !== -1)}
              apiConfig={apiConfig}
            />
            
            {/* Real-time Logger */}
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-lg flex flex-col h-[300px]">
              <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> System Logs
                </span>
                {isWorking && <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>}
              </div>
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar font-mono text-xs space-y-2">
                {logs.length === 0 && (
                   <div className="text-slate-600 text-center mt-10 italic">等待任务开始...</div>
                )}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span className={`${
                      log.type === 'error' ? 'text-red-400' : 
                      log.type === 'success' ? 'text-green-400' : 'text-slate-300'
                    }`}>
                      {log.type === 'error' && '✖ '}
                      {log.type === 'success' && '✔ '}
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Checkpoint Controls */}
            {isPaused && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-sm animate-in zoom-in duration-300">
                <h4 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> 
                  Checkpoint: {agents[currentAgentIndex]?.name}
                </h4>
                <p className="text-xs text-amber-700 mb-2 leading-relaxed">
                  当前模块已完成。您可以：
                  1. 勾选右侧章节进行<b>重写</b>或<b>删除</b>。
                  2. <b>保存进度</b>以便稍后继续。
                  3. 点击<b>继续</b>进入下一阶段。
                </p>
                
                {selectedSectionIds.size > 0 && (
                  <div className="mb-3 animate-in fade-in slide-in-from-top-2">
                    <textarea 
                      value={modificationInstruction}
                      onChange={(e) => setModificationInstruction(e.target.value)}
                      placeholder="在此输入修改指令... (例如: '将这一节的重点改为Transformer架构')"
                      className="w-full p-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white min-h-[60px]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button 
                      onClick={handleRegenerateSelected}
                      disabled={selectedSectionIds.size === 0 || isWorking}
                      className="flex-1 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-3 h-3" /> 重写 ({selectedSectionIds.size})
                    </button>
                    <button 
                      onClick={handleDeleteSelected}
                      disabled={selectedSectionIds.size === 0 || isWorking}
                      className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-xs font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      title="删除选中章节"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  
                  {/* Save Button for Safety */}
                  <button 
                    onClick={handleSaveSession}
                    className="w-full py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Save className="w-3 h-3" /> 保存当前进度 (JSON)
                  </button>

                  <button 
                    onClick={handleContinue}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
                  >
                    <FastForward className="w-3 h-3" /> 确认并继续下一步
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Result Viewer */}
          <div className="lg:col-span-9">
            <ResultViewer 
              structure={thesisStructure}
              docHistory={docHistory}
              agents={agents}
              isCheckMode={isPaused}
              selectedIds={selectedSectionIds}
              onToggleId={toggleSectionSelection}
              topic={input.topic}
              apiConfig={apiConfig}
              onSaveSession={handleSaveSession} // Pass save handler
            />
          </div>
        </div>
      </main>

      {isSettingsOpen && (
        <SettingsModal 
          config={apiConfig}
          onSave={setApiConfig}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
