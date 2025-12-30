
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
