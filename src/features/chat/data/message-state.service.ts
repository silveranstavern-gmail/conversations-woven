import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChatMessage, Id } from '@models/chat';
import { catchError, from, map, of } from 'rxjs';
import { ChatThreadsService } from './chat-threads.service';
import type { ChatTurn } from '../adapters/llm-adapter';
import { MessagePersistenceService } from './message-persistence.service';

@Injectable({
  providedIn: 'root'
})
export class MessageStateService {
  private readonly persistence = inject(MessagePersistenceService);
  private readonly threads = inject(ChatThreadsService);

  private readonly messagesResource = rxResource<ChatMessage[], Id | null>({
    params: () => this.threads.selectedThreadId(),
    stream: ({ params }) => {
      const threadId = params;
      if (!threadId) {
        return of([]);
      }
      return from(this.persistence.listMessages(threadId)).pipe(
        map((messages) => {
          const current = this.messagesResource.value();
          const merged = this.mergeMessages((current ?? []).filter(message => message.threadId === threadId), messages);
          return this.sortMessages(merged);
        }),
        catchError((error) => {
          console.error('Failed to load messages', error);
          return of<ChatMessage[]>([]);
        })
      );
    },
    defaultValue: []
  });
  private readonly activeMessageIdSignal = signal<Id | null>(null);
  private readonly streamingMessageIdSignal = signal<Id | null>(null);

  readonly messages = computed(() => this.messagesResource.value());
  readonly activeMessageId = this.activeMessageIdSignal.asReadonly();
  readonly isLoading = computed(() => {
    const status = this.messagesResource.status();
    return status === 'loading' || status === 'reloading';
  });
  readonly isStreaming = computed(() => this.streamingMessageIdSignal() !== null);
  readonly hasMessages = computed(() => this.messages().length > 0);

  constructor() {
    effect(() => {
      const threadId = this.threads.selectedThreadId();
      const messages = this.messages();
      const currentActive = this.activeMessageIdSignal();

      if (!threadId) {
        if (currentActive !== null) {
          this.activeMessageIdSignal.set(null);
        }
        return;
      }

      if (currentActive && messages.some((message) => message.id === currentActive)) {
        return;
      }

      const fallback = messages.length ? messages[messages.length - 1].id : null;
      if (fallback !== currentActive) {
        this.activeMessageIdSignal.set(fallback);
      }
    });
  }

  async reloadActiveThread(): Promise<void> {
    await this.messagesResource.reload();
  }

  async getMessagesForThread(threadId: Id): Promise<ChatMessage[]> {
    return this.persistence.listMessages(threadId);
  }

  setActiveMessage(id: Id | null): void {
    if (!id) {
      this.activeMessageIdSignal.set(null);
      return;
    }
    const exists = this.messages().some((message) => message.id === id);
    if (exists) {
      this.activeMessageIdSignal.set(id);
    }
  }

