
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { DocumentHistory, Agent, ThesisStructure, ThesisSection } from '../types';
import { FileDown, FileType, Terminal, History, Type, CheckSquare, Square } from 'lucide-react';
import { downloadDocx, downloadPDF } from '../utils/exporter';

interface ResultViewerProps {
  structure: ThesisStructure;
  docHistory: DocumentHistory;
  agents: Agent[];
  // Checkpoint props
  isCheckMode?: boolean;
  selectedIds?: Set<string>;
  onToggleId?: (id: string) => void;
}

const ResultViewer: React.FC<ResultViewerProps> = ({ 
  structure, 
  docHistory, 
  agents,
  isCheckMode = false,
  selectedIds,
  onToggleId
}) => {
  const [viewMode, setViewMode] = useState<'latest' | string>('latest');

  // If viewMode is 'latest', we render from structure (to allow checkboxes).
  // If viewMode is history ID, we render from markdown string (read-only).
  const isLatest = viewMode === 'latest';
  const displayMarkdownHistory = !isLatest ? (docHistory[viewMode] || "") : "";

  const renderSection = (section: ThesisSection) => {
    const isSelected = selectedIds?.has(section.id);
    const hasContent = section.content || section.visuals;

    return (
      <div key={section.id} className={`mb-6 transition-colors rounded-lg ${isSelected ? 'bg-indigo-50/50 ring-1 ring-indigo-200' : ''}`}>
        
        {/* Title Row with Checkbox */}
        <div className="flex items-start gap-3 group">
          {isLatest && isCheckMode && hasContent && (
            <button 
              onClick={() => onToggleId && onToggleId(section.id)}
              className="mt-1.5 text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0"
            >
              {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
            </button>
          )}
          
          <div className="flex-1">
             {/* Render Title based on Level */}
             {section.level === 1 && <h1 className="text-3xl border-b-2 border-indigo-100 pb-2 mt-4 mb-4 text-indigo-900 font-bold">{section.title.replace(/^#+\s*/, '')}</h1>}
             {section.level === 2 && <h2 className="text-2xl mt-6 mb-3 text-slate-800 pl-3 border-l-4 border-indigo-500 font-bold">{section.title.replace(/^#+\s*/, '')}</h2>}
             {section.level === 3 && <h3 className="text-xl mt-4 mb-2 text-slate-700 font-semibold">{section.title.replace(/^#+\s*/, '')}</h3>}
             
             {/* Content */}
             {section.content && (
                <div className="prose prose-slate max-w-none text-slate-600 text-sm leading-relaxed mb-4">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
             )}
             
             {/* Visuals */}
             {section.visuals && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 my-2 text-xs font-mono text-slate-500 overflow-x-auto">
                    <ReactMarkdown>{section.visuals}</ReactMarkdown>
                </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  // Construct full text for export only
  const getFullTextForExport = () => {
     if (!structure) return "";
     return structure.map(s => {
         let md = `${"#".repeat(s.level)} ${s.title.replace(/^#+\s*/, '')}\n\n`;
         if (s.content) md += `${s.content}\n\n`;
         if (s.visuals) md += `${s.visuals}\n\n`;
         return md;
     }).join('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden min-h-[700px] flex flex-col">
      <div className="bg-slate-50 border-b border-slate-200 p-2 flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
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

      <div className="bg-white border-b border-slate-100 px-4 py-2 flex justify-between items-center text-xs text-slate-500">
        <div className="flex items-center gap-4">
           <span>View: <strong>{viewMode === 'latest' ? 'Live Structure' : 'History Snapshot'}</strong></span>
           {isLatest && isCheckMode && (
               <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold animate-pulse">
                  ⚠ Checkpoint Active: Select sections to rewrite
               </span>
           )}
        </div>
        <div className="flex gap-2">
            <>
            <button onClick={() => downloadDocx({final_draft: getFullTextForExport()})} className="hover:text-blue-600 flex items-center gap-1">
                <FileType className="w-3 h-3"/> Docx
            </button>
            <button onClick={() => downloadPDF({final_draft: getFullTextForExport()})} className="hover:text-red-600 flex items-center gap-1">
                <FileDown className="w-3 h-3"/> PDF
            </button>
            </>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white p-8 custom-scrollbar">
        {isLatest ? (
            structure && structure.length > 0 ? (
                <div className="max-w-4xl mx-auto">
                    {structure.map(renderSection)}
                </div>
            ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-300">
                    <History className="w-12 h-12 mb-4 opacity-50" />
                    <p>Ready to generate...</p>
                </div>
            )
        ) : (
            <div className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-800">
                 <ReactMarkdown
                   components={{
                     h1: ({node, ...props}) => <h1 className="text-3xl border-b-2 border-indigo-100 pb-2 mt-8 mb-4 text-indigo-900" {...props} />,
                     h2: ({node, ...props}) => <h2 className="text-2xl mt-6 mb-3 text-slate-800 pl-3 border-l-4 border-indigo-500" {...props} />,
                     h3: ({node, ...props}) => <h3 className="text-xl mt-4 mb-2 text-slate-700 font-semibold" {...props} />,
                   }}
                 >
                   {displayMarkdownHistory}
                 </ReactMarkdown>
            </div>
        )}
      </div>
    </div>
  );
};

export default ResultViewer;
