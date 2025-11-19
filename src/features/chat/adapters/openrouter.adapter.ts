import { inject, Injectable } from '@angular/core';
import { KeychainService } from '@core/services/keychain.service';
import OpenAI from 'openai';
import { ChatTurn, LlmAdapter, LlmModelDescriptor, StreamChunk } from './llm-adapter';

@Injectable({
  providedIn: 'root'
})
export class OpenRouterAdapter implements LlmAdapter {
  private readonly keychain = inject(KeychainService);

  readonly id = 'openrouter';

  readonly label = 'OpenRouter';

  models: LlmModelDescriptor[] = []; // This will be populated dynamically.

  async *streamChat(
    turns: ChatTurn[],
    opts: { model: string; maxTokens?: number; temperature?: number; system?: string }
  ): AsyncIterable<StreamChunk> {
    const apiKey = await this.keychain.readKey('openrouter');
    if (!apiKey) {
      throw new Error('OpenRouter API key is not set. Please add it in Settings.');
    }

    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:4200', // Replace with your actual site URL in production
        'X-Title': 'Advanced LLM Chat' // Replace with your app name
      },
      dangerouslyAllowBrowser: true
    });

    // Filter out tool messages as they require tool_call_id which we don't have
    // and they're typically not needed in the conversation context
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = turns
      .filter((turn): turn is Exclude<ChatTurn, { role: 'tool' }> => turn.role !== 'tool')
      .map((turn) => {
        // TypeScript now knows turn.role is 'system' | 'user' | 'assistant'
        if (turn.role === 'system') {
          return { role: 'system' as const, content: turn.content };
        } else if (turn.role === 'user') {
          return { role: 'user' as const, content: turn.content };
        } else {
          return { role: 'assistant' as const, content: turn.content };
        }
      });

    if (opts.system?.trim()) {
      messages.unshift({ role: 'system', content: opts.system });
    }

    try {
      const stream = await client.chat.completions.create({
        model: opts.model,
        messages,
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield { deltaText: delta };
        }
      }

      yield { done: true };
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
        'X-Title': 'Advanced LLM Chat'
      },
      dangerouslyAllowBrowser: true
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = turns
      .filter((turn): turn is Exclude<ChatTurn, { role: 'tool' }> => turn.role !== 'tool')
      .map((turn) => {
        if (turn.role === 'system') {
          return { role: 'system' as const, content: turn.content };
        } else if (turn.role === 'user') {
          return { role: 'user' as const, content: turn.content };
        } else {
          return { role: 'assistant' as const, content: turn.content };
        }
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
