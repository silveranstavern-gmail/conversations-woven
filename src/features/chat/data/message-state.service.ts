import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { IdbService } from '@core/services/persistence/idb.service';
import { ChatThreadsService } from './chat-threads.service';

@Injectable({
  providedIn: 'root'
})
export class MessageStateService {
  private readonly idb = inject(IdbService);
  private readonly threads = inject(ChatThreadsService);

  private readonly messagesSignal = signal<ChatMessage[]>([]);
  private readonly activeMessageIdSignal = signal<Id | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly streamingMessageIdSignal = signal<Id | null>(null);

  readonly messages = this.messagesSignal.asReadonly();
  readonly activeMessageId = this.activeMessageIdSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly isStreaming = computed(() => this.streamingMessageIdSignal() !== null);
  readonly hasMessages = computed(() => this.messages().length > 0);

  constructor() {
    effect(() => {
      const threadId = this.threads.selectedThreadId();
      void this.loadMessagesForThread(threadId);
    });
  }

  async reloadActiveThread(): Promise<void> {
    await this.loadMessagesForThread(this.threads.selectedThreadId());
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
    await this.idb.putMessage(message);
    let nextMessages: ChatMessage[] = [];
    this.messagesSignal.update((current) => {
      const index = current.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        const clone = [...current];
        clone[index] = message;
        nextMessages = clone.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return nextMessages;
      }
      if (message.threadId !== this.threads.selectedThreadId()) {
        nextMessages = current;
        return nextMessages;
      }
      nextMessages = [...current, message].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      return nextMessages;
    });
    await this.syncThreadCount(message.threadId);
    this.activeMessageIdSignal.set(message.id);
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
    await this.idb.deleteMessage(id);
    let nextMessages: ChatMessage[] = [];
    this.messagesSignal.update((current) => {
      nextMessages = current.filter((message) => message.id !== id);
      return nextMessages;
    });
    if (existing) {
      if (existing.compactedFrom?.length) {
        await this.idb.deleteCompactionSnapshot(id);
      }
      await this.syncThreadCount(existing.threadId);
      if (this.activeMessageId() === id) {
        const fallback = this.messagesSignal();
        this.activeMessageIdSignal.set(fallback.length ? fallback[fallback.length - 1].id : null);
      }
    }
  }

  async bulkReplaceMessages(threadId: Id, messages: ChatMessage[]): Promise<void> {
    const ordered = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    await this.idb.deleteMessagesForThread(threadId);
    if (ordered.length) {
      await this.idb.bulkPutMessages(ordered);
    }
    if (threadId === this.threads.selectedThreadId()) {
      this.messagesSignal.set(ordered);
      this.activeMessageIdSignal.set(ordered.length ? ordered[ordered.length - 1].id : null);
    }
    await this.syncThreadCount(threadId);
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

  buildChatTurns(threadId: Id): Array<{ role: string; content: string }> {
    return this.messages()
      .filter((message) => message.threadId === threadId)
      .filter((message) => message.role !== 'assistant' || message.state === 'complete')
      .map((message) => ({
        role: message.role,
        content: message.rawMd ?? ''
      }))
      .filter((turn) => turn.content.trim().length > 0);
  }

  generateId(): Id {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef?.randomUUID) {
      return cryptoRef.randomUUID();
    }
    return `msg-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async loadMessagesForThread(threadId: Id | null): Promise<void> {
    if (!threadId) {
      this.messagesSignal.set([]);
      this.activeMessageIdSignal.set(null);
      return;
    }
    this.isLoadingSignal.set(true);
    try {
      const messages = await this.idb.listMessages(threadId);
      this.messagesSignal.set(messages);
      this.activeMessageIdSignal.set(messages.length ? messages[messages.length - 1].id : null);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  private async syncThreadCount(threadId: Id): Promise<void> {
    if (threadId === this.threads.selectedThreadId()) {
      await this.threads.setMessageCount(threadId, this.messagesSignal().length);
    } else {
      const messages = await this.idb.listMessages(threadId);
      await this.threads.setMessageCount(threadId, messages.length);
    }
  }
}

