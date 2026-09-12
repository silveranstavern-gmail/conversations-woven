import { inject, Injectable } from '@angular/core';
import type { ChatMessage, ChatThread, Id, ReasoningConfig } from '@models/chat';
import type { ChatTurn } from '../adapters/llm-adapter';
import { MessageStateService } from './message-state.service';
import { ChatAdaptersService } from './chat-adapters.service';
import { SelectionStateService } from './selection-state.service';

export interface PromptContext {
  threadId: Id | null;
  systemPrompt: string | null;
  messages: ChatMessage[];
  turns: ChatTurn[];
  selection: {
    isActive: boolean;
    selectedIds: Set<Id>;
  };
  tokens: {
    system: number;
    history: number;
    total: number;
  };
  reasoningConfig: ReasoningConfig | null;
}

export interface PromptRequestContext {
  context: PromptContext;
  userMessageTokens: number;
  estimatedTotalTokens: number;
  turns: ChatTurn[];
  reasoningConfig: ReasoningConfig | null;
}

@Injectable({
  providedIn: 'root'
})
export class ContextEngineService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly messageState = inject(MessageStateService);
  private readonly selectionState = inject(SelectionStateService);

  buildContext(thread: ChatThread | null): PromptContext {
    if (!thread) {
      return {
        threadId: null,
        systemPrompt: null,
        messages: [],
        turns: [],
        selection: {
          isActive: false,
          selectedIds: new Set<Id>()
        },
        tokens: {
          system: 0,
          history: 0,
          total: 0
        },
        reasoningConfig: null
      };
    }

    const isSelectionActive = this.selectionState.isContextSelectionActive();
    const selectedIds = new Set(this.selectionState.getContextForThread(thread.id));
    const useSelection = isSelectionActive;
    const selectedMessages = useSelection
      ? this.filterMessagesForContext(this.messageState.getMessagesInOrder(Array.from(selectedIds)).filter(message => message.threadId === thread.id))
      : this.messageState.getEffectiveHistory(thread.id);

    const historyTokens = this.messageState.calculateTotalTokens(selectedMessages);
    const systemTokens = thread.systemPrompt
      ? this.messageState.estimateTokens(thread.systemPrompt) * 2
      : 0;

    const selectedModel = this.adapters.resolveModelSelection(thread.preferredModelId).model;
    let turns = this.mapMessagesToTurns(selectedMessages,
      selectedModel?.capabilities.reasoning ? thread.reasoningConfig : null,
      selectedModel?.id);
    const reasoningTokens = turns.reduce((sum, turn) => sum +
      (turn.reasoningDetails ?? []).reduce((total, detail) => total + this.messageState.estimateTokens(detail.content), 0), 0);
    if (thread.systemPrompt) {
      const systemTurn: ChatTurn = { role: 'system', content: thread.systemPrompt };
      // Keep the thread-level sandwich strategy explicit. This wraps the entire request
      // with the configured system prompt without duplicating any internal system turns
      // that may already exist inside the conversation history.
      turns = [systemTurn, ...turns, systemTurn];
    }

    return {
      threadId: thread.id,
      systemPrompt: thread.systemPrompt ?? null,
      messages: selectedMessages,
      turns,
      selection: {
        isActive: isSelectionActive,
        selectedIds
      },
      tokens: {
        system: systemTokens,
        history: historyTokens + reasoningTokens,
        total: systemTokens + historyTokens + reasoningTokens
      },
      reasoningConfig: thread.reasoningConfig ?? null
    };
  }

  buildRequestContext(
    thread: ChatThread | null,
    userContent: string,
    buffer = 200
  ): PromptRequestContext {
    const context = this.buildContext(thread);
    const trimmed = userContent.trim();
    const userTokens = trimmed ? this.messageState.estimateTokens(trimmed) : 0;
    const turns = trimmed
      ? [...context.turns, { role: 'user', content: trimmed } as ChatTurn]
      : [...context.turns];

    return {
      context,
      userMessageTokens: userTokens,
      estimatedTotalTokens: context.tokens.total + userTokens + buffer,
      turns,
      reasoningConfig: context.reasoningConfig
    };
  }

  private filterMessagesForContext(messages: ChatMessage[]): ChatMessage[] {
    return messages
      .filter((message) => message.state !== 'failed')
      .filter((message) => message.role !== 'assistant' || message.state === 'complete');
  }

  private mapMessagesToTurns(
    messages: ChatMessage[],
    reasoningConfig: ReasoningConfig | null = null,
    modelId?: string
  ): ChatTurn[] {
    const captureReasoning = reasoningConfig?.captureInHistory ?? false;
    return messages
      .map((message) => {
        const turn: ChatTurn = {
          role: message.role,
          content: message.rawMd ?? ''
        };
        if (
          captureReasoning &&
          message.role === 'assistant' &&
          message.model === modelId &&
          message.reasoning?.details?.length
        ) {
          turn.reasoningDetails = [...message.reasoning.details];
        }
        return turn;
      })
      .filter((turn) => {
        const hasContent = turn.content.trim().length > 0;
        const hasReasoning = captureReasoning && !!turn.reasoningDetails?.length;
        return hasContent || hasReasoning;
      }) as ChatTurn[];
  }

  calculateReasoningStats(messages: ChatMessage[]) {
    const withReasoning = messages.filter((message) => message.reasoning?.tokensUsed);
    const totalReasoningTokens = withReasoning.reduce(
      (sum, message) => sum + (message.reasoning?.tokensUsed ?? 0),
      0
    );
    return {
      messagesWithReasoning: withReasoning.length,
      totalReasoningTokens,
      averageReasoningPerMessage:
        withReasoning.length > 0 ? totalReasoningTokens / withReasoning.length : 0
    };
  }
}
