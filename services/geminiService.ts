import { GoogleGenAI } from "@google/genai";
import { UserInput, ThesisSection, ThesisStructure, ApiConfig, Agent, ThesisStyleConfig } from "../types";

// Fallback prompts for Chief Editor (Fixer)
const FIXER_PLANNER_PROMPT = `
### 角色
你是一位**学术内容撰写专家** (隶属于总编审团队)。

### 任务
你负责撰写本章缺失的正文内容。

### 原则
1. **纯净正文**：输出的内容**绝对不要**包含章节标题本身。
2. **纯文字**：严禁生成图表、表格或图片占位符。
3. **数学公式**：**必须**使用 LaTeX 格式。行内公式用单美元符号 $...$，独立公式用双美元符号 $$...$$。
4. **完整性**：为传入的所有小节 ID 撰写内容。
5. **深度**：内容必须包含数学公式推导、理论证明和详尽的数据分析。
6. **格式**：输出 JSON，Key 为 ID，Value 为 Markdown 正文。

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
3. **图注与描述**：
   - 使用 "> [图 x-y] 图表详细描述" 的格式。
   - **必须**在图表后附带详细的分析描述文本。
4. **纯净性**：严禁生成正文段落和标题，只返回图表相关内容。
5. **范围**：不处理总结、摘要、参考文献等章节。

### 步骤
1. 扫描章节内的小节。
2. 重新审视本章，为需要数据支撑的部分设计图表。
3. 返回 JSON。
`;

