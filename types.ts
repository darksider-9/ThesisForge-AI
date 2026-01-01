
export type AgentStatus = 'idle' | 'working' | 'completed' | 'error' | 'waiting';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: 'layout' | 'flask' | 'image' | 'table' | 'bot' | 'search' | 'pen' | 'code' | 'merge';
  status: AgentStatus;
  systemPrompt: string;
  isCustom?: boolean;
  wordCount?: number;
}

export interface UserInput {
  topic: string;
  field: string;
  specificFocus: string;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  useCustom: boolean;
}

export type DocumentHistory = Record<string, string>;
export type ThesisContent = Record<string, string>;

export interface GenerationProgress {
  currentStepIndex: number;
  totalSteps: number;
}

export interface ThesisSection {
  id: string;
  title: string;
  level: number;
  content?: string;
  visuals?: string;
  isLeaf?: boolean;
}

export type ThesisStructure = ThesisSection[];

export interface FontConfig {
  family: string;
  size: number; // pt
  bold?: boolean;
  align?: 'center' | 'left' | 'right' | 'justify';
}

export interface ThesisStyleConfig {
  margins: { top: number; bottom: number; left: number; right: number }; // in cm
  body: {
    font: FontConfig;
    indent: boolean; // First line indent (2 chars)
    lineSpacing: number; // e.g., 1.5 or 1.25
  };
  headings: {
    h1: FontConfig; // Usually Chapter
    h2: FontConfig; // Usually Section
    h3: FontConfig; // Usually Subsection
    h4?: FontConfig; // Sub-subsection
  };
  tables: {
    font: FontConfig;
  };
  headers: {
    useOddEven: boolean;
    oddText: string; 
    evenText: string; 
  };
  rawGuide?: string; 
}
