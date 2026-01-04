import { ThesisContent, ThesisStyleConfig, FontConfig } from "../types";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber } from "docx";
import saveAs from "file-saver";

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

// Default Style based on Southeast University Guidelines
const getDefaultStyleConfig = (): ThesisStyleConfig => ({
    margins: { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 }, // Standard A4 margins, Left bound
    body: {
        font: { family: "SimSun", size: SIZES.XIAO_SI }, // 正文小四宋体 (12pt)
        indent: true,
        lineSpacing: 1.5 // 1.5倍行距 or 20pt fixed
    },
    headings: {
        h1: { family: "SimHei", size: SIZES.ER_HAO, bold: true, align: 'center' }, // 章标题二号宋体/黑体居中 (Guidelines say SimSun, usually SimHei for visual distinction, let's follow user pref or standard. Guidelines: "二号宋体居中". Code uses SimHei for better look, user can change if parsed.)
        h2: { family: "SimHei", size: SIZES.SAN_HAO, bold: true, align: 'center' },   // 二级标题三号黑体居中
        h3: { family: "SimHei", size: SIZES.SI_HAO, bold: true, align: 'left' },  // 三级标题四号宋体(加粗)居左
        h4: { family: "SimHei", size: SIZES.XIAO_SI, bold: true, align: 'left' }, // 四级小四黑体
    },
    tables: {
        font: { family: "SimSun", size: SIZES.WU_HAO } // 表格文字小五宋体
    },
    headers: { 
        useOddEven: true, 
        oddText: "第 * 章  Chapter_Title", 
        evenText: "东南大学硕士学位论文" 
    }
});

