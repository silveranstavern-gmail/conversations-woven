export type Id = string;

export interface ReasoningDetail {
  type: 'reasoning.summary' | 'reasoning.encrypted' | 'reasoning.text';
  content: string;
  index: number;
  id?: string;
  format?: string;
  signature?: string;
}

export interface ReasoningData {
  details?: ReasoningDetail[];
  summary?: string;
  tokensUsed?: number;
  visible?: boolean;
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ReasoningConfig {
  enabled: boolean;
  effort?: ReasoningEffort;
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
  maxOutputTokens?: number;
  folderId?: Id;
  reasoningConfig?: ReasoningConfig;
}

export type MessageState = 'draft' | 'sending' | 'streaming' | 'complete' | 'failed' | 'stopped';

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
  finishReason?: string;
  reasoning?: ReasoningData;
}
