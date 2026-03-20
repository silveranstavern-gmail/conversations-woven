export type Id = string;

export interface ReasoningDetail {
  type: 'reasoning.summary' | 'reasoning.encrypted' | 'reasoning.text';
  content: string;
  index: number;
  id?: string;
}

export interface ReasoningData {
  details?: ReasoningDetail[];
  summary?: string;
  tokensUsed?: number;
  visible?: boolean;
}

export interface ReasoningConfig {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  showInChat: boolean;
  captureInHistory: boolean;
  summaryVerbosity?: 'auto' | 'concise' | 'detailed';
}

export interface ChatThread {
  id: Id;
  title: string;
  createdAt: string;
  updatedAt: string;
  preferredModelId?: string;
  rootMessageId?: Id;
  activeMessageId?: Id;
  messageCount: number;
  tags?: string[];
  meta?: Record<string, unknown>;
  version: number;
  pinned?: boolean;
  protected?: boolean;
  systemPrompt?: string;
  temperature?: number;
  folderId?: Id;
  reasoningConfig?: ReasoningConfig;
}

export type MessageState = 'draft' | 'sending' | 'streaming' | 'complete' | 'failed';

export interface ChatMessage {
  id: Id;
  threadId: Id;
  role: 'system' | 'user' | 'assistant' | 'tool';
  parentId?: Id;
  createdAt: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  rawMd?: string;
  renderedMd?: string;
  revision: number;
  compactedFrom?: Id[];
  compactedSummary?: string;
  state: MessageState;
  error?: string;
  reasoning?: ReasoningData;
}
