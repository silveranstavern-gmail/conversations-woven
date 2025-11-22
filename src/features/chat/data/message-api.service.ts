import { inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { ChatAdaptersService } from './chat-adapters.service';
import { MessageStateService } from './message-state.service';
import { ChatThreadsService } from './chat-threads.service';
import { SelectionStateService } from './selection-state.service';
import { ChatTurn } from '../adapters/llm-adapter';
import { DialogService } from '@core/services/dialog.service';

@Injectable({
  providedIn: 'root'
})
export class MessageApiService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly messageState = inject(MessageStateService);
  private readonly threads = inject(ChatThreadsService);
  private readonly selectionState = inject(SelectionStateService);
  private readonly dialog = inject(DialogService);

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

    // --- VALIDATION START ---
    // Calculate estimated tokens before modifying state
    const activeThread = this.threads.activeThread();
    let effectiveHistory: ChatMessage[] = [];

    if (activeThread && this.selectionState.isContextSelectionActive()) {
        const contextIds = this.selectionState.getContextForThread(activeThread.id);
        // Retrieve the actual message objects for these IDs
        effectiveHistory = this.messageState.getMessagesInOrder(Array.from(contextIds));
    } else {
        effectiveHistory = this.messageState.getEffectiveHistory(threadId);
    }

    // Include System Prompt
    const thread = this.threads.getThreadSnapshot(threadId);
    let systemTokens = 0;
    if (thread?.systemPrompt) {
        systemTokens = this.messageState.estimateTokens(thread.systemPrompt);
        // Some models might double count if sandwiching, but simple sum is safe enough for validation
        // If using sandwich strategy (add start and end), double it. 
        // Current impl sandwiches:
        systemTokens = systemTokens * 2; 
    }

    const historyTokens = this.messageState.calculateTotalTokens(effectiveHistory);
    const newMessageTokens = this.messageState.estimateTokens(content);
    
    // 200 tokens buffer for protocol/formatting overhead
    const totalEstimated = historyTokens + newMessageTokens + systemTokens + 200;
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
      // Determine which messages to send based on context selection mode
      // Note: We re-derive this to build actual turns, similar to validation logic above but mapping to turns
      let turns: ChatTurn[];

      if (activeThread && this.selectionState.isContextSelectionActive()) {
        const contextIds = this.selectionState.getContextForThread(activeThread.id);
        if (contextIds.size > 0) {
          // Build turns from selected context IDs
          turns = this.messageState.buildChatTurnsFromIds(Array.from(contextIds));
          turns.push({
            role: 'user',
            content: userMessage.rawMd ?? ''
          });
        } else {
          turns = this.messageState.buildChatTurns(threadId);
        }
      } else {
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

