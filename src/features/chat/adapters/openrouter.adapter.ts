import { inject, Injectable } from '@angular/core';
import { KeychainService } from '@core/services/keychain.service';
import type OpenAI from 'openai';
import {
  ChatTurn,
  GenerateTextOptions,
  LlmAdapter,
  LlmModelDescriptor,
  StreamChunk,
  StreamChatOptions,
} from './llm-adapter';
import {
  fromOpenRouterReasoning,
  toOpenRouterReasoning,
  OpenRouterReasoningDetail,
} from '../utils/reasoning-details';

type MessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam & {
  reasoning_details?: OpenRouterReasoningDetail[];
};
type RouterDelta = { reasoning_details?: OpenRouterReasoningDetail[]; reasoning?: string };

@Injectable({ providedIn: 'root' })
export class OpenRouterAdapter implements LlmAdapter {
  private readonly keychain = inject(KeychainService);
  readonly id = 'openrouter';
  readonly label = 'OpenRouter';
  models: LlmModelDescriptor[] = [];

  private async createClient() {
    const apiKey = await this.keychain.readKey('openrouter');
    if (!apiKey) throw new Error('OpenRouter API key is not set. Please add it in Settings.');
    // Keep the SDK out of the initial application bundle; do not retain decrypted keys.
    const { default: Client } = await import('openai');
    return new Client({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': globalThis.location?.origin ?? '',
        'X-Title': 'Conversations Woven',
      },
      maxRetries: 0,
      dangerouslyAllowBrowser: true,
    });
  }

  async *streamChat(turns: ChatTurn[], opts: StreamChatOptions): AsyncIterable<StreamChunk> {
    try {
      const client = await this.createClient();
      const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & {
        provider: { require_parameters: boolean };
        reasoning?: { enabled?: boolean; effort?: string; max_tokens?: number; exclude?: boolean };
      } = {
        model: opts.model,
        messages: this.buildMessages(turns, opts.system),
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        provider: { require_parameters: true },
      };
      if (opts.reasoning) {
        payload.reasoning = {
          enabled: opts.reasoning.enabled,
          exclude: opts.reasoning.exclude,
          ...(opts.reasoning.maxTokens !== undefined
            ? { max_tokens: opts.reasoning.maxTokens }
            : { effort: opts.reasoning.effort }),
        };
      }
      const stream = await client.chat.completions.create(payload, { signal: opts.signal });
      let usage: StreamChunk['usage'];
      let finishReason: string | undefined;
      let hasContent = false;
      for await (const chunk of stream) {
        const error = (chunk as unknown as { error?: { message?: string } }).error;
        if (error) throw new Error(error.message || 'The provider failed during generation.');
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (finishReason === 'error') throw new Error('The provider failed during generation.');
        if (delta?.refusal) throw new Error(delta.refusal);
        const routerDelta = delta as RouterDelta | undefined;
        if (routerDelta?.reasoning_details?.length) {
          for (const detail of routerDelta.reasoning_details) {
            const normalized = fromOpenRouterReasoning(detail);
            if (normalized) yield { deltaReasoning: normalized };
          }
        } else if (routerDelta?.reasoning) {
          yield {
            deltaReasoning: { type: 'reasoning.text', content: routerDelta.reasoning, index: 0 },
          };
        }
        if (delta?.content) {
          hasContent = true;
          yield { deltaText: delta.content };
        }
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens ?? undefined,
            totalTokens: chunk.usage.total_tokens,
          };
        }
      }
      opts.signal?.throwIfAborted();
      if (!finishReason)
        throw new Error(
          'The connection ended before the response completed. Partial text has been kept.',
        );
      if (!hasContent)
        throw new Error(
          `No response text returned (finish reason: ${finishReason}). Try increasing the output limit or changing models.`,
        );
      yield { done: true, usage, finishReason };
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      throw this.formatError(error);
    }
  }

  async generateText(turns: ChatTurn[], opts: GenerateTextOptions): Promise<string> {
    try {
      const client = await this.createClient();
      const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
        provider: { require_parameters: boolean };
      } = {
        model: opts.model,
        messages: this.buildMessages(turns, opts.system),
        stream: false,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        provider: { require_parameters: true },
        ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      };
      const completion = await client.chat.completions.create(payload);
      const choice = completion.choices[0];
      if (choice?.message.content) return choice.message.content;
      throw new Error(
        choice?.message.refusal ||
          `No response text returned (finish reason: ${choice?.finish_reason ?? 'unknown'}).`,
      );
    } catch (error) {
      throw this.formatError(error);
    }
  }

  private buildMessages(turns: ChatTurn[], system?: string): MessageParam[] {
    const messages: MessageParam[] = turns
      .filter((turn) => turn.role !== 'tool')
      .map((turn) => {
        if (turn.role === 'system' || turn.role === 'user') {
          return { role: turn.role, content: turn.content };
        }
        return {
          role: 'assistant',
          content: turn.content,
          ...(turn.reasoningDetails?.length
            ? { reasoning_details: turn.reasoningDetails.map(toOpenRouterReasoning) }
            : {}),
        };
      });
    if (system?.trim()) messages.unshift({ role: 'system', content: system });
    return messages;
  }

  private formatError(error: unknown): Error {
    const apiError = error as {
      status?: number;
      message?: string;
      error?: { message?: string; metadata?: { provider_name?: string; raw?: string } };
    } | null;
    const status = apiError?.status;
    const hint =
      status === 401
        ? 'Check your API key in Settings.'
        : status === 402
          ? 'Check your OpenRouter credit balance.'
          : status === 429
            ? 'Rate limit reached. Wait a moment or choose another model.'
            : '';
    const metadata = apiError?.error?.metadata;
    return new Error(
      [
        'OpenRouter',
        status ? `HTTP ${status}` : '',
        hint,
        apiError?.error?.message || apiError?.message || 'Unable to complete the request.',
        metadata?.provider_name ? `Provider: ${metadata.provider_name}` : '',
        metadata?.raw,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }
}
