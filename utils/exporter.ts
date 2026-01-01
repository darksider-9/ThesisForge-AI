
import { ThesisContent, ThesisStyleConfig, FontConfig } from "../types";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber, SectionType } from "docx";
import saveAs from "file-saver";
import jsPDF from "jspdf";

// Handle both new masterDoc string format and legacy map format
const resolveContent = (content: ThesisContent | string): string => {
  if (typeof content === 'string') return content;
  if (content['final_draft']) return content['final_draft'];
  return Object.values(content).join('\n\n');
};

const sanitizeFilename = (name: string): string => {
  return name.replace(/[\/\\?%*:|"<>]/g, '_').trim() || "Thesis_Export";
};

// Convert cm to twips (1 cm approx 567 twips)
const cmToTwips = (cm: number) => Math.round(cm * 567);

// Convert standard Chinese pt sizes to half-points (docx uses half-points)
const ptToHalfPt = (pt: number) => Math.round(pt * 2);

// Standard Chinese Font Sizes for Reference
const SIZES = {
  CHU_HAO: 42,
  XIAO_CHU: 36,
  YI_HAO: 26,
  XIAO_YI: 24,
  ER_HAO: 22,
  XIAO_ER: 18,
  SAN_HAO: 16,
  XIAO_SAN: 15,
  SI_HAO: 14,
  XIAO_SI: 12,
  WU_HAO: 10.5,
  XIAO_WU: 9
};

const getDefaultStyleConfig = (): ThesisStyleConfig => ({
    margins: { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 },
    body: {
        font: { family: "SimSun", size: SIZES.XIAO_SI }, // 小四 (12pt)
        indent: true,
        lineSpacing: 1.5
    },
    headings: {
        h1: { family: "SimHei", size: SIZES.SAN_HAO, bold: true, align: 'center' }, // 三号 (16pt)
        h2: { family: "SimHei", size: SIZES.SI_HAO, bold: true, align: 'left' },   // 四号 (14pt)
        h3: { family: "SimHei", size: SIZES.XIAO_SI, bold: true, align: 'left' },  // 小四 (12pt)
    },
    tables: {
        font: { family: "SimSun", size: SIZES.WU_HAO } // 五号 (10.5pt)
    },
    headers: { useOddEven: false, oddText: "Thesis Draft", evenText: "Thesis Draft" }
});

export const downloadDocx = async (
  content: ThesisContent | string, 
  filename: string = "Thesis_Master_Canvas",
  styleConfig?: ThesisStyleConfig
) => {
  const fullText = resolveContent(content);
  const safeName = sanitizeFilename(filename);
  const lines = fullText.split('\n');
  const children: (Paragraph | Table)[] = [];

  const config = styleConfig || getDefaultStyleConfig();

  // Helper to map string alignment to enum
  const getAlign = (align?: string) => {
      if (align === 'center') return AlignmentType.CENTER;
      if (align === 'right') return AlignmentType.RIGHT;
      if (align === 'justify') return AlignmentType.JUSTIFIED;
      return AlignmentType.LEFT;
  };

  const isTableLine = (line: string) => line.trim().startsWith('|');

  let inTable = false;
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length < 2) {
      tableBuffer.forEach(l => {
         children.push(new Paragraph({ 
             children: [new TextRun({ 
                 text: l, 
                 font: config.body.font.family, 
                 size: ptToHalfPt(config.body.font.size) 
             })],
             indent: config.body.indent ? { firstLine: 480 } : undefined // 2 chars indent approx 24pt = 480 twips
         }));
      });
    } else {
      const validRows = tableBuffer.filter(row => !row.match(/^\|?\s*:?-+:?\s*\|/));
      const tableFont = config.tables?.font || config.body.font;

      const docxRows = validRows.map((rowStr, rowIndex) => {
        const cells = rowStr.split('|').map(c => c.trim());
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();

        return new TableRow({
          children: cells.map(cellText => new TableCell({
            children: [new Paragraph({ 
                children: [new TextRun({ 
                    text: cellText, 
                    bold: rowIndex === 0, 
                    font: tableFont.family, 
                    size: ptToHalfPt(tableFont.size) 
                })],
                alignment: AlignmentType.CENTER
            })],
            width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 100, right: 100 }
          }))
        });
      });

      if (docxRows.length > 0) {
          children.push(new Table({
              rows: docxRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
          }));
          children.push(new Paragraph({ text: "" })); 
      }
    }
    tableBuffer = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTableLine(line)) {
      inTable = true;
      tableBuffer.push(line);
      continue;
    } 
    
    if (inTable && !isTableLine(line)) {
      flushTable();
    }

    let headingLevel = undefined;
    let text = line;
    let align = AlignmentType.LEFT;
    let isBold = false;
    let spacingAfter = 120;
    
    let fontConfig: FontConfig = config.body.font;
    let isBody = true;

    if (line.startsWith('# ')) {
        headingLevel = HeadingLevel.HEADING_1;
        text = line.replace('# ', '');
        fontConfig = config.headings.h1;
        isBody = false;
    } else if (line.startsWith('## ')) {
        headingLevel = HeadingLevel.HEADING_2;
        text = line.replace('## ', '');
        fontConfig = config.headings.h2;
        isBody = false;
    } else if (line.startsWith('### ')) {
        headingLevel = HeadingLevel.HEADING_3;
        text = line.replace('### ', '');
        fontConfig = config.headings.h3;
        isBody = false;
    } else if (line.startsWith('#### ')) {
        headingLevel = HeadingLevel.HEADING_4;
        text = line.replace('#### ', '');
        fontConfig = config.headings.h4 || config.headings.h3; // Fallback
        isBody = false;
    } else if (line.trim().startsWith('>')) {
        // Captions
        text = line.replace('>', '').trim();
        align = AlignmentType.CENTER;
        isBody = false;
        spacingAfter = 240;
        fontConfig = { ...config.body.font, size: config.body.font.size - 1 };
    }

    if (text.trim() === "") continue;

    // Apply specific config overrides
    align = isBody ? AlignmentType.LEFT : getAlign(fontConfig.align); // Default or config
    isBold = fontConfig.bold || false;
    
    // Indent Logic: Only body paragraphs need first line indent. Headings/Captions usually don't.
    const indentConfig = (isBody && config.body.indent) 
        ? { firstLine: 480 } // 24pt approx for 12pt font
        : undefined;

    children.push(new Paragraph({
        children: [new TextRun({ 
            text: text, 
            font: fontConfig.family, 
            size: ptToHalfPt(fontConfig.size), 
            bold: isBold 
        })],
        heading: headingLevel,
        alignment: align,
        indent: indentConfig,
        spacing: { after: spacingAfter, line: Math.round(config.body.lineSpacing * 240) }, 
    }));
  }

  if (inTable) flushTable();

  // Create Headers
  const evenHeader = new Header({
      children: [
          new Paragraph({
              children: [new TextRun({ text: config.headers.evenText, size: 20 })], 
              alignment: AlignmentType.CENTER as any,
              border: { bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 } }
          }),
      ],
  });

  const oddHeader = new Header({
      children: [
          new Paragraph({
              children: [new TextRun({ text: config.headers.oddText.replace("Chapter_Title", "硕士学位论文"), size: 20 })], 
              alignment: AlignmentType.CENTER as any,
              border: { bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 } }
          }),
      ],
  });

  const doc = new Document({
    sections: [{
      properties: {
          page: {
              margin: {
                  top: cmToTwips(config.margins.top),
                  bottom: cmToTwips(config.margins.bottom),
                  left: cmToTwips(config.margins.left),
                  right: cmToTwips(config.margins.right),
              },
          },
          titlePage: config.headers.useOddEven,
      },
      headers: {
          default: oddHeader,
          even: config.headers.useOddEven ? evenHeader : oddHeader,
      },
      footers: {
          default: new Footer({
              children: [
                  new Paragraph({
                      children: [
                          new TextRun({ children: [PageNumber.CURRENT] }),
                      ],
                      alignment: AlignmentType.CENTER,
                  }),
              ],
          }),
      },
      children: [
        new Paragraph({
            children: [new TextRun({ text: " ", size: 2 })], // Spacer
            spacing: { after: 200 }
        }),
        ...children
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeName}.docx`);
};

export const downloadPDF = (content: ThesisContent | string, filename: string = "Thesis_Master_Canvas") => {
  const safeName = sanitizeFilename(filename);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = 20;

  const addBlock = (body: string) => {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    const lines = body.split('\n');
    
    for (let line of lines) {
        if (yPos > 280) { doc.addPage(); yPos = 20; }

        let fontSize = 11;
        let fontStyle = "normal";
        let text = line;

        if (line.startsWith('# ')) {
            fontSize = 18; fontStyle = "bold"; text = line.replace('# ', '');
            yPos += 5;
        } else if (line.startsWith('## ')) {
            fontSize = 14; fontStyle = "bold"; text = line.replace('## ', '');
            yPos += 3;
        } else if (line.startsWith('### ')) {
            fontSize = 12; fontStyle = "bold"; text = line.replace('### ', '');
        }

        doc.setFontSize(fontSize);
        doc.setFont("helvetica", fontStyle);

        // Basic table skip for PDF (too complex for naive PDF generator)
        const splitText = doc.splitTextToSize(text, pageWidth - (margin * 2));
        doc.text(splitText, margin, yPos);
        
        yPos += (splitText.length * (fontSize / 2)) + 2; 
    }
  };

  const text = resolveContent(content);
  addBlock(text);

  doc.save(`${safeName}.pdf`);
};

export const downloadPythonCode = (code: string) => {
  const blob = new Blob([code], { type: "text/x-python;charset=utf-8" });
  saveAs(blob, "thesis_builder.py");
};
