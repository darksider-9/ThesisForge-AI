
import { GoogleGenAI } from "@google/genai";
import { UserInput, ThesisSection, ThesisStructure, ApiConfig, Agent } from "../types";

// Fallback prompts for Chief Editor (Fixer)
const FIXER_PLANNER_PROMPT = `
### 角色
你是一位**学术内容撰写专家** (隶属于总编审团队)。

### 任务
你负责撰写本章缺失的正文内容。

### 原则
1. **纯净正文**：输出的内容**绝对不要**包含章节标题本身。
2. **完整性**：为传入的所有小节 ID 撰写内容。
3. **深度**：内容必须包含数学公式推导、理论证明和详尽的数据分析。
4. **格式**：输出 JSON，Key 为 ID，Value 为 Markdown 正文。

### 步骤
1. 阅读章节标题和小节 ID。
2. 为每个 ID 撰写对应的学术正文（不带标题）。
3. 合并为一个 JSON 对象返回。
`;

const FIXER_VISUALS_PROMPT = `
### 角色
你是一位**数据可视化专家** (隶属于总编审团队)。

### 任务
你负责为本章补充缺失的图表。

### 原则
1. **数量**：为当前章节设计丰富的数据表格和图表说明。
2. **格式**：Markdown 表格。
3. **图注**：使用 "> [图 x-y] 图表详细描述" 的格式。

### 步骤
1. 扫描章节内的小节。
2. 重新审视本章，为需要数据支撑的部分设计图表。
3. 返回 JSON。
`;

const cleanText = (text: string | undefined): string => {
  if (!text) return "";
  return text.trim();
};

const extractJson = (text: string): any => {
  if (!text) return null;
  
  // 1. Try to parse pure JSON directly
  try { return JSON.parse(text); } catch (e) {}

  let jsonString = text.trim();
  
  // 2. Try to find markdown code blocks (```json ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  const matches = [...jsonString.matchAll(codeBlockRegex)];
  
  if (matches.length > 0) {
    // Try from last to first
    for (let i = matches.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(matches[i][1]);
        } catch (e) {
            // continue
        }
    }
  }

  // 2b. Handle unclosed code block (truncated output)
  // If no complete block found, look for unclosed block
  if (matches.length === 0) {
     const unclosedMatch = jsonString.match(/```(?:json)?\s*([\s\S]*)/i);
     if (unclosedMatch) {
        let content = unclosedMatch[1].trim();
        // Attempt to find the end of the JSON object if possible (last closing brace)
        const lastBrace = content.lastIndexOf('}');
        if (lastBrace !== -1) {
            const potentialJson = content.substring(0, lastBrace + 1);
            try { return JSON.parse(potentialJson); } catch (e) {}
        }
        // Fallback: try parsing as is (sometimes just missing ```)
        try { return JSON.parse(content); } catch(e) {}
     }
  }

  // 3. Heuristic: Find outermost braces {} or brackets []
  const firstBrace = jsonString.indexOf('{');
  const firstBracket = jsonString.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = jsonString.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = jsonString.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1) {
    const candidate = jsonString.substring(startIdx, endIdx + 1);
    try { return JSON.parse(candidate); } catch (e) {}
    
    // 4. Cleanup and retry
    try {
        // Simple cleanup for common issues like newlines in strings not escaped
        const repaired = candidate
            .replace(/[\n\r\t]/g, " ")
            .replace(/\\/g, "\\\\") 
            .replace(/\\\\"/g, '\\"') 
            .replace(/\\\\n/g, "\\n");
        return JSON.parse(repaired);
    } catch(e) {}
  }

  // Explicitly throw error to trigger retry logic
  throw new Error(`Fatal JSON Error. Raw Text Snippet: ${text.substring(0, 100)}...`);
};

