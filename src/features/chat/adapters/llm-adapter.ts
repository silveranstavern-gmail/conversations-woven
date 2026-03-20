import { InjectionToken } from '@angular/core';
import type { ReasoningDetail } from '@models/chat';

export interface StreamUsage {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface StreamChunk {
  deltaText?: string;
  deltaReasoning?: ReasoningDetail;
  done?: boolean;
  usage?: StreamUsage;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoningDetails?: ReasoningDetail[];
}

export interface ReasoningRequestOptions {
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  exclude?: boolean;
  summaryVerbosity?: 'auto' | 'concise' | 'detailed';
}

export interface StreamChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  reasoning?: ReasoningRequestOptions;
}

export interface GenerateTextOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface LlmModelDescriptor {
  id: string;
  label: string;
  adapterId: string;
  adapterModelId: string;
  capabilities: LlmCapabilities;
}

export interface LlmCapabilities {
  streaming: boolean;
  tools: boolean;
  jsonMode: boolean;
  maxTokens: number;
}

export interface LlmAdapter {
  readonly id: string;
  readonly label: string;
  readonly models: LlmModelDescriptor[];
  streamChat(turns: ChatTurn[], opts: StreamChatOptions): AsyncIterable<StreamChunk>;
  /**
   * Generates a complete chat response as a single string.
   */
  generateText(turns: ChatTurn[], opts: GenerateTextOptions): Promise<string>;
}

export const LLM_ADAPTER_TOKEN = new InjectionToken<LlmAdapter[]>('LLM_ADAPTER_TOKEN');
