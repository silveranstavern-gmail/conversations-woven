import { inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { ChatAdaptersService } from './chat-adapters.service';
import { MessageStateService } from './message-state.service';
import { ChatThreadsService } from './chat-threads.service';
import { SelectionStateService } from './selection-state.service';
import { ChatTurn } from '../adapters/llm-adapter';

@Injectable({
  providedIn: 'root'
})
export class MessageApiService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly messageState = inject(MessageStateService);
  private readonly threads = inject(ChatThreadsService);
  private readonly selectionState = inject(SelectionStateService);

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
    // Persist immediately so a quick reload doesn't drop the pending assistant response
    await this.messageState.upsertMessage(assistantMessage);
    this.messageState.setStreamingMessageId(assistantMessage.id);

    try {
      // Determine which messages to send based on context selection mode
      const activeThread = this.threads.activeThread();
      let turns: ChatTurn[];

      if (activeThread && this.selectionState.isContextSelectionActive()) {
        const contextIds = this.selectionState.getContextForThread(activeThread.id);
        if (contextIds.size > 0) {
          // Build turns from selected context IDs
          turns = this.messageState.buildChatTurnsFromIds(Array.from(contextIds));
          // IMPORTANT: The new user message must be added to the turns before sending
          turns.push({
            role: 'user',
            content: userMessage.rawMd ?? ''
          });
        } else {
          // No context selected, fall back to all messages
          turns = this.messageState.buildChatTurns(threadId);
        }
      } else {
        // Normal mode: use all messages
        turns = this.messageState.buildChatTurns(threadId);
      }

      // Sandwich system prompt: add at start and end (only if not already in turns)
      const thread = this.threads.getThreadSnapshot(threadId);
      if (thread?.systemPrompt && !turns.some((t) => t.role === 'system')) {
        turns = [
          { role: 'system', content: thread.systemPrompt },
          ...turns,
          { role: 'system', content: thread.systemPrompt }
        ];
      }

      // Don't pass system via opts since we're managing it in the turns array
      // This prevents duplicate system messages at the start
      const stream = await this.adapters.streamModel(model.id, turns, {
        temperature: thread?.temperature
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