const callLLM = async (
  systemPrompt: string, 
  userPrompt: string, 
  config?: ApiConfig,
  jsonMode: boolean = true
): Promise<string> => {
  
  // 1. Custom OpenAI-Compatible API
  if (config && config.useCustom && config.apiKey && config.baseUrl) {
    try {
      let baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
      let url = baseUrl;
      if (!url.endsWith("/chat/completions")) {
        url = `${url}/chat/completions`;
      }

      console.log(`Using Custom API: ${config.modelName} at ${url}`);
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      };

      const body = {
        model: config.modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.5,
      };

      // 15-minute timeout for reasoning models
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900000); 

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) throw new Error("404 Not Found. Check Base URL.");
        if (response.status === 401) throw new Error("401 Unauthorized. Check API Key.");
        throw new Error(`Custom API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Custom API returned empty content");
      return cleanText(content);

    } catch (e: any) {
      console.error("Custom API Call Failed", e);
      if (e.name === 'AbortError') {
          throw new Error("Request timed out (>15 mins). The model took too long to think.");
      }
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
         throw new Error("Network Error: Could not connect to Custom API. Check CORS settings or Base URL.");
      }
      throw e;
    }
  }

  // 2. Default Google Gemini API
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY is missing.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: jsonMode ? "application/json" : "text/plain",
        temperature: 0.5
      }
    });
    return cleanText(response.text);
  } catch (e: any) {
     if (e.status === 429 || (e.message && e.message.includes('429'))) {
         throw new Error("Gemini API Quota Exceeded (429). Please switch to Custom API in settings.");
     }
     throw e;
  }
};

// ** NEW: Idea Refinement Agent **
export const runIdeaRefinementAgent = async (
    rawInput: string,
    apiConfig?: ApiConfig
): Promise<{ title: string; field: string; refinedContext: string }> => {
    const systemPrompt = `
    ### 角色
    你是一位**理工科博士生导师**，擅长将学生杂乱的实验想法整理成严谨的**硕士论文开题报告**。

    ### 任务
    分析用户的原始输入（可能包含混乱的实验细节、方法片段），整理出结构化的论文规格说明。

    ### 关键输出要求 (JSON)
    1. **title**: 提炼一个学术性强、简洁的中文题目。
    2. **field**: 归纳研究领域（如医学图像处理）。
    3. **refinedContext**: 这是一个Markdown格式的详细说明，将作为后续AI生成的"上下文指令"。必须包含：
        - **核心逻辑链**: 输入->方法->输出。
        - **章节安排策略**: 明确指出核心章节应该怎么分（例如：第三章做生成与配准，第四章做重建）。避免章节内容重合。
        - **实验设计矩阵**: 明确列出所有对比实验、消融实验的分组（Baseline vs Ours）。
        - **图表规划**: 明确每一章需要哪些图表（Table X: ... Figure Y: ...）。

    ### 思考逻辑
    - 识别用户提到的具体技术（如CycleGAN, Mamba, PICCS）。
    - 将零散的实验点归类到具体的章节中。
    - 针对理工科论文，强调"对比实验"和"消融实验"的完整性。
    `;

    const userPrompt = `
    ### 学生的原始想法
    ${rawInput}

    ### 请整理
    请整理为 JSON 格式: { "title": "...", "field": "...", "refinedContext": "Markdown String..." }
    `;

    try {
        const responseText = await callLLM(systemPrompt, userPrompt, apiConfig, true);
        const parsed = extractJson(responseText);
        return {
            title: parsed.title || "未命名课题",
            field: parsed.field || "通用领域",
            refinedContext: parsed.refinedContext || rawInput
        };
    } catch (e: any) {
        console.error("Refinement failed", e);
        throw new Error("Idea refinement failed. Please try again.");
    }
};

export const runArchitectAgent = async (
  userInput: UserInput,
  apiConfig?: ApiConfig,
  overrideSystemPrompt?: string
): Promise<ThesisStructure> => {
  const systemPrompt = overrideSystemPrompt || `
    ### 角色
    你是一位经验丰富的**硕士论文架构师**。

    ### 原则
    1. **输出格式**：必须输出严格的 JSON 格式。
    2. **标题逻辑**：根据用户的主题设计具体、专业的章节标题，拒绝通用模板。
    3. **唯一性**：每个部分必须有唯一的 ID。

    ### 核心结构要求 (关键)
    1. **章节闭环**：硕士论文的核心章节（通常为第3、4、5章）每一章都必须遵循**“方法理论 + 实验验证”**的闭环结构。
    2. **禁止独立实验章**：**严禁**将“实验结果与分析”单独设为一章。实验内容必须紧随其对应的理论/方法章节出现在同一章。

    ### Few-Shot Example
    {
      "sections": [
        { "id": "s_abs", "title": "摘要", "level": 1 },
        { "id": "s_100", "title": "# 第一章 绪论", "level": 1 },
        { "id": "s_300", "title": "# 第三章 [核心方法]", "level": 1 },
        { "id": "s_301", "title": "## 3.1 理论分析", "level": 2 },
        { "id": "s_302", "title": "## 3.2 实验验证", "level": 2 }
      ]
    }
  `;

  const userPrompt = `
    ### 输入数据
    - 领域: ${userInput.field}
    - 主题: ${userInput.topic}
    - 侧重点 (Context): ${userInput.specificFocus}

    ### 任务步骤
    1. 分析主题和侧重点。
    2. 设计一套标准的硕士论文结构（通常 5-7 章）。
    3. **重点检查**：确保第 3 章及之后的创新点章节，每一章都包含完整的“理论+实验”。不要创建独立的“实验章”。
    4. 为每一节生成唯一的 ID。
    5. 返回 JSON 数据。
  `;

  const responseText = await callLLM(systemPrompt, userPrompt, apiConfig, true);
  try {
      const parsed = extractJson(responseText);
      let structure: ThesisSection[] = [];

      if (parsed) {
        if (Array.isArray(parsed)) {
          structure = parsed;
        } else if (parsed.sections && Array.isArray(parsed.sections)) {
          structure = parsed.sections;
        } else {
          const keys = Object.keys(parsed);
          for (const key of keys) {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
              if (parsed[key][0].title || parsed[key][0].id) {
                structure = parsed[key];
                break;
              }
            }
          }
        }
      }

      if (structure.length === 0) throw new Error("No structure found");
      return structure;

  } catch (e) {
     console.error("Architect Output was:", responseText);
     throw new Error("Architect failed to generate structure. Model output was not valid JSON.");
  }
};

export const runContentInjectionAgent = async (
  agentName: string,
  systemPromptTemplate: string,
  userInput: UserInput,
  currentStructure: ThesisStructure,
  apiConfig?: ApiConfig,
  onlyMissing: boolean = false
): Promise<ThesisStructure> => {

  const newStructure = JSON.parse(JSON.stringify(currentStructure)) as ThesisStructure;
  
  // Strategy: Group by Chapter (Level 1).
  const chapters: { root: ThesisSection; children: ThesisSection[] }[] = [];
  let currentChapter: { root: ThesisSection; children: ThesisSection[] } | null = null;

  for (const section of newStructure) {
    if (section.level === 1) {
      if (currentChapter) chapters.push(currentChapter);
      currentChapter = { root: section, children: [] };
    } else {
      if (currentChapter) currentChapter.children.push(section);
    }
  }
  if (currentChapter) chapters.push(currentChapter);

  const isVisuals = agentName.includes("视觉") || agentName.includes("Visuals") || agentName.includes("Visuals Fix");

  // Helper function to process a batch of sections
  const processBatch = async (batchSections: ThesisSection[], chapterTitle: string) => {
      const structureList = batchSections.map(s => `- ID: "${s.id}" Title: "${s.title}" (Level ${s.level})`).join('\n');
      const userPrompt = `
        ### 上下文
        主题: ${userInput.topic}
        领域: ${userInput.field}
        侧重点: ${userInput.specificFocus}
        
        ### 目标章节
        **${chapterTitle}**
        包含以下小节:
        ${structureList}
        
        ### 任务要求
        请一次性为上述**所有**小节ID生成内容。
        
        ### 约束与格式
        1. **JSON 输出**: 必须返回 JSON 对象: { "ID": "Markdown内容..." }
        2. **转义规则**: JSON 字符串内容必须正确转义双引号和换行符。
        3. **内容要求**:
            - 每个ID的内容尽量详实，包含理论推导或实验数据。
            - 使用 Markdown 格式。
            - 公式使用 LaTeX $...$。
            ${!isVisuals ? '- **禁止重复标题**: 内容中不要包含章节标题本身 (e.g., 不要写 "# 1.1 Intro")，直接写正文。' : ''}

        ### 思考与执行
        1. ${isVisuals ? '为每个小节设计图表占位符或数据表。' : '为每个小节撰写连贯的学术正文(不带标题)。'}
        2. 确保所有ID都有对应的内容。
        3. 返回 JSON。
      `;

      const responseText = await callLLM(systemPromptTemplate, userPrompt, apiConfig, true);
      const partialContent = extractJson(responseText);
      
      if (partialContent) {
        for (const [key, value] of Object.entries(partialContent)) {
              const section = newStructure.find(s => s.id === key);
              if (section) {
                  if (isVisuals) {
                      section.visuals = value as string;
                  } else {
                      let contentStr = value as string;
                      if (contentStr.trim().startsWith('#')) {
                        contentStr = contentStr.replace(/^#[^\n]*\n/, '').trim();
                      }
                      section.content = contentStr;
                  }
              }
        }
      }
  };

  // Process each chapter sequentially
  for (const chapter of chapters) {
    
    // **VISUALS FILTERING**
    if (isVisuals) {
       const skipKeywords = ["摘要", "Abstract", "致谢", "Acknowledgement", "参考", "Reference", "附录", "Appendix", "目录"];
       const titleLower = chapter.root.title.toLowerCase();
       if (skipKeywords.some(k => titleLower.includes(k.toLowerCase()))) {
           console.log(`Skipping Visuals for: ${chapter.root.title}`);
           continue;
       }
    }

    const sectionsToProcess = chapter.children.length > 0 ? chapter.children : [chapter.root];
    
    // **CHIEF EDITOR LOGIC: Chapter Level Check**
    // Update: User requires STRICT "Whole Chapter Missing" check.
    // We only regenerate if ALL sections in the chapter are empty.
    if (onlyMissing) {
        const isChapterCompletelyMissing = sectionsToProcess.every(s => {
            if (isVisuals) return !s.visuals || s.visuals.trim() === '';
            return !s.content || s.content.trim() === '';
        });

        if (!isChapterCompletelyMissing) {
            console.log(`Skipping ${chapter.root.title} - Chapter is not completely empty (User Rule: Only fix if whole chapter missing).`);
            continue;
        }
        console.log(`Fixing Chapter: ${chapter.root.title} - Chapter is completely empty, regenerating.`);
    }

    console.log(`Processing Chapter: ${chapter.root.title} (${agentName}) - Items: ${sectionsToProcess.length}`);

    // **ATTEMPT 1: WHOLE CHAPTER BATCH**
    try {
        await processBatch(sectionsToProcess, chapter.root.title);
    } catch (e: any) {
        // **ERROR HANDLING: AUTOMATIC BATCH SPLITTING**
        const errorMsg = e.message || e.toString();
        if (errorMsg.includes("Fatal JSON Error") || errorMsg.includes("JSON") || errorMsg.includes("SyntaxError")) {
            console.warn(`Error detected in ${chapter.root.title}. Switching to Safety Batch Mode (3 batches).`, e);
            
            // Split into 3 chunks
            const chunkSize = Math.ceil(sectionsToProcess.length / 3);
            const chunks = [];
            for (let i = 0; i < sectionsToProcess.length; i += chunkSize) {
                chunks.push(sectionsToProcess.slice(i, i + chunkSize));
            }

            // Process chunks sequentially
            for (const chunk of chunks) {
                try {
                    await processBatch(chunk, chapter.root.title);
                } catch (retryError) {
                    console.error(`Batch retry failed for part of ${chapter.root.title}`, retryError);
                }
            }
        } else {
            console.error(`Non-JSON error in ${chapter.root.title}, skipping.`, e);
        }
    }
  }

  return newStructure;
};

// **NEW FUNCTION: REGENERATE SPECIFIC SECTIONS**
export const regenerateSpecificSections = async (
  agent: Agent,
  userInput: UserInput,
  currentStructure: ThesisStructure,
  sectionIdsToRegenerate: string[],
  apiConfig?: ApiConfig
): Promise<ThesisStructure> => {
  
  const newStructure = JSON.parse(JSON.stringify(currentStructure)) as ThesisStructure;
  
  // Find all actual objects for the IDs
  const sectionsToProcess = newStructure.filter(s => sectionIdsToRegenerate.includes(s.id));
  if (sectionsToProcess.length === 0) return newStructure;

  const isVisuals = agent.name.includes("视觉") || agent.name.includes("Visuals") || agent.name.includes("Visuals Fix");
  const agentName = agent.name;
  
  const structureList = sectionsToProcess.map(s => `- ID: "${s.id}" Title: "${s.title}" (Level ${s.level})`).join('\n');

  const userPrompt = `
    ### 任务类型: 内容重写 / 优化
    ### 上下文
    主题: ${userInput.topic}
    领域: ${userInput.field}
    侧重点: ${userInput.specificFocus}
    
    ### 目标小节
    ${structureList}
    
    ### 任务要求
    用户对上述小节的生成结果不满意，请重新撰写或设计。
    请一次性为上述**所有**小节ID生成内容。
    
    ### 约束与格式
    1. **JSON 输出**: 必须返回 JSON 对象: { "ID": "Markdown内容..." }
    2. **转义规则**: JSON 字符串内容必须正确转义双引号和换行符。
    3. **内容要求**:
        - 内容必须详实，深度优化。
        - 使用 Markdown 格式。
        ${!isVisuals ? '- **禁止重复标题**: 内容中不要包含章节标题本身，直接写正文。' : ''}

    ### 思考与执行
    1. ${isVisuals ? '为选中小节重新设计图表/表格。' : '为选中小节重新撰写正文。'}
    2. 返回 JSON。
  `;

  try {
    const responseText = await callLLM(agent.systemPrompt, userPrompt, apiConfig, true);
    const partialContent = extractJson(responseText);
    
    if (partialContent) {
      for (const [key, value] of Object.entries(partialContent)) {
            const section = newStructure.find(s => s.id === key);
            if (section) {
                if (isVisuals) {
                    section.visuals = value as string;
                } else {
                    let contentStr = value as string;
                    if (contentStr.trim().startsWith('#')) {
                      contentStr = contentStr.replace(/^#[^\n]*\n/, '').trim();
                    }
                    section.content = contentStr;
                }
            }
      }
    }
  } catch (e: any) {
    console.error("Regeneration failed", e);
    throw new Error(`Regeneration failed: ${e.message}`);
  }

  return newStructure;
};

export const runAgentStepStructured = async (
  agent: { name: string, systemPrompt: string, id: string },
  userInput: UserInput,
  currentStructure: ThesisStructure,
  apiConfig?: ApiConfig
): Promise<{ structure: ThesisStructure, markdown: string }> => {

  let updatedStructure: ThesisStructure = [];

  if (agent.name.includes("架构师") || agent.name.includes("Architect")) {
    updatedStructure = await runArchitectAgent(userInput, apiConfig, agent.systemPrompt);
  } else if (agent.id === 'final_draft') {
      // **CHIEF EDITOR LOGIC (Check & Fix)**
      console.log("Chief Editor running checks...");
      
      // 1. Fix missing content (Chapter level check)
      // If a chapter has missing content, it regenerates the whole chapter content.
      updatedStructure = await runContentInjectionAgent(
          "Chief Editor (Content Fix)",
          FIXER_PLANNER_PROMPT,
          userInput,
          currentStructure, // Start with current
          apiConfig,
          true // Only missing Check
      );
      
      // 2. Fix missing visuals (Chapter level check)
      // If a chapter has missing visuals, it regenerates the whole chapter visuals.
      updatedStructure = await runContentInjectionAgent(
          "Chief Editor (Visuals Fix)",
          FIXER_VISUALS_PROMPT,
          userInput,
          updatedStructure,
          apiConfig,
          true // Only missing Check
      );

  } else {
    updatedStructure = await runContentInjectionAgent(
      agent.name,
      agent.systemPrompt,
      userInput,
      currentStructure,
      apiConfig
    );
  }

  const markdown = renderThesisMarkdown(updatedStructure, userInput.topic);
  return { structure: updatedStructure, markdown };
};

export const renderThesisMarkdown = (structure: ThesisStructure, topic?: string): string => {
  if (!structure || structure.length === 0) return "";
  let md = "";
  if (topic) md += `# ${topic}\n\n`;
  md += "## 目录 (Table of Contents)\n";
  structure.forEach(s => {
    if (s.level <= 2) {
        const indent = "  ".repeat(Math.max(0, s.level - 1));
        const cleanTitle = s.title.replace(/^#+\s*/, '');
        md += `${indent}- ${cleanTitle}\n`; 
    }
  });
  md += "\n---\n\n";
  structure.forEach(s => {
    let prefix = "#".repeat(s.level);
    let cleanTitle = s.title.replace(/^#+\s*/, '');
    md += `${prefix} ${cleanTitle}\n\n`;
    if (s.content) md += `${s.content}\n\n`;
    if (s.visuals) md += `${s.visuals}\n\n`;
    if (s.level === 1) md += "\n---\n\n"; 
  });
  return md;
};

// Deprecated: Compiler removed from UI, but function kept for safety.
export const runCodeCompiler = async (
  fullThesisText: string,
  apiConfig?: ApiConfig
): Promise<string> => {
  return "";
};

export const generateAgentPrompt = async (name: string, description: string, apiConfig?: ApiConfig): Promise<string> => {
  const prompt = `
    ### Role
    You are a Prompt Engineer (提示词工程师).

    ### Task
    Create a System Prompt for an AI Agent named "${name}".
    Description: ${description}

    ### Requirements
    1. Use the "Role-Principles-Strategy-Steps" structure.
    2. The output prompt must be in **Chinese**.
    3. Force JSON output.
    4. Include a Few-Shot example.
  `;
  try {
    return await callLLM("You are a Prompt Engineer.", prompt, apiConfig, false);
  } catch (error) {
    return "Prompt generation failed.";
  }
};
