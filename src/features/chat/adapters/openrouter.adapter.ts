import { inject, Injectable } from '@angular/core';
import { KeychainService } from '@core/services/keychain.service';
import type { ReasoningDetail } from '@models/chat';
import OpenAI from 'openai';
import { ChatTurn, LlmAdapter, LlmModelDescriptor, StreamChunk, StreamChatOptions } from './llm-adapter';

@Injectable({
  providedIn: 'root'
})
export class OpenRouterAdapter implements LlmAdapter {
  private readonly keychain = inject(KeychainService);

  readonly id = 'openrouter';

  readonly label = 'OpenRouter';

  models: LlmModelDescriptor[] = []; // This will be populated dynamically.

  async *streamChat(turns: ChatTurn[], opts: StreamChatOptions): AsyncIterable<StreamChunk> {
    const apiKey = await this.keychain.readKey('openrouter');
    if (!apiKey) {
      throw new Error('OpenRouter API key is not set. Please add it in Settings.');
    }

    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:4200', // Replace with your actual site URL in production
        'X-Title': 'Conversations Woven' // Replace with your app name
      },
      dangerouslyAllowBrowser: true
    });

    // Filter out tool messages as they require tool_call_id which we don't have
    // and they're typically not needed in the conversation context
    type MessageParam =
      OpenAI.Chat.Completions.ChatCompletionMessageParam & { reasoning_details?: ReasoningDetail[] };
    const messages: MessageParam[] = turns
      .filter((turn): turn is Exclude<ChatTurn, { role: 'tool' }> => turn.role !== 'tool')
      .map((turn) => {
        if (turn.role === 'system') {
          return { role: 'system' as const, content: turn.content };
        }
        if (turn.role === 'user') {
          return { role: 'user' as const, content: turn.content };
        }
        const assistantMessage: MessageParam = { role: 'assistant' as const, content: turn.content };
        if (turn.reasoningDetails?.length) {
          assistantMessage.reasoning_details = turn.reasoningDetails.map((detail, index) => ({
            ...detail,
            index: detail.index ?? index
          }));
        }
        return assistantMessage;
      });

    if (opts.system?.trim()) {
      messages.unshift({ role: 'system', content: opts.system });
    }

    type ReasoningParams = { reasoning?: { effort?: string; max_tokens?: number } };
    const requestPayload: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming &
      ReasoningParams = {
        model: opts.model,
        messages,
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature
      };

    if (opts.reasoning && !opts.reasoning.exclude) {
      requestPayload.reasoning = {
        effort: opts.reasoning.effort,
        max_tokens: opts.reasoning.maxTokens
      };
    }

    try {
      const stream = await client.chat.completions.create(requestPayload);

      let finalUsage: StreamChunk['usage'] | undefined;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        const reasoningDetails = (delta as any)?.reasoning_details as
          | Array<{ type?: string; text?: string; summary?: string; data?: string; index?: number; id?: string }>
          | undefined;
        if (Array.isArray(reasoningDetails)) {
          for (const detail of reasoningDetails) {
            const content = detail.text ?? detail.summary ?? detail.data ?? '';
            if (content) {
              yield {
                deltaReasoning: {
                  type:
                    detail.type === 'reasoning.encrypted' || detail.type === 'reasoning.summary'
                      ? detail.type
                      : 'reasoning.text',
                  content,
                  index: detail.index ?? 0,
                  id: detail.id
                }
              };
            }
          }
        }

        const contentDelta = delta?.content;
        if (Array.isArray(contentDelta)) {
          for (const part of contentDelta) {
            const text =
              typeof part === 'string'
                ? part
                : typeof part === 'object' && part !== null && 'text' in part
                  ? (part as { text?: string }).text
                  : null;
            if (text) {
              yield { deltaText: text };
            }
          }
        } else if (typeof contentDelta === 'string' && contentDelta) {
          yield { deltaText: contentDelta };
        }

        if (chunk.usage) {
          finalUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            reasoningTokens: (chunk.usage as any).reasoning_tokens,
            totalTokens: chunk.usage.total_tokens
          };
        }
      }

      yield { done: true, usage: finalUsage };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const fragments: string[] = [];
        const pushFragment = (value?: string | number | null) => {
          if (value === null || value === undefined || value === '') {
            return;
          }
          const text = String(value);
          if (!fragments.includes(text)) {
            fragments.push(text);
          }
        };

        pushFragment(error.status ? `HTTP ${error.status}` : null);
        pushFragment(error.type);

        const payload = (error.error ?? undefined) as
          | { message?: string; code?: string | number; metadata?: Record<string, unknown> }
          | undefined;
        if (payload) {
          pushFragment(payload.code ? `Code ${payload.code}` : null);
          pushFragment(payload.message);
          const metadata = payload.metadata as { raw?: string; provider_name?: string } | undefined;
          if (metadata?.raw) {
            const providerSuffix = metadata.provider_name ? ` (provider: ${metadata.provider_name})` : '';
            pushFragment(`${metadata.raw}${providerSuffix}`);
          } else if (metadata?.provider_name) {
            pushFragment(`Provider: ${metadata.provider_name}`);
          }
        }

        pushFragment(error.message);

        const details = fragments.join(' · ') || 'Unknown error';
        throw new Error(`OpenRouter API Error: ${details}`);
      }

      throw new Error(`OpenRouter API Error: ${(error as Error).message}`);
    }
  }

  async generateText(
    turns: ChatTurn[],
    opts: { model: string; maxTokens?: number; temperature?: number; system?: string }
  ): Promise<string> {
    const apiKey = await this.keychain.readKey('openrouter');
    if (!apiKey) {
      throw new Error('OpenRouter API key is not set. Please add it in Settings.');
    }

    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:4200',
        'X-Title': 'Conversations Woven'
      },
      dangerouslyAllowBrowser: true
    });

    type MessageParam =
      OpenAI.Chat.Completions.ChatCompletionMessageParam & { reasoning_details?: ReasoningDetail[] };
    const messages: MessageParam[] = turns
      .filter((turn): turn is Exclude<ChatTurn, { role: 'tool' }> => turn.role !== 'tool')
      .map((turn) => {
        if (turn.role === 'system') {
          return { role: 'system' as const, content: turn.content };
        }
        if (turn.role === 'user') {
          return { role: 'user' as const, content: turn.content };
        }
        const assistantMessage: MessageParam = { role: 'assistant' as const, content: turn.content };
        if (turn.reasoningDetails?.length) {
          assistantMessage.reasoning_details = turn.reasoningDetails.map((detail, index) => ({
            ...detail,
            index: detail.index ?? index
          }));
        }
        return assistantMessage;
      });

    if (opts.system?.trim()) {
      messages.unshift({ role: 'system', content: opts.system });
    }

    try {
      const completion = await client.chat.completions.create({
        model: opts.model,
        messages,
        stream: false, // Set to false for a single response
        max_tokens: opts.maxTokens,
        temperature: opts.temperature
      });

      return completion.choices[0]?.message?.content ?? '';
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const fragments: string[] = [];
        const pushFragment = (value?: string | number | null) => {
          if (value === null || value === undefined || value === '') {
            return;
          }
          const text = String(value);
          if (!fragments.includes(text)) {
            fragments.push(text);
          }
        };

        pushFragment(error.status ? `HTTP ${error.status}` : null);
        pushFragment(error.type);

        const payload = (error.error ?? undefined) as
          | { message?: string; code?: string | number; metadata?: Record<string, unknown> }
          | undefined;
        if (payload) {
          pushFragment(payload.code ? `Code ${payload.code}` : null);
          pushFragment(payload.message);
          const metadata = payload.metadata as { raw?: string; provider_name?: string } | undefined;
          if (metadata?.raw) {
            const providerSuffix = metadata.provider_name ? ` (provider: ${metadata.provider_name})` : '';
            pushFragment(`${metadata.raw}${providerSuffix}`);
          } else if (metadata?.provider_name) {
            pushFragment(`Provider: ${metadata.provider_name}`);
          }
        }

        pushFragment(error.message);
        const details = fragments.join(' · ') || 'Unknown error';
        throw new Error(`OpenRouter API Error: ${details}`);
      }

      throw new Error(`OpenRouter API Error: ${(error as Error).message}`);
    }
  }
}
