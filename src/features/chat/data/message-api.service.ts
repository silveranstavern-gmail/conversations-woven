import { inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { ChatAdaptersService } from './chat-adapters.service';
import { MessageStateService } from './message-state.service';
import { ChatThreadsService } from './chat-threads.service';
import { DialogService } from '@core/services/dialog.service';
import { ContextEngineService } from './context-engine.service';

@Injectable({
  providedIn: 'root'
})
export class MessageApiService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly messageState = inject(MessageStateService);
  private readonly threads = inject(ChatThreadsService);
  private readonly dialog = inject(DialogService);
  private readonly contextEngine = inject(ContextEngineService);

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

    const thread = this.threads.getThreadSnapshot(threadId);
    if (!thread) {
      return;
    }

    // --- VALIDATION START ---
    const requestContext = this.contextEngine.buildRequestContext(thread, content);
    const totalEstimated = requestContext.estimatedTotalTokens;
    const limit = model.contextLength || 4096;

    if (totalEstimated > limit) {
      await this.dialog.alert({
        title: 'Context Limit Exceeded',
        message: `This conversation exceeds the model's context limit (~${totalEstimated} / ${limit} tokens).\n\nPlease compact previous messages, delete irrelevant ones, or select a specific context range to proceed.`
      });
      return;
    }
    // --- VALIDATION END ---

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
    // Persist immediately so a quick reload doesn't drop the pending assistant response
    await this.messageState.upsertMessage(assistantMessage);
    this.messageState.setStreamingMessageId(assistantMessage.id);

    try {
      const stream = await this.adapters.streamModel(model.id, requestContext.turns, {
        temperature: thread.temperature
      });
      let workingAssistant = assistantMessage;
      let hasContent = false;
      let lastSaved = Date.now();
      let isFirstContent = true;

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

        // Update signal immediately for UI responsiveness
        const updated = this.messageState.updateMessageSignal(assistantMessage.id, patch);
        if (updated) {
          workingAssistant = updated;
        }

        const now = Date.now();
        // Save if: chunk is done, OR 1s passed, OR this is the first content chunk (for safety)
        if (chunk.done || now - lastSaved > 1000 || (chunk.deltaText && isFirstContent)) {
          await this.messageState.upsertMessage(workingAssistant);
          lastSaved = now;
          if (chunk.deltaText) {
            isFirstContent = false;
          }
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