const REFINE_CHAT_SYSTEM_PROMPT = `
### 角色设定
你是一位**资深理工科硕士生导师**。
你的目标是指导学生完成一篇结构严谨、逻辑闭环、符合学术规范的**硕士学位论文**。

### 核心任务
通过多轮苏格拉底式的引导提问，从用户（学生）那里挖掘撰写核心章节所需的全部素材。最终，你将作为**“信息整合专家”**，将所有对话细节汇总成一份详尽的上下文指令。

### 交互策略与准则 (分阶段引导)

**阶段一：领域与题目定调**
- 询问研究的大方向（如计算机视觉、自然语言处理等）。
- 协助拟定一个学术性强、不空泛的题目。

**阶段二：核心章节架构**
- 硕士论文通常包含 2-3 个核心创新章（例如：第3章提出改进算法A，第4章应用A解决具体场景B）。
- 询问学生打算安排几个核心章，每一章解决什么具体痛点（Gap）。

**阶段三：方法论深度挖掘 (Method)**
- 针对核心算法，拒绝浅层描述。必须追问：
  - “这个模块的具体输入输出是什么？”
  - “核心公式是如何定义的？Loss Function 包含哪几项？”
  - “相较于 Baseline，你的具体改进机制在哪里？”

**阶段四：实验设计与评估 (Experiments)**
- **数据集**：使用什么公开数据集或私有数据？
- **对比方法 (Baselines)**：对比了哪些 SOTA 方法？
- **评价指标 (Metrics)**：
  - **重要**：询问使用哪些具体的量化指标来评价性能（如 PSNR, SSIM, Dice, Accuracy, F1-score）。
  - **注意**：**不要**询问具体的实验数值结果（不要问“跑了多少分”），只确认“用什么测”。
- **图表规划 (Visuals - 主动提案模式)**：
  - **重要**：在此阶段，不要问学生“你想怎么画表”。**你要根据前几轮对话收集到的信息（方法、对比模型、指标），主动设计并展示预期的三线表结构。**
  - **主实验表提案**：例如：“基于您提到的对比方法 [A, B] 和指标 [X, Y]，我建议设计如下的主实验对比表：行是[Method A, Method B, Ours]，列是[Metric X, Metric Y]。预期 Ours 在 X 指标上最优...”
  - **消融实验表提案**：例如：“为了验证您提到的 [模块M]，我建议设计一个消融实验表，设置变体 [Base, Base+M1, Base+M2, Ours]，以证明各模块有效性。”
  - **交互**：给出你的设计方案后，请学生**审阅**：“您看这个表格设计是否合理？还需要补充其他对比维度或删除某些行吗？”

### 结束与输出条件 (Synthesis)
**只有**当你认为信息已经足够支撑生成一篇长文时（即 Method 细节清晰，实验设计完备，且图表结构已由你提案并经用户确认），请执行以下操作：

1. 向用户发送结束语：“✅ **核心信息采集完毕**。我已经作为信息整合专家，将您的想法整理为一份详细的生成指令。请点击右上角的 **[应用方案]** 按钮。”
2. **紧接着**，在回复的**最后**，输出一个包含以下 JSON 的代码块。

\`\`\`json
{
  "title": "最终确定的学术题目",
  "field": "研究领域",
  "refinedContext": "这是一个Markdown格式的【超级指令】，由你作为信息整合专家编写。内容必须包含：\n\n1. **核心逻辑链**：输入->方法->输出的完整闭环。\n2. **章节详细安排**：明确第3、4、5章分别写什么。\n3. **详细的方法定义**：包含对话中挖掘到的Loss函数描述、模块细节。\n4. **实验与图表矩阵**：明确列出需要生成的【三线表】结构（行是哪些对比方法，列是哪些Metrics，预期趋势），以及消融实验的设计。\n5. **预期结论**：基于指标的预期优越性描述。"
}
\`\`\`

**注意**：在对话过程中，**不要**输出 JSON，只用专业、循循善诱的中文与用户交流。只有在最后一步才输出 JSON 代码块。
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
          // If userPrompt is actually a stringified JSON history (hack for simple call), parse it?
          // But our main callLLM signature assumes userPrompt is a string.
          // For Chat, we will bypass this function slightly or adapt it.
          // **ADAPTATION**: If userPrompt looks like a chat history array, use it directly.
          ...(isJsonString(userPrompt) ? JSON.parse(userPrompt) : [{ role: "user", content: userPrompt }])
        ],
        temperature: 0.7, // Higher temp for creative brainstorming
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
  if (!apiKey) throw new Error("API_KEY is missing. Please configure Custom API in settings.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // For Chat, we need a slightly different call structure if using Gemini SDK directly
    // But to keep it simple, we reuse generateContent with history in 'contents' if possible
    // OR we just use the simple generateContent for now, constructing the prompt manually.
    
    // Construct full prompt from history if userPrompt is JSON history
    let finalPrompt = userPrompt;
    let history: {role: string, content: string}[] = [];
    if (isJsonString(userPrompt)) {
        history = JSON.parse(userPrompt);
        // Convert history to Gemini format string or chat session
        // For simplicity in this helper, we'll just concat for now if it's not a chat session object
        // Actually, let's just stick to the Custom API style for chat mostly, or handle single turn here.
        // Given constraints, let's assume Custom API is preferred for Chat.
        // If Gemini, we'll just send the last message + context.
        const lastMsg = history[history.length - 1].content;
        finalPrompt = `Previous Context:\n${JSON.stringify(history.slice(0, -1))}\n\nCurrent Request: ${lastMsg}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: finalPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: jsonMode ? "application/json" : "text/plain",
        temperature: 0.7
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

const isJsonString = (str: string) => {
    try {
        const o = JSON.parse(str);
        return (o && typeof o === "object");
    } catch (e) { return false; }
};

// ** NEW: Interactive Chat Refinement Agent **
export const runRefinementChat = async (
    history: { role: string; content: string }[],
    apiConfig?: ApiConfig
): Promise<{ text: string; finished: boolean; data?: any }> => {
    
    // We pass the whole history to the LLM
    // Hack: We serialize history to pass it through our generic callLLM 'userPrompt' argument
    // The callLLM function has been patched above to detect JSON array string and use it as messages.
    const historyPayload = JSON.stringify(history);

    try {
        // We set jsonMode to FALSE because we want natural conversation mostly.
        // The prompt instructs the LLM to output JSON only at the end.
        const responseText = await callLLM(REFINE_CHAT_SYSTEM_PROMPT, historyPayload, apiConfig, false);
        
        // Check for JSON block indicating completion
        const jsonMatch = extractJson(responseText); // This tries to find JSON in the text
        
        // Heuristic: If we found a valid JSON object that has 'refinedContext' and 'title', 
        // AND the text explicitly mentions completion or we found the block at the end.
        if (jsonMatch && jsonMatch.title && jsonMatch.refinedContext) {
             return {
                 text: responseText.replace(/```json[\s\S]*?```/g, ''), // Remove the JSON from display text
                 finished: true,
                 data: jsonMatch
             };
        }

        return {
            text: responseText,
            finished: false
        };

    } catch (e: any) {
        console.error("Refinement Chat failed", e);
        throw new Error("Advisor is offline. Check API settings.");
    }
};

