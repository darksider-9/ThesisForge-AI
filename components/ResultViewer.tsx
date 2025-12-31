
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { DocumentHistory, Agent, ThesisStructure, ThesisSection } from '../types';
import { FileDown, FileType, Terminal, History, Type, CheckSquare, Square, List, Layout } from 'lucide-react';
import { downloadDocx, downloadPDF } from '../utils/exporter';

interface ResultViewerProps {
  structure: ThesisStructure;
  docHistory: DocumentHistory;
  agents: Agent[];
  // Checkpoint props
  isCheckMode?: boolean;
  selectedIds?: Set<string>;
  onToggleId?: (id: string) => void;
  topic?: string;
}

const ResultViewer: React.FC<ResultViewerProps> = ({ 
  structure, 
  docHistory, 
  agents,
  isCheckMode = false,
  selectedIds,
  onToggleId,
  topic
}) => {
  const [viewMode, setViewMode] = useState<'latest' | string>('latest');

  // If viewMode is 'latest', we render from structure (to allow checkboxes).
  // If viewMode is history ID, we render from markdown string (read-only).
  const isLatest = viewMode === 'latest';
  const displayMarkdownHistory = !isLatest ? (docHistory[viewMode] || "") : "";

  // Construct full text for export based on current view
  const getExportContentAndName = () => {
     let content = "";
     // Fallback topic if empty
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
         // Master Canvas name
         return { content, name: baseName };
     } else {
         // History Snapshot name
         content = docHistory[viewMode] || "";
         const agent = agents.find(a => a.id === viewMode);
         // Format: Topic_AgentName (e.g. "AI_Study_Planner")
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
      if (type === 'docx') downloadDocx(content, name);
      else downloadPDF(content, name);
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
             
             {/* Content */}
             {section.content && (
                <div className="prose prose-slate max-w-none text-slate-600 text-sm leading-7 mb-4">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
             )}
             
             {/* Visuals */}
             {section.visuals && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-4 text-xs font-mono text-slate-500 overflow-x-auto shadow-sm">
                    <div className="flex items-center gap-2 mb-2 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                        <Layout className="w-3 h-3" /> Visuals / Data
                    </div>
                    <ReactMarkdown>{section.visuals}</ReactMarkdown>
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
               View: <strong>{viewMode === 'latest' ? 'Live Structure (Editable)' : 'History Snapshot (Read-only)'}</strong>
           </span>
           {isLatest && isCheckMode && (
               <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold animate-pulse border border-amber-100">
                  ⚠ Checkpoint: Select items to rewrite
               </span>
           )}
        </div>
        <div className="flex gap-2">
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
        
        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 scroll-smooth relative">
            {isLatest ? (
                structure && structure.length > 0 ? (
                    <div className="max-w-3xl mx-auto pb-20">
                        {/* MANUAL TABLE OF CONTENTS FOR MASTER CANVAS */}
                        <div className="mb-12 p-6 bg-slate-50 rounded-xl border border-slate-200">
                             <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-3">
                                <List className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-lg font-bold text-slate-800">目录 (Table of Contents)</h2>
                             </div>
                             <nav className="space-y-1">
                                {structure.map(s => (
                                    s.level <= 2 && (
                                        <a 
                                            key={s.id} 
                                            href={`#${s.id}`}
                                            className={`block text-sm transition-colors hover:text-indigo-600 hover:underline
                                                ${s.level === 1 ? 'font-bold text-slate-800 mt-3 mb-1' : 'text-slate-500 ml-4'}
                                            `}
                                        >
                                            {s.title.replace(/^#+\s*/, '')}
                                        </a>
                                    )
                                ))}
                             </nav>
                        </div>
                        {/* END OF MANUAL TOC */}

                        {structure.map(renderSection)}
                        
                        <div className="mt-12 pt-12 border-t border-slate-100 text-center text-slate-400 text-xs">
                            — End of Thesis Draft —
                        </div>
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
                        Viewing snapshot version: <strong>{agents.find(a => a.id === viewMode)?.name || viewMode}</strong>. 
                        Switch to "Master Canvas" to see the latest compiled version.
                     </div>
                     <ReactMarkdown
                       components={{
                         h1: ({node, ...props}) => <h1 className="text-3xl border-b-2 border-slate-100 pb-2 mt-8 mb-4 text-slate-900" {...props} />,
                         h2: ({node, ...props}) => <h2 className="text-2xl mt-6 mb-3 text-slate-800" {...props} />,
                       }}
                     >
                       {displayMarkdownHistory}
                     </ReactMarkdown>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ResultViewer;
