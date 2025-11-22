import { inject, Injectable } from '@angular/core';
import type { ChatMessage, ChatThread, Id } from '@models/chat';
import type { ChatTurn } from '../adapters/llm-adapter';
import { MessageStateService } from './message-state.service';
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
}

export interface PromptRequestContext {
  context: PromptContext;
  userMessageTokens: number;
  estimatedTotalTokens: number;
  turns: ChatTurn[];
}

@Injectable({
  providedIn: 'root'
})
export class ContextEngineService {
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
        }
      };
    }

    const isSelectionActive = this.selectionState.isContextSelectionActive();
    const selectedIds = new Set(this.selectionState.getContextForThread(thread.id));
    const useSelection = isSelectionActive && selectedIds.size > 0;
    const selectedMessages = useSelection
      ? this.filterMessagesForContext(this.messageState.getMessagesInOrder(Array.from(selectedIds)))
      : this.messageState.getEffectiveHistory(thread.id);

    const historyTokens = this.messageState.calculateTotalTokens(selectedMessages);
    const systemTokens = thread.systemPrompt
      ? this.messageState.estimateTokens(thread.systemPrompt) * 2
      : 0;

    let turns = this.mapMessagesToTurns(selectedMessages);
    if (thread.systemPrompt && !turns.some((turn) => turn.role === 'system')) {
      const systemTurn: ChatTurn = { role: 'system', content: thread.systemPrompt };
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
        history: historyTokens,
        total: systemTokens + historyTokens
      }
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
      turns
    };
  }

  private filterMessagesForContext(messages: ChatMessage[]): ChatMessage[] {
    return messages
      .filter((message) => message.state !== 'failed')
      .filter((message) => message.role !== 'assistant' || message.state === 'complete');
  }

  private mapMessagesToTurns(messages: ChatMessage[]): ChatTurn[] {
    return messages
      .map((message) => ({
        role: message.role,
        content: message.rawMd ?? ''
      }))
      .filter((turn) => turn.content.trim().length > 0) as ChatTurn[];
  }
}
