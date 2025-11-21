import { inject, Injectable } from '@angular/core';
import type { ChatMessage } from '@models/chat';
import { ChatAdaptersService } from '@features/chat/data/chat-adapters.service';
import { ChatThreadsService } from '@features/chat/data/chat-threads.service';
import { SystemPromptsService } from './system-prompts.service';
import { ChatTurn } from '@features/chat/adapters/llm-adapter';

@Injectable({
  providedIn: 'root'
})
export class SummarizerService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly threads = inject(ChatThreadsService);
  private readonly systemPrompts = inject(SystemPromptsService);

  async summarize(messages: ChatMessage[]): Promise<string> {
    if (!messages.length) {
      return 'Compacted summary unavailable.';
    }

    const compactorSettings = this.systemPrompts.compactor();
    
    // Determine which model to use
    let modelId: string | null = null;
    if (compactorSettings.modelId === 'default') {
      // Use the current chat's preferred model
      const activeThread = this.threads.activeThread();
      if (activeThread) {
        const available = this.adapters.models();
        const candidate = activeThread.preferredModelId;
        if (candidate && available.some((model) => model.id === candidate)) {
          modelId = candidate;
        } else {
          modelId = available[0]?.id ?? null;
        }
      } else {
        modelId = this.adapters.models()[0]?.id ?? null;
      }
    } else {
      modelId = compactorSettings.modelId;
    }

    const availableModels = this.adapters.models();
    if (availableModels.length === 0 || !modelId) {
      // Fallback to simple concatenation if no models available
      return this.fallbackSummarize(messages);
    }

    const model = this.adapters.getModelById(modelId);
    if (!model) {
      return this.fallbackSummarize(messages);
    }

    try {
      // Convert messages to ChatTurn format
      const turns: ChatTurn[] = messages
        .map((message): ChatTurn | null => {
          let role: 'system' | 'user' | 'assistant' | 'tool';
          if (message.role === 'system') {
            role = 'system';
          } else if (message.role === 'assistant') {
            role = 'assistant';
          } else if (message.role === 'tool') {
            role = 'tool';
          } else {
            role = 'user';
          }
          const content = message.rawMd ?? '';
          if (!content.trim()) {
            return null;
          }
          return { role, content };
        })
        .filter((turn): turn is ChatTurn => turn !== null);

      if (turns.length === 0) {
        return 'Compacted summary unavailable.';
      }

      // Sandwich strategy: Re-inject instructions at the end
      turns.push({
        role: 'system',
        content: `IMPORTANT REMINDER: ${compactorSettings.prompt}`
      });

      // Call the non-streaming method to get complete response
      const summary = await this.adapters.generateText(modelId, turns, {
        system: compactorSettings.prompt,
        temperature: compactorSettings.temperature,
        maxTokens: compactorSettings.maxTokens
      });

      return summary.trim() || this.fallbackSummarize(messages);
    } catch (error) {
      console.error('Error generating summary with LLM:', error);
      // Fallback to simple concatenation on error
      return this.fallbackSummarize(messages);
    }
  }

  private fallbackSummarize(messages: ChatMessage[]): string {
    // Fallback implementation (original behavior)
    const parts = messages.map((message, index) => {
      const roleLabel =
        message.role === 'assistant'
          ? 'Assistant'
          : message.role === 'user'
            ? 'User'
            : message.role;
      const content = (message.rawMd ?? '').replace(/\s+/g, ' ').trim();
      const snippet = content.length > 220 ? `${content.slice(0, 217)}…` : content;
      return `${index + 1}. ${roleLabel}: ${snippet || '[no content]'}`;
    });

    return ['Compacted conversation summary:', ...parts].join('\n');
  }
}

