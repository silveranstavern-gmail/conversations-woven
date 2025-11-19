import { InjectionToken } from '@angular/core';

export interface StreamChunk {
  deltaText?: string;
  done?: boolean;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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
  streamChat(
    turns: ChatTurn[],
    opts: { model: string; maxTokens?: number; temperature?: number; system?: string }
  ): AsyncIterable<StreamChunk>;
  /**
   * Generates a complete chat response as a single string.
   */
  generateText(
    turns: ChatTurn[],
    opts: { model: string; maxTokens?: number; temperature?: number; system?: string }
  ): Promise<string>;
}

export const LLM_ADAPTER_TOKEN = new InjectionToken<LlmAdapter[]>('LLM_ADAPTER_TOKEN');