  async upsertMessage(message: ChatMessage): Promise<void> {
    await this.persistence.saveMessage(message);
    const status = this.messagesResource.status();
    if (status === 'loading' || status === 'reloading') {
      this.messagesResource.reload();
    }
    const selectedThreadId = this.threads.selectedThreadId();
    let nextMessages: ChatMessage[] = [];
    this.messagesResource.value.update((current) => {
      const safeCurrent = current ?? [];
      const index = safeCurrent.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        const clone = [...safeCurrent];
        clone[index] = message;
        nextMessages = this.sortMessages(clone);
        return nextMessages;
      }
      if (message.threadId !== selectedThreadId) {
        nextMessages = safeCurrent;
        return safeCurrent;
      }
      nextMessages = this.sortMessages([...safeCurrent, message]);
      return nextMessages;
    });
    await this.syncThreadCount(
      message.threadId,
      selectedThreadId === message.threadId ? nextMessages : undefined
    );
    if (message.threadId === selectedThreadId) {
      this.activeMessageIdSignal.set(message.id);
    }
  }

  /**
   * Updates the message signal immediately without writing to persistence.
   * Used for streaming updates to keep UI responsive.
   */
  updateMessageSignal(id: Id, patch: Partial<ChatMessage>): ChatMessage | null {
    const existing = this.messages().find((message) => message.id === id);
    if (!existing) {
      return null;
    }
    const next: ChatMessage = {
      ...existing,
      ...patch,
      revision: existing.revision + 1
    };
    this.messagesResource.value.update((current) => {
      const safeCurrent = current ?? [];
      const index = safeCurrent.findIndex((item) => item.id === id);
      if (index >= 0) {
        const clone = [...safeCurrent];
        clone[index] = next;
        return clone;
      }
      return safeCurrent;
    });
    return next;
  }

  replaceMessageSignal(message: ChatMessage): ChatMessage | null {
    if (message.threadId !== this.threads.selectedThreadId()) return null;
    const exists = this.messages().some((item) => item.id === message.id);
    if (!exists) {
      return null;
    }
    this.messagesResource.value.update((current) => {
      const safeCurrent = current ?? [];
      const index = safeCurrent.findIndex((item) => item.id === message.id);
      if (index < 0) {
        return safeCurrent;
      }
      const clone = [...safeCurrent];
      clone[index] = message;
      return clone;
    });
    return message;
  }

  async updateMessage(id: Id, patch: Partial<ChatMessage>): Promise<ChatMessage | null> {
    const existing = this.messages().find((message) => message.id === id);
    if (!existing) {
      return null;
    }
    const next: ChatMessage = {
      ...existing,
      ...patch,
      revision: existing.revision + 1
    };
    await this.upsertMessage(next);
    return next;
  }

  async deleteMessage(id: Id): Promise<void> {
    const existing = this.messages().find((message) => message.id === id);
    await this.persistence.deleteMessage(id);
    let nextMessages: ChatMessage[] = [];
    this.messagesResource.value.update((current) => {
      const safeCurrent = current ?? [];
      nextMessages = safeCurrent.filter((message) => message.id !== id);
      return nextMessages;
    });
    if (existing) {
      if (existing.compactedFrom?.length) {
        await this.persistence.deleteCompactionSnapshot(id);
      }
      await this.syncThreadCount(
        existing.threadId,
        existing.threadId === this.threads.selectedThreadId() ? nextMessages : undefined
      );
      if (this.activeMessageId() === id) {
        const fallback = nextMessages;
        this.activeMessageIdSignal.set(fallback.length ? fallback[fallback.length - 1].id : null);
      }
    }
  }

  async bulkReplaceMessages(threadId: Id, messages: ChatMessage[]): Promise<void> {
    const ordered = this.sortMessages(messages);
    await this.persistence.replaceThreadMessages(threadId, ordered);
    if (threadId === this.threads.selectedThreadId()) {
      this.messagesResource.value.set(ordered);
      this.activeMessageIdSignal.set(ordered.length ? ordered[ordered.length - 1].id : null);
    }
    await this.syncThreadCount(threadId, threadId === this.threads.selectedThreadId() ? ordered : undefined);
  }

  setStreamingMessageId(id: Id | null): void {
    this.streamingMessageIdSignal.set(id);
  }

  getMessageById(id: Id): ChatMessage | undefined {
    return this.messages().find((message) => message.id === id);
  }

  getMessagesInOrder(ids: Id[]): ChatMessage[] {
    const lookup = new Set(ids);
    return this.messages().filter((message) => lookup.has(message.id));
  }

  // Helper to get messages that would be sent to the LLM (filters out failed/incomplete, but NO pruning)
  getEffectiveHistory(threadId: Id): ChatMessage[] {
    const sortedMessages = this.sortMessages(
      this.messages().filter((message) => message.threadId === threadId)
    );
    return sortedMessages
      .filter((message) => message.state !== 'failed')
      .filter((message) => message.role !== 'assistant' || message.state === 'complete');
  }

  buildChatTurns(threadId: Id): ChatTurn[] {
    const chatMessages = this.getEffectiveHistory(threadId);
    
    // Removed: pruneMessagesForContext call
    
    return chatMessages
      .map((message) => ({
        role: message.role,
        content: message.rawMd ?? ''
      }))
      .filter((turn) => turn.content.trim().length > 0) as ChatTurn[];
  }

  buildChatTurnsFromIds(ids: Id[]): ChatTurn[] {
    // Get all messages for the current thread
    const threadId = this.threads.selectedThreadId();
    if (!threadId) {
      return [];
    }

    // Filter to only include messages whose IDs are in the provided set
    const idSet = new Set(ids);
    const filteredMessages = this.messages()
      .filter((message) => message.threadId === threadId && idSet.has(message.id))
      .filter((message) => message.state !== 'failed')
      .filter((message) => message.role !== 'assistant' || message.state === 'complete');

    // Sort by createdAt timestamp
    const sorted = filteredMessages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Map to ChatTurn format
    return sorted
      .map((message) => ({
        role: message.role,
        content: message.rawMd ?? ''
      }))
      .filter((turn) => turn.content.trim().length > 0) as ChatTurn[];
  }

  generateId(): Id {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef?.randomUUID) {
      return cryptoRef.randomUUID();
    }
    return `msg-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async syncThreadCount(threadId: Id, knownMessages?: ChatMessage[]): Promise<void> {
    if (threadId === this.threads.selectedThreadId() && knownMessages) {
      await this.threads.setMessageCount(threadId, knownMessages.length);
      return;
    }
    const messages = await this.persistence.listMessages(threadId);
    await this.threads.setMessageCount(threadId, messages.length);
  }

  private sortMessages(messages: ChatMessage[]): ChatMessage[] {
    return [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  private mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    const merged = new Map<Id, ChatMessage>();
    for (const message of existing) {
      merged.set(message.id, message);
    }
    for (const message of incoming) {
      const current = merged.get(message.id);
      if (!current) {
        merged.set(message.id, message);
        continue;
      }
      const currentRevision = current.revision ?? 0;
      const nextRevision = message.revision ?? 0;
      merged.set(message.id, nextRevision >= currentRevision ? message : current);
    }
    return Array.from(merged.values());
  }

  // Public helper for token estimation
  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  estimateMessageTokens(message: ChatMessage): number {
    return this.estimateTokens(message.rawMd ?? '');
  }

  calculateTotalTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => total + this.estimateMessageTokens(msg), 0);
  }
}