// Deprecated single-shot agent (kept for type safety if needed, but UI uses Chat now)
export const runIdeaRefinementAgent = async (
    rawInput: string,
    apiConfig?: ApiConfig
): Promise<{ title: string; field: string; refinedContext: string }> => {
    // Legacy fallback
    return { title: "Legacy", field: "Legacy", refinedContext: rawInput };
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
            ${isVisuals ? 
            `- **仅生成图表与描述**: 仅输出 Markdown 表格、数据矩阵或图表占位符 (e.g. > [图 x.x] ...)。
             - **包含描述**: 每个图表后必须跟一段对图表的简要分析或描述。
             - **严禁生成普通正文**: 不要重复生成章节的常规正文文本。
             - **严禁生成标题**: 不要包含章节标题。` 
            : 
            `- 每个ID的内容尽量详实，包含理论推导或实验数据。
             - 使用 Markdown 格式。
             - **数学公式**: 必须使用 LaTeX 格式。行内公式使用 $...$，独立公式使用 $$...$$。
             - **纯文本**: 严禁生成 Markdown 表格或图表占位符。专注于文字叙述。
             - **禁止重复标题**: 内容中不要包含章节标题本身 (e.g., 不要写 "# 1.1 Intro")，直接写正文。`
            }

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
       // Added strict filtering to avoid visual generation in inappropriate chapters
       const skipKeywords = ["摘要", "Abstract", "致谢", "Acknowledgement", "参考", "Reference", "附录", "Appendix", "目录", "总结", "Conclusion", "展望", "Outlook"];
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
        // Distinguish between JSON parsing errors (retryable) and API errors (critical)
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
                } catch (retryError: any) {
                    const retryMsg = retryError.message || "";
                    if (!retryMsg.includes("JSON") && !retryMsg.includes("Syntax")) {
                         // Critical error during retry, must propagate
                         throw retryError;
                    }
                    console.error(`Batch retry failed for part of ${chapter.root.title}`, retryError);
                }
            }
        } else {
            console.error(`Critical error in ${chapter.root.title}, aborting agent.`, e);
            throw e; // Re-throw critical API errors (e.g., 401, network error)
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
  apiConfig?: ApiConfig,
  userInstruction?: string // Added: User specific feedback
): Promise<ThesisStructure> => {
  
  const newStructure = JSON.parse(JSON.stringify(currentStructure)) as ThesisStructure;
  
  // Find all actual objects for the IDs
  const sectionsToProcess = newStructure.filter(s => sectionIdsToRegenerate.includes(s.id));
  if (sectionsToProcess.length === 0) return newStructure;

  const isVisuals = agent.name.includes("视觉") || agent.name.includes("Visuals") || agent.name.includes("Visuals Fix");
  const isArchitect = agent.name.includes("架构师") || agent.name.includes("Architect"); // Added check for Architect
  
  const structureList = sectionsToProcess.map(s => `- ID: "${s.id}" Title: "${s.title}" (Level ${s.level})`).join('\n');

  let userPrompt = `
    ### 任务类型: 内容重写 / 优化
    ### 上下文
    主题: ${userInput.topic}
    领域: ${userInput.field}
    侧重点: ${userInput.specificFocus}
    
    ### 目标小节
    ${structureList}
    
    ### 用户具体指令 (User Feedback)
    ${userInstruction ? `用户对这部分内容/结构提出了修改意见: "${userInstruction}"。\n请严格根据此意见进行修改。` : "用户觉得这部分不满意，请重新生成优化。"}
    
    ### 任务要求
    请一次性为上述**所有**小节ID生成内容。
    
    ### 约束与格式
    1. **JSON 输出**: 必须返回 JSON 对象: { "ID": "Value..." }
    2. **转义规则**: JSON 字符串内容必须正确转义双引号和换行符。
  `;

  if (isArchitect) {
      userPrompt += `
    3. **架构师模式 (Structure Refinement)**:
       - 你的任务是**修改章节标题**或**调整结构**。
       - 返回的 JSON Value 应该是**新的标题字符串** (New Title)。
       - 如果需要，你可以微调标题的层级标记 (如 ## 3.1)。
       - 严禁生成正文内容。只返回标题。
      `;
  } else if (isVisuals) {
      userPrompt += `
    3. **视觉专家模式**:
       - **仅生成图表与描述**: 仅输出 Markdown 表格或图表说明。严禁生成正文或标题。
       - **包含描述**: 每个图表后必须跟一段对图表的简要分析或描述。
      `;
  } else {
      userPrompt += `
    3. **内容撰写模式**:
       - 内容必须详实，深度优化。
       - 使用 Markdown 格式。
       - **数学公式**: 必须使用 LaTeX 格式。行内公式使用 $...$，独立公式使用 $$...$$。
       - **纯文本**: 严禁生成 Markdown 表格或图表占位符。专注于文字叙述。
       - **禁止重复标题**: 内容中不要包含章节标题本身，直接写正文。
      `;
  }

  userPrompt += `
    ### 思考与执行
    1. 根据用户指令和模式类型生成 JSON。
    2. 确保所有ID都有对应的结果。
    3. 返回 JSON。
  `;

  try {
    const responseText = await callLLM(agent.systemPrompt, userPrompt, apiConfig, true);
    const partialContent = extractJson(responseText);
    
    if (partialContent) {
      for (const [key, value] of Object.entries(partialContent)) {
            const section = newStructure.find(s => s.id === key);
            if (section) {
                if (isArchitect) {
                    // Update Title for Architect
                    let newTitle = value as string;
                    // Ensure basic level indicators if lost, though LLM usually handles it or we rely on existing level
                    if (!newTitle.startsWith('#')) {
                         newTitle = "#".repeat(section.level) + " " + newTitle;
                    }
                    section.title = newTitle;
                } else if (isVisuals) {
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
          userInput, // Fixed: passing userInput instead of updatedStructure
          updatedStructure, // pass updated as current
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

export const parseStyleGuide = async (
  rawText: string,
  apiConfig?: ApiConfig
): Promise<ThesisStyleConfig> => {
  const systemPrompt = `
    ### Role
    You are a document formatting expert.

    ### Task
    Extract thesis formatting requirements from the user's provided style guide text.
    Return a JSON object matching the standard configuration structure.

    ### Target JSON Structure (TypeScript Interface)
    {
      margins: { top: number; bottom: number; left: number; right: number }; // unit: cm. default: 2.54
      body: {
        font: { family: string; size: number; }; // size in pt (e.g. 小四=12, 五号=10.5)
        indent: boolean; // true if first line indent is required
        lineSpacing: number; // e.g. 1.5 or 1.25
      };
      headings: {
        h1: { family: string; size: number; bold: boolean; align: 'center'|'left' }; // Chapter title
        h2: { family: string; size: number; bold: boolean; align: 'center'|'left' }; // Section title
        h3: { family: string; size: number; bold: boolean; align: 'center'|'left' }; 
      };
      tables: {
        font: { family: string; size: number; };
      };
      headers: {
        useOddEven: boolean; // true if odd/even pages have different headers
        oddText: string; 
        evenText: string; 
      };
    }

    ### Chinese Font Size Mapping
    - 初号=42, 小初=36
    - 一号=26, 小一=24
    - 二号=22, 小二=18
    - 三号=16, 小三=15
    - 四号=14, 小四=12
    - 五号=10.5, 小五=9

    ### Output Rule
    - Only return the JSON.
    - Infer reasonable defaults for missing values.
  `;

  const userPrompt = `Here is the style guide text:\n${rawText}`;

  const responseText = await callLLM(systemPrompt, userPrompt, apiConfig, true);
  const json = extractJson(responseText);
  
  if (!json) throw new Error("Failed to parse style guide");
  return json as ThesisStyleConfig;
};