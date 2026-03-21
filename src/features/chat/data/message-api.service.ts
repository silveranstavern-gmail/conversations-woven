import { inject, Injectable } from '@angular/core';
import type { ChatMessage, ChatThread, Id, ReasoningDetail } from '@models/chat';
import type { ChatTurn } from '../adapters/llm-adapter';
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

  async sendUserMessage(rawMd: string, modelId: string, threadId: Id): Promise<boolean> {
    if (this.messageState.isStreaming()) {
      return false;
    }
    const content = rawMd.trim();
    if (!threadId || !content) {
      return false;
    }
    const model = this.adapters.getModelById(modelId);
    if (!model) {
      await this.dialog.alert({
        title: 'Selected Model Unavailable',
        message: 'The selected model is no longer available. Choose another model and try again.'
      });
      return false;
    }

    const thread = this.threads.getThreadSnapshot(threadId);
    if (!thread) {
      return false;
    }
    const reasoningConfig = thread.reasoningConfig ?? null;

    // --- VALIDATION START ---
    const requestBuffer = 200;
    const requestContext = this.contextEngine.buildRequestContext(thread, content, requestBuffer);
    const totalEstimated = requestContext.estimatedTotalTokens;
    const limit = model.contextLength > 0 ? model.contextLength : null;

    if (limit !== null && totalEstimated > limit) {
      await this.dialog.alert({
        title: 'Context Limit Exceeded',
        message:
          `This request is estimated at ~${totalEstimated.toLocaleString()} tokens for ${model.label}, ` +
          `which exceeds the model limit of ${limit.toLocaleString()}.\n\n` +
          `Current context: ~${requestContext.context.tokens.total.toLocaleString()} tokens.\n` +
          `Your draft plus response buffer: ~${(requestContext.userMessageTokens + requestBuffer).toLocaleString()} tokens.\n\n` +
          'Please compact previous messages, trim the draft, or switch to a model with a larger context window.'
      });
      return false;
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
      tokensOut: 0,
      reasoning: reasoningConfig?.enabled
        ? {
            details: [],
            tokensUsed: 0,
            visible: reasoningConfig.showInChat
          }
        : undefined
    };
    // Persist immediately so a quick reload doesn't drop the pending assistant response
    await this.messageState.upsertMessage(assistantMessage);
    this.messageState.setStreamingMessageId(assistantMessage.id);
    void this.streamAssistantResponse(model.id, requestContext.turns, thread, assistantMessage).catch(
      (error) => {
        console.error('Failed to finalize assistant stream', error);
        this.messageState.setStreamingMessageId(null);
      }
    );
    return true;
  }

  private async streamAssistantResponse(
    modelId: string,
    turns: ChatTurn[],
    thread: ChatThread,
    assistantMessage: ChatMessage
  ): Promise<void> {
    const reasoningConfig = thread.reasoningConfig ?? null;
    let workingAssistant = assistantMessage;
    try {
      const stream = await this.adapters.streamModel(modelId, turns, {
        temperature: thread.temperature,
        reasoning: reasoningConfig?.enabled
          ? {
              effort: reasoningConfig.effort,
              maxTokens: reasoningConfig.maxTokens,
              summaryVerbosity: reasoningConfig.summaryVerbosity,
              exclude: false
            }
          : undefined
      });
      let hasContent = false;
      let lastSaved = Date.now();
      let isFirstContent = true;
      const reasoningBuffer: ReasoningDetail[] = [];

      for await (const chunk of stream) {
        const patch: Partial<ChatMessage> = {
          state: chunk.done ? 'complete' : 'streaming',
          error: undefined
        };
        if (chunk.deltaText) {
          hasContent = true;
          patch.rawMd = `${workingAssistant.rawMd ?? ''}${chunk.deltaText}`;
        }
        if (chunk.deltaReasoning && workingAssistant.reasoning) {
          reasoningBuffer.push(chunk.deltaReasoning);
          patch.reasoning = {
            ...workingAssistant.reasoning,
            details: [...reasoningBuffer]
          };
        }
        if (chunk.usage?.promptTokens !== undefined) {
          patch.tokensIn = chunk.usage.promptTokens;
        }
        if (chunk.usage?.completionTokens !== undefined) {
          patch.tokensOut = chunk.usage.completionTokens;
        }
        if (chunk.usage?.reasoningTokens !== undefined && workingAssistant.reasoning) {
          patch.reasoning = {
            ...(patch.reasoning ?? workingAssistant.reasoning),
            tokensUsed: chunk.usage.reasoningTokens
          };
        }

        workingAssistant = {
          ...workingAssistant,
          ...patch,
          revision: workingAssistant.revision + 1
        };

        // Update the visible signal when this thread is still active, but keep the local
        // working copy authoritative so switching chats mid-stream does not drop content.
        this.messageState.replaceMessageSignal(workingAssistant);

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

      if (!hasContent && workingAssistant.state !== 'complete') {
        workingAssistant = {
          ...workingAssistant,
          state: 'complete',
          revision: workingAssistant.revision + 1
        };
        this.messageState.replaceMessageSignal(workingAssistant);
        await this.messageState.upsertMessage(workingAssistant);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to stream response';
      workingAssistant = {
        ...workingAssistant,
        state: 'failed',
        error: message,
        revision: workingAssistant.revision + 1
      };
      this.messageState.replaceMessageSignal(workingAssistant);
      await this.messageState.upsertMessage(workingAssistant);
    } finally {
      this.messageState.setStreamingMessageId(null);
    }
  }
}
