import { inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { ChatAdaptersService } from './chat-adapters.service';
import { MessageStateService } from './message-state.service';
import { ChatTurn } from '../adapters/llm-adapter';

@Injectable({
  providedIn: 'root'
})
export class MessageApiService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly messageState = inject(MessageStateService);

  async sendUserMessage(rawMd: string, modelId: string, threadId: Id): Promise<void> {
    if (this.messageState.isStreaming()) {
      return;
    }
    const content = rawMd.trim();
    if (!threadId || !content) {
      return;
    }
    const model = this.adapters.getModelById(modelId);
    if (!model) {
      return;
    }
    const now = new Date();
    const userMessage: ChatMessage = {
      id: this.messageState.generateId(),
      threadId,
      role: 'user',
      createdAt: now.toISOString(),
      revision: 1,
      rawMd: content,
      state: 'complete'
    };
    await this.messageState.upsertMessage(userMessage);

    const assistantMessage: ChatMessage = {
      id: this.messageState.generateId(),
      threadId,
      role: 'assistant',
      parentId: userMessage.id,
      createdAt: new Date(now.getTime() + 1000).toISOString(),
      revision: 1,
      rawMd: '',
      state: 'streaming',
      model: model.id,
      tokensIn: 0,
      tokensOut: 0
    };
    await this.messageState.upsertMessage(assistantMessage);
    this.messageState.setStreamingMessageId(assistantMessage.id);

    try {
      const turns = this.messageState.buildChatTurns(threadId);
      const stream = await this.adapters.streamModel(model.id, turns, {});
      let workingAssistant = assistantMessage;
      let hasContent = false;

      for await (const chunk of stream) {
        const patch: Partial<ChatMessage> = {
          state: chunk.done ? 'complete' : 'streaming',
          error: undefined
        };
        if (chunk.deltaText) {
          hasContent = true;
          patch.rawMd = `${workingAssistant.rawMd ?? ''}${chunk.deltaText}`;
        }
        if (chunk.usage?.promptTokens !== undefined) {
          patch.tokensIn = chunk.usage.promptTokens;
        }
        if (chunk.usage?.completionTokens !== undefined) {
          patch.tokensOut = chunk.usage.completionTokens;
        }

        const updated = await this.messageState.updateMessage(assistantMessage.id, patch);
        if (updated) {
          workingAssistant = updated;
        }
      }

      if (!hasContent) {
        await this.messageState.updateMessage(assistantMessage.id, { state: 'complete' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to stream response';
      await this.messageState.updateMessage(assistantMessage.id, { state: 'failed', error: message });
    } finally {
      this.messageState.setStreamingMessageId(null);
    }
  }
}

