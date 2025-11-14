export type Id = string;

export interface Attachment {
  id: Id;
  name: string;
  mime: string;
  size: number;
  url?: string;
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
  attachments?: Attachment[];
  revision: number;
  compactedFrom?: Id[];
  compactedSummary?: string;
  state: MessageState;
  error?: string;
}
