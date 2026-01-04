
import { ThesisStructure } from "../types";
import JSZip from "jszip";
import saveAs from "file-saver";

const sanitizeFilename = (name: string): string => {
  return name.replace(/[\/\\?%*:|"<>]/g, '_').trim() || "Thesis_Export";
};

// Based on Southeast University Guidelines
// Added Magic Comment for Overleaf to auto-detect XeLaTeX engine
const MAIN_TEX_TEMPLATE = `%!TEX program = xelatex
% --------------------------------------------------------
% Southeast University Master Thesis Template (Simplified)
% --------------------------------------------------------
\\documentclass[12pt, a4paper, openany]{book}

% --------------------------------------------------------
% Packages
% --------------------------------------------------------
\\usepackage[utf8]{inputenc}

% Use ctex for robust Chinese support (Auto-detects fonts: Windows->SimSun, Overleaf->Fandol)
% This replaces manual xeCJK configuration which often fails on Linux/Overleaf
\\usepackage[heading=true, fontset=auto]{ctex}

\\usepackage{amsmath, amsfonts, amssymb} % 数学公式
\\usepackage{graphicx}        % 图片
\\usepackage{geometry}        % 页面设置
\\usepackage{hyperref}        % 超链接
\\usepackage{titlesec}        % 标题格式
\\usepackage{indentfirst}     % 首行缩进
\\usepackage{booktabs}        % 三线表
\\usepackage{array}
\\usepackage{longtable}       % 长表格
\\usepackage{setspace}        % 行距
\\usepackage{fancyhdr}        % 页眉页脚

% --------------------------------------------------------
% Fonts Setup
% --------------------------------------------------------
% Note: ctex package handles main fonts automatically.
% We set English font to Times New Roman if available, otherwise standard LaTeX font.
\\setmainfont{Times New Roman}

% --------------------------------------------------------
% Page Layout
% --------------------------------------------------------
\\geometry{left=2.5cm, right=2.5cm, top=2.5cm, bottom=2.5cm} % 左侧装订线可设为3cm
\\onehalfspacing % 1.5倍行距

% --------------------------------------------------------
% Headers & Footers
% --------------------------------------------------------
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[CE]{东南大学硕士学位论文} % 偶数页页眉
\\fancyhead[CO]{\\leftmark}           % 奇数页页眉 (显示章节名)
\\fancyfoot[C]{\\thepage}             % 页码居中
\\renewcommand{\\headrulewidth}{0.4pt}

% --------------------------------------------------------
% Title Formatting (Override ctex defaults to match specific style if needed)
% --------------------------------------------------------
\\titleformat{\\chapter}{\\centering\\huge\\bfseries}{第\\,\ \\thechapter\\,\ \\章}{1em}{}
\\titleformat{\\section}{\\Large\\bfseries}{\\thesection}{1em}{}
\\titleformat{\\subsection}{\\large\\bfseries}{\\thesubsection}{1em}{}

% --------------------------------------------------------
% Document Start
% --------------------------------------------------------
\\begin{document}

% Title Page (Placeholder)
\\begin{titlepage}
    \\centering
    \\vspace*{2cm}
    {\\huge\\bfseries 硕士学位论文 \\\\ Master's Thesis \\par}
    \\vspace{2cm}
    {\\Large\\bfseries __TITLE__ \\par}
    \\vspace{2cm}
    {\\large \\today \\par}
\\end{titlepage}

\\frontmatter
\\tableofcontents
\\mainmatter

% --- CONTENT INJECTION POINT ---
__CONTENT__
% -------------------------------

\\backmatter
% References would go here

\\end{document}
`;

const convertMarkdownToLatex = (md: string): string => {
  if (!md) return "";
  
  let latex = md;

  // 1. Robust LaTeX Cleanup
  // Fixes LLM artifacts like \\begin, \\\nabla by collapsing backslashes
  // ONLY when followed by a letter or specific symbols.
  latex = latex.replace(/\\+([a-zA-Z{|%}_&$#])/g, '\\$1');
  
  // 2. Ensure escaped newlines become real newlines for .tex
  latex = latex.replace(/\\n/g, '\n');

  // Remove markdown JSON blocks if present
  latex = latex.replace(/```json[\s\S]*?```/g, '');

  // 3. Headings
  // Note: We strip explicit # from content usually, but safety check:
  latex = latex.replace(/^#### (.*$)/gm, '\\subsubsection{$1}');
  latex = latex.replace(/^### (.*$)/gm, '\\subsection{$1}');
  latex = latex.replace(/^## (.*$)/gm, '\\section{$1}');
  latex = latex.replace(/^# (.*$)/gm, '\\chapter{$1}'); 

  // 4. Bold & Italic
  latex = latex.replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}');
  latex = latex.replace(/\*(.*?)\*/g, '\\textit{$1}');

  // 5. Lists (Simple heuristic)
  latex = latex.replace(/^\s*-\s+(.*$)/gm, '\\item $1');
  
  // 6. Captions
  latex = latex.replace(/^> \[(.*?)\] (.*$)/gm, '\\begin{figure}[h]\\centering\\caption{$2}\\label{fig:$1}\\end{figure}');

  return latex;
};

export const downloadLatexZip = async (
  structure: ThesisStructure, 
  topic: string = "Thesis"
) => {
  const zip = new JSZip();
  const safeName = sanitizeFilename(topic);
  
  let fullLatexBody = "";

  structure.forEach(section => {
      // Clean title
      const title = section.title.replace(/^#+\s*/, '');
      
      // Determine hierarchical command
      let command = "";
      if (section.level === 1) command = "\\chapter";
      else if (section.level === 2) command = "\\section";
      else if (section.level === 3) command = "\\subsection";
      else if (section.level === 4) command = "\\subsubsection";
      
      if (command) {
          fullLatexBody += `\n\n${command}{${title}}\n`;
      }

      // Add Content
      if (section.content) {
          fullLatexBody += convertMarkdownToLatex(section.content) + "\n";
      }

      // Add Visuals (Suggestion comment)
      if (section.visuals) {
          fullLatexBody += "\n% --- Visuals / Tables Data ---\n";
          // Comment out raw markdown visuals in latex to prevent compile error, let user format
          const visualLines = section.visuals.split('\n');
          fullLatexBody += visualLines.map(l => `% ${l}`).join('\n') + "\n";
      }
  });

  const mainTex = MAIN_TEX_TEMPLATE
      .replace('__CONTENT__', fullLatexBody)
      .replace('__TITLE__', topic);
  
  zip.file("main.tex", mainTex);
  zip.file("README.txt", "Generated by ThesisForge AI.\n\nInstructions:\n1. Upload 'main.tex' to Overleaf.com or compile locally.\n2. CRITICAL: The first line '%!TEX program = xelatex' should force Overleaf to use XeLaTeX.\n3. If it still fails, click 'Menu' -> 'Compiler' -> Select 'XeLaTeX'.\n4. This template uses the 'ctex' package, which auto-detects fonts (Fandol on Overleaf, SimSun on Windows).");

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${safeName}_LaTeX.zip`);
};
