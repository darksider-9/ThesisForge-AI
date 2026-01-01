
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { DocumentHistory, Agent, ThesisStructure, ThesisSection, ThesisStyleConfig, ApiConfig } from '../types';
import { FileDown, FileType, Terminal, History, Type, CheckSquare, Square, List, Layout, FileCog, Loader2, Sparkles, X } from 'lucide-react';
import { downloadDocx, downloadPDF } from '../utils/exporter';
import { parseStyleGuide } from '../services/geminiService';

interface ResultViewerProps {
  structure: ThesisStructure;
  docHistory: DocumentHistory;
  agents: Agent[];
  isCheckMode?: boolean;
  selectedIds?: Set<string>;
  onToggleId?: (id: string) => void;
  topic?: string;
  apiConfig?: ApiConfig;
}

const ResultViewer: React.FC<ResultViewerProps> = ({ 
  structure, 
  docHistory, 
  agents,
  isCheckMode = false,
  selectedIds,
  onToggleId,
  topic,
  apiConfig
}) => {
  const [viewMode, setViewMode] = useState<'latest' | string>('latest');
  
  // Format Logic
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
  const [rawGuideText, setRawGuideText] = useState('');
  const [isParsingStyle, setIsParsingStyle] = useState(false);
  const [styleConfig, setStyleConfig] = useState<ThesisStyleConfig | undefined>(undefined);

  const isLatest = viewMode === 'latest';
  const displayMarkdownHistory = !isLatest ? (docHistory[viewMode] || "") : "";

  // Construct full text for export based on current view
  const getExportContentAndName = () => {
     let content = "";
     let baseName = topic && topic.trim() ? topic.trim() : "Thesis_Project";

     if (isLatest) {
         if (!structure) content = "";
         else {
             // 1. Manually add Title and TOC for Master Canvas Export
             let tocMd = `# ${baseName}\n\n`;
             tocMd += "## 目录 (Table of Contents)\n";
             structure.forEach(s => {
                if (s.level <= 2) {
                    const indent = "  ".repeat(Math.max(0, s.level - 1));
                    tocMd += `${indent}- ${s.title.replace(/^#+\s*/, '')}\n`; 
                }
             });
             tocMd += "\n---\n\n";

             // 2. Add Body
             const bodyMd = structure.map(s => {
                 let md = `${"#".repeat(s.level)} ${s.title.replace(/^#+\s*/, '')}\n\n`;
                 if (s.content) md += `${s.content}\n\n`;
                 if (s.visuals) md += `${s.visuals}\n\n`;
                 return md;
             }).join('');

             content = tocMd + bodyMd;
         }
         return { content, name: baseName };
     } else {
         content = docHistory[viewMode] || "";
         const agent = agents.find(a => a.id === viewMode);
         const suffix = agent ? agent.name.replace(/\s+/g, '_') : viewMode;
         return { content, name: `${baseName}_${suffix}` };
     }
  };

  const handleDownload = (type: 'docx' | 'pdf') => {
      const { content, name } = getExportContentAndName();
      if (!content) {
          alert("当前视图没有可下载的内容 (No content to download)");
          return;
      }
      if (type === 'docx') {
          // Pass the style config here
          downloadDocx(content, name, styleConfig);
      }
      else downloadPDF(content, name);
  };

  const handleParseFormat = async () => {
      if (!rawGuideText.trim()) return;
      setIsParsingStyle(true);
      try {
          const config = await parseStyleGuide(rawGuideText, apiConfig);
          setStyleConfig(config);
      } catch (e) {
          alert("解析格式失败，请重试");
      } finally {
          setIsParsingStyle(false);
      }
  };

  const renderSection = (section: ThesisSection) => {
    const isSelected = selectedIds?.has(section.id);
    const hasContent = section.content || section.visuals;

    return (
      <div id={section.id} key={section.id} className={`mb-8 scroll-mt-24 transition-all duration-300 ${isSelected ? 'bg-indigo-50/60 ring-1 ring-indigo-200 rounded-lg p-2 -mx-2' : ''}`}>
        
        {/* Title Row with Checkbox */}
        <div className="flex items-start gap-3 group">
          {isLatest && isCheckMode && hasContent && (
            <button 
              onClick={() => onToggleId && onToggleId(section.id)}
              className="mt-2 text-slate-300 hover:text-indigo-600 transition-colors flex-shrink-0"
              title="Select to rewrite this section"
            >
              {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
            </button>
          )}
          
          <div className="flex-1 overflow-hidden">
             {/* Render Title based on Level */}
             {section.level === 1 && (
                <div className="flex items-center gap-2 border-b-2 border-slate-100 pb-2 mt-6 mb-4">
                    <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                    <h1 className="text-2xl text-slate-900 font-bold tracking-tight">{section.title.replace(/^#+\s*/, '')}</h1>
                </div>
             )}
             {section.level === 2 && <h2 className="text-xl mt-6 mb-3 text-slate-800 font-bold flex items-center gap-2"><span className="text-indigo-400">#</span> {section.title.replace(/^#+\s*/, '')}</h2>}
             {section.level === 3 && <h3 className="text-lg mt-4 mb-2 text-slate-700 font-semibold flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-slate-400"></span> {section.title.replace(/^#+\s*/, '')}</h3>}
             
             {/* Content with Math Support */}
             {section.content && (
                <div className="prose prose-slate max-w-none text-slate-600 text-sm leading-7 mb-4">
                  <ReactMarkdown 
                    remarkPlugins={[remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                  >
                    {section.content}
                  </ReactMarkdown>
                </div>
             )}
             
             {/* Visuals */}
             {section.visuals && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-4 text-xs font-mono text-slate-500 overflow-x-auto shadow-sm">
                    <div className="flex items-center gap-2 mb-2 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                        <Layout className="w-3 h-3" /> Visuals / Data
                    </div>
                    <ReactMarkdown 
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                    >
                        {section.visuals}
                    </ReactMarkdown>
                </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden h-[calc(100vh-8rem)] flex flex-col sticky top-24">
      {/* Top Bar: View Switcher */}
      <div className="bg-slate-50 border-b border-slate-200 p-2 flex items-center justify-between shrink-0">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 px-2">
           <button
             onClick={() => setViewMode('latest')}
             className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 ${
               viewMode === 'latest' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
             }`}
           >
             <Type className="w-3 h-3" /> Master Canvas
           </button>
           <div className="w-px h-6 bg-slate-300 mx-1"></div>
           {agents.map(agent => (
             <button
                key={agent.id}
                disabled={!docHistory[agent.id]}
                onClick={() => setViewMode(agent.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
                  viewMode === agent.id
                    ? 'bg-slate-800 text-white'
                    : docHistory[agent.id] ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100' : 'opacity-40 cursor-not-allowed text-slate-400'
                }`}
             >
                {agent.status === 'completed' && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
                {agent.name}
             </button>
           ))}
        </div>
      </div>

      {/* Info Bar & Downloads */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center text-xs text-slate-500 shrink-0">
        <div className="flex items-center gap-4">
           <span className="flex items-center gap-1.5">
               <span className={`w-2 h-2 rounded-full ${isLatest ? 'bg-green-500' : 'bg-amber-500'}`}></span>
               View: <strong>{viewMode === 'latest' ? 'Live Structure' : 'History Snapshot'}</strong>
           </span>
           {isLatest && isCheckMode && (
               <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold animate-pulse border border-amber-100">
                  ⚠ Checkpoint
               </span>
           )}
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => setIsFormatModalOpen(true)}
                className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${styleConfig ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                title="Configure Output Format"
            >
                {styleConfig ? <CheckSquare className="w-3 h-3" /> : <FileCog className="w-3 h-3" />}
                {styleConfig ? '格式已配置' : '格式设置'}
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1 self-center"></div>
            <button onClick={() => handleDownload('docx')} className="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md font-medium transition-colors flex items-center gap-1.5" title="Download current view as DOCX">
                <FileType className="w-3 h-3"/> .docx
            </button>
            <button onClick={() => handleDownload('pdf')} className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md font-medium transition-colors flex items-center gap-1.5" title="Download current view as PDF">
                <FileDown className="w-3 h-3"/> .pdf
            </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 scroll-smooth relative">
            {isLatest ? (
                structure && structure.length > 0 ? (
                    <div className="max-w-3xl mx-auto pb-20">
                        {/* MANUAL TOC */}
                        <div className="mb-12 p-6 bg-slate-50 rounded-xl border border-slate-200">
                             <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-3">
                                <List className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-lg font-bold text-slate-800">目录 (Table of Contents)</h2>
                             </div>
                             <nav className="space-y-1">
                                {structure.map(s => (
                                    s.level <= 2 && (
                                        <a key={s.id} href={`#${s.id}`} className={`block text-sm transition-colors hover:text-indigo-600 hover:underline ${s.level === 1 ? 'font-bold text-slate-800 mt-3 mb-1' : 'text-slate-500 ml-4'}`}>
                                            {s.title.replace(/^#+\s*/, '')}
                                        </a>
                                    )
                                ))}
                             </nav>
                        </div>
                        {structure.map(renderSection)}
                        <div className="mt-12 pt-12 border-t border-slate-100 text-center text-slate-400 text-xs">— End of Thesis Draft —</div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                        <History className="w-16 h-16 mb-4 opacity-30" />
                        <p className="text-sm">Ready to build your thesis...</p>
                    </div>
                )
            ) : (
                <div className="max-w-3xl mx-auto prose prose-slate prose-headings:font-bold prose-headings:text-slate-800 prose-p:text-slate-600 prose-sm">
                     <div className="mb-6 p-3 bg-amber-50 border border-amber-100 text-amber-800 text-xs rounded-lg flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Viewing snapshot version: <strong>{agents.find(a => a.id === viewMode)?.name || viewMode}</strong>
                     </div>
                     <ReactMarkdown 
                        components={{ 
                            h1: ({node, ...props}) => <h1 className="text-3xl border-b-2 border-slate-100 pb-2 mt-8 mb-4 text-slate-900" {...props} />, 
                            h2: ({node, ...props}) => <h2 className="text-2xl mt-6 mb-3 text-slate-800" {...props} /> 
                        }}
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                     >
                       {displayMarkdownHistory}
                     </ReactMarkdown>
                </div>
            )}
        </div>
      </div>

      {/* Format Settings Modal */}
      {isFormatModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[80vh]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <FileCog className="w-5 h-5 text-indigo-600" />
                          学校格式规范配置 (Style Configurator)
                      </h3>
                      <button onClick={() => setIsFormatModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="p-6 flex-1 overflow-y-auto">
                      {!styleConfig ? (
                          <>
                            <div className="mb-4 text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <strong>使用说明：</strong> 请将学校教务处发布的《学位论文排版规范》纯文本内容直接粘贴在下方。AI 将自动提取页边距、字体、页眉规则等参数。
                            </div>
                            <textarea 
                                value={rawGuideText}
                                onChange={(e) => setRawGuideText(e.target.value)}
                                placeholder="在此处粘贴文本，例如：'一级标题黑体三号居中，正文小四宋体，首行缩进，奇偶页眉不同...'"
                                className="w-full h-48 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-xs font-mono"
                            />
                          </>
                      ) : (
                          <div className="space-y-4">
                              <div className="bg-green-50 text-green-700 p-3 rounded-lg flex items-center gap-2 text-sm font-bold">
                                  <CheckSquare className="w-4 h-4" /> 配置已提取成功
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div className="bg-slate-50 p-3 rounded border border-slate-100">
                                      <strong className="block mb-2 text-slate-500">页边距 (cm)</strong>
                                      Top: {styleConfig.margins.top}, Bottom: {styleConfig.margins.bottom}<br/>
                                      Left: {styleConfig.margins.left}, Right: {styleConfig.margins.right}
                                  </div>
                                  <div className="bg-slate-50 p-3 rounded border border-slate-100">
                                      <strong className="block mb-2 text-slate-500">正文</strong>
                                      Font: {styleConfig.body.font.family}, Size: {styleConfig.body.font.size}pt<br/>
                                      Indent: {styleConfig.body.indent ? "Yes (2 chars)" : "No"}
                                  </div>
                                  <div className="bg-slate-50 p-3 rounded border border-slate-100 col-span-2">
                                      <strong className="block mb-2 text-slate-500">标题</strong>
                                      H1: {styleConfig.headings.h1.family} {styleConfig.headings.h1.size}pt ({styleConfig.headings.h1.align})<br/>
                                      H2: {styleConfig.headings.h2.family} {styleConfig.headings.h2.size}pt ({styleConfig.headings.h2.align})
                                  </div>
                                  <div className="bg-slate-50 p-3 rounded border border-slate-100 col-span-2">
                                      <strong className="block mb-2 text-slate-500">表格</strong>
                                      Font: {styleConfig.tables.font.family} {styleConfig.tables.font.size}pt
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                      {styleConfig ? (
                          <button onClick={() => setStyleConfig(undefined)} className="px-4 py-2 text-slate-500 hover:text-red-500 text-sm font-medium">重置配置</button>
                      ) : (
                          <button onClick={() => setIsFormatModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">取消</button>
                      )}
                      
                      {!styleConfig ? (
                        <button 
                            onClick={handleParseFormat}
                            disabled={isParsingStyle || !rawGuideText}
                            className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isParsingStyle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isParsingStyle ? "AI 分析中..." : "提取格式配置"}
                        </button>
                      ) : (
                        <button onClick={() => setIsFormatModalOpen(false)} className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">完成</button>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ResultViewer;