// Pre-process regex to clean up math blocks for Word
// Removes newlines inside $$...$$ to prevent line breaking in Word
const cleanMathForWord = (text: string): string => {
    // 1. Robust LaTeX Cleanup for Word
    // Fixes LLM artifacts like \\begin, \\\nabla by collapsing backslashes
    // when followed by letters or command symbols.
    let clean = text.replace(/\\+([a-zA-Z{|%}_&$#])/g, '\\$1');
    
    // 2. Ensure escaped newlines become real newlines for Word paragraphs
    clean = clean.replace(/\\n/g, '\n');

    // 3. Fix block math spacing
    return clean.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
        // Replace newlines with spaces
        return '$$ ' + inner.replace(/[\r\n]+/g, ' ').trim() + ' $$';
    });
};

export const downloadDocx = async (
  content: ThesisContent | string, 
  filename: string = "Thesis_Master_Canvas",
  styleConfig?: ThesisStyleConfig
) => {
  const fullText = resolveContent(content);
  const safeName = sanitizeFilename(filename);
  
  // 1. Clean Math & Text
  const mathCleanedText = cleanMathForWord(fullText);

  // 2. Remove markdown code blocks for JSON if any remain
  const cleanedText = mathCleanedText.replace(/```json[\s\S]*?```/g, '');
  
  const lines = cleanedText.split('\n');
  const children: (Paragraph | Table)[] = [];
  const config = styleConfig || getDefaultStyleConfig();

  // Helper to map string alignment to enum
  const getAlign = (align?: string) => {
      if (align === 'center') return AlignmentType.CENTER;
      if (align === 'right') return AlignmentType.RIGHT;
      if (align === 'justify') return AlignmentType.JUSTIFIED;
      return AlignmentType.LEFT;
  };

  // Helper to create TextRun with Dual Fonts (Times New Roman for ASCII, Custom for EastAsia)
  // This ensures numbers/English are TNR, Chinese is SimSun/SimHei
  const createRun = (text: string, fontConfig: FontConfig, isBold: boolean = false) => {
      // Safety check for null text which corrupts docx
      const safeText = text || " ";
      
      return new TextRun({
          text: safeText,
          font: {
              name: "Times New Roman", // ASCII / Numbers
              eastAsia: fontConfig.family, // Chinese
          },
          size: ptToHalfPt(fontConfig.size),
          bold: isBold,
          color: "000000" // FORCE BLACK to prevent blue headers
      });
  };

  const isTableLine = (line: string) => line.trim().startsWith('|');

  let inTable = false;
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length < 2) {
      // Not a real table, dump as text
      tableBuffer.forEach(l => {
         children.push(new Paragraph({ 
             children: [createRun(l, config.body.font)],
             indent: config.body.indent ? { firstLine: 480 } : undefined
         }));
      });
    } else {
      // Process Table
      const validRows = tableBuffer.filter(row => !row.match(/^\|?[\s:-]+\|/));
      const tableFont = config.tables?.font || config.body.font;

      if (validRows.length > 0) {
        const docxRows = validRows.map((rowStr, rowIndex) => {
            let cleanRow = rowStr.trim();
            if (cleanRow.startsWith('|')) cleanRow = cleanRow.substring(1);
            if (cleanRow.endsWith('|')) cleanRow = cleanRow.substring(0, cleanRow.length - 1);
            
            const cells = cleanRow.split('|');

            return new TableRow({
            children: cells.map(cellText => new TableCell({
                children: [new Paragraph({ 
                    children: [createRun(cellText.trim(), tableFont, rowIndex === 0)],
                    alignment: AlignmentType.CENTER
                })],
                width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                }
            }))
            });
        });

        children.push(new Table({
            rows: docxRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
        }));
        children.push(new Paragraph({ text: "" })); // Spacing
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

    let headingLevel: any = undefined; 
    let text = line;
    let align = AlignmentType.LEFT;
    let isBold = false;
    let spacingAfter = 120; // 6pt
    let spacingBefore = 0;
    
    let fontConfig: FontConfig = config.body.font;
    let isBody = true;

    if (line.startsWith('# ')) {
        headingLevel = HeadingLevel.HEADING_1;
        text = line.replace('# ', '');
        fontConfig = config.headings.h1;
        isBody = false;
        spacingBefore = 240;
        spacingAfter = 240;
    } else if (line.startsWith('## ')) {
        headingLevel = HeadingLevel.HEADING_2;
        text = line.replace('## ', '');
        fontConfig = config.headings.h2;
        isBody = false;
        spacingBefore = 180;
    } else if (line.startsWith('### ')) {
        headingLevel = HeadingLevel.HEADING_3;
        text = line.replace('### ', '');
        fontConfig = config.headings.h3;
        isBody = false;
        spacingBefore = 120;
    } else if (line.startsWith('#### ')) {
        headingLevel = HeadingLevel.HEADING_4;
        text = line.replace('#### ', '');
        fontConfig = config.headings.h4 || config.headings.h3; 
        isBody = false;
    } else if (line.trim().startsWith('>')) {
        // Captions or Blockquotes
        text = line.replace(/^>\s?/, '').trim();
        // Check if it's a figure/table caption
        if (text.startsWith('[') || text.includes('图') || text.includes('表')) {
             align = AlignmentType.CENTER;
             fontConfig = { ...config.body.font, size: config.body.font.size - 1 };
             spacingAfter = 240;
        } else {
             // Normal blockquote
             fontConfig = { ...config.body.font, family: "KaiTi" }; 
        }
        isBody = false;
    }

    if (text.trim() === "") continue;

    align = isBody ? AlignmentType.LEFT : getAlign(fontConfig.align); 
    isBold = fontConfig.bold || false;
    
    // Indent Logic: Body paragraphs need first line indent. Headings/Captions usually don't.
    const indentConfig = (isBody && config.body.indent) 
        ? { firstLine: 480 } // 24pt approx for 12pt font
        : undefined;

    // Safety: ensure text is not empty string, which crashes Docx
    if (!text) text = " ";
    
    // Create Paragraph
    children.push(new Paragraph({
        children: [createRun(text, fontConfig, isBold)],
        heading: headingLevel,
        alignment: align,
        indent: indentConfig,
        spacing: { 
            before: spacingBefore, 
            after: spacingAfter, 
            line: Math.round(config.body.lineSpacing * 240) 
        }, 
    }));
  }

  if (inTable) flushTable();

  // Create Headers
  const evenHeader = new Header({
      children: [
          new Paragraph({
              children: [new TextRun({ 
                  text: config.headers.evenText, 
                  size: ptToHalfPt(10.5), // 小五
                  font: { eastAsia: "SimSun", name: "Times New Roman" },
                  color: "000000"
              })], 
              alignment: AlignmentType.CENTER,
              border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
          }),
      ],
  });

  const oddHeader = new Header({
      children: [
          new Paragraph({
              children: [new TextRun({ 
                  text: config.headers.oddText.replace("Chapter_Title", "学位论文"), // Simple placeholder replacement
                  size: ptToHalfPt(10.5), // 小五
                  font: { eastAsia: "SimSun", name: "Times New Roman" },
                  color: "000000"
              })], 
              alignment: AlignmentType.CENTER,
              border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } }
          }),
      ],
  });

  const doc = new Document({
    styles: {
        paragraphStyles: [
            {
                id: "Normal",
                name: "Normal",
                run: {
                    font: "Times New Roman",
                    size: 24,
                    color: "000000",
                },
            },
        ],
    },
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
          first: oddHeader, // Cover page usually different, simplified here
      },
      footers: {
          default: new Footer({
              children: [
                  new Paragraph({
                      children: [
                          new TextRun({ 
                              children: [PageNumber.CURRENT],
                              font: { name: "Times New Roman" },
                              size: ptToHalfPt(10.5)
                          }),
                      ],
                      alignment: AlignmentType.CENTER,
                  }),
              ],
          }),
      },
      children: [
        new Paragraph({
            children: [new TextRun({ text: " ", size: 2 })], 
            spacing: { after: 200 }
        }),
        ...children
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeName}.docx`);
};