import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { CompactionSnapshot, IdbService } from '@core/services/persistence/idb.service';
import { SummarizerService } from '@core/services/summarizer.service';
import { ChatThreadsService } from './chat-threads.service';
import { ChatAdaptersService } from './chat-adapters.service';
import { ChatTurn } from '../adapters/llm-adapter';

@Injectable({
  providedIn: 'root'
})
export class ActiveChatService {
  private readonly idb = inject(IdbService);
  private readonly threads = inject(ChatThreadsService);
  private readonly adapters = inject(ChatAdaptersService);
  private readonly summarizer = inject(SummarizerService);

  private readonly messagesSignal = signal<ChatMessage[]>([]);
  private readonly activeMessageIdSignal = signal<Id | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly streamingMessageIdSignal = signal<Id | null>(null);
  private readonly selectedMessageIdsSignal = signal<Id[]>([]);
  private readonly selectionAnchorIdSignal = signal<Id | null>(null);

  readonly messages = this.messagesSignal.asReadonly();
  readonly activeMessageId = this.activeMessageIdSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly isStreaming = computed(() => this.streamingMessageIdSignal() !== null);
  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly selectedMessageIds = this.selectedMessageIdsSignal.asReadonly();
  readonly selectionCount = computed(() => this.selectedMessageIdsSignal().length);
  readonly hasSelection = computed(() => this.selectionCount() > 0);

  constructor() {
    effect(() => {
      const threadId = this.threads.selectedThreadId();
      this.resetSelection();
      void this.loadMessagesForThread(threadId);
    });
  }

  async reloadActiveThread(): Promise<void> {
    await this.loadMessagesForThread(this.threads.selectedThreadId());
  }

  setMessageSelection(id: Id, options: { selected: boolean; range?: boolean } = { selected: true }): void {
    const existing = this.messages().some((message) => message.id === id);
    if (!existing) {
      return;
    }
    const shouldUseRange = Boolean(options.range && this.selectionAnchorIdSignal());
    if (shouldUseRange) {
      this.applyRangeSelection(this.selectionAnchorIdSignal()!, id, options.selected);
    } else {
      this.applySingleSelection(id, options.selected);
    }
    this.selectionAnchorIdSignal.set(id);
  }

  selectAllMessages(): void {
    const ids = this.messages().map((message) => message.id);
    this.selectedMessageIdsSignal.set(ids);
    this.selectionAnchorIdSignal.set(ids.length ? ids[ids.length - 1] : null);
  }

  clearSelection(): void {
    this.resetSelection();
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
    this.syncSelectionWithMessages(nextMessages);
    await this.syncThreadCount(message.threadId);
    this.activeMessageIdSignal.set(message.id);
  }

  async sendUserMessage(rawMd: string, modelId: string): Promise<void> {
    if (this.isStreaming()) {
      return;
    }
    const threadId = this.threads.selectedThreadId();
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
      id: this.generateId(),
      threadId,
      role: 'user',
      createdAt: now.toISOString(),
      revision: 1,
      rawMd: content,
      state: 'complete'
    };
    await this.upsertMessage(userMessage);

    const assistantMessage: ChatMessage = {
      id: this.generateId(),
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
    await this.upsertMessage(assistantMessage);
    this.streamingMessageIdSignal.set(assistantMessage.id);

    try {
      const turns = this.buildChatTurns(threadId);
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

        const updated = await this.updateMessage(assistantMessage.id, patch);
        if (updated) {
          workingAssistant = updated;
        }
      }

      if (!hasContent) {
        await this.updateMessage(assistantMessage.id, { state: 'complete' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to stream response';
      await this.updateMessage(assistantMessage.id, { state: 'failed', error: message });
    } finally {
      this.streamingMessageIdSignal.set(null);
    }
  }

  async branchFromMessage(messageId: Id): Promise<void> {
    const thread = this.threads.activeThread();
    if (!thread) {
      return;
    }
    const messages = this.messages();
    const index = messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return;
    }
    const branchSource = messages.slice(0, index + 1);
    const branchTitle = `${thread.title} (branch)`;
    const newThread = await this.threads.createThread({
      title: branchTitle,
      preferredModelId: thread.preferredModelId,
      tags: thread.tags
    });
    const clonedMessages = this.cloneMessagesForThread(newThread.id, branchSource);
    await this.bulkReplaceMessages(newThread.id, clonedMessages);
    await this.threads.setMessageCount(newThread.id, clonedMessages.length);
  }

  async editMessageContent(messageId: Id, rawMd: string): Promise<void> {
    const nextContent = rawMd.trim();
    if (!nextContent) {
      return;
    }
    const target = this.messages().find((message) => message.id === messageId);
    if (!target) {
      return;
    }
    if (target.state === 'streaming' || target.state === 'sending') {
      return;
    }
    await this.updateMessage(messageId, {
      rawMd: nextContent,
      error: undefined,
      state: target.state === 'failed' ? 'complete' : target.state
    });
    await this.threads.touchThread(target.threadId);
  }

  async compactSelection(): Promise<void> {
    const threadId = this.threads.selectedThreadId();
    const selection = this.selectedMessageIdsSignal();
    if (!threadId || selection.length < 2) {
      return;
    }
    const ordered = this.getMessagesInOrder(selection);
    if (ordered.length !== selection.length || !this.isSelectionContiguous(ordered)) {
      return;
    }
    const hasIncomplete = ordered.some((message) => message.state !== 'complete');
    if (hasIncomplete) {
      return;
    }
    const includesCompacted = ordered.some((message) => message.compactedFrom?.length);
    if (includesCompacted) {
      return;
    }
    const summary = await this.summarizer.summarize(ordered);
    const compacted = this.buildCompactedMessage(threadId, ordered, summary);
    const nextMessages = this.composeMessagesWithCompaction(ordered, compacted);
    const snapshot: CompactionSnapshot = {
      threadId,
      messageIds: ordered.map((message) => message.id),
      messages: ordered.map((message) => this.cloneForSnapshot(message)),
      createdAt: new Date().toISOString()
    };
    await this.bulkReplaceMessages(threadId, nextMessages);
    await this.idb.saveCompactionSnapshot(compacted.id, snapshot);
    await this.threads.touchThread(threadId);
    this.selectedMessageIdsSignal.set([compacted.id]);
    this.selectionAnchorIdSignal.set(compacted.id);
  }

  async uncompactMessage(messageId: Id): Promise<void> {
    const placeholder = this.messages().find((message) => message.id === messageId);
    if (!placeholder?.compactedFrom?.length) {
      return;
    }
    const snapshot = await this.idb.loadCompactionSnapshot(messageId);
    if (!snapshot) {
      return;
    }
    const threadId = placeholder.threadId;
    const messages = this.messages();
    const index = messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return;
    }
    const restored = snapshot.messages.map((message) => ({
      ...message,
      threadId
    }));
    const nextMessages = [
      ...messages.slice(0, index),
      ...restored,
      ...messages.slice(index + 1)
    ];
    await this.bulkReplaceMessages(threadId, nextMessages);
    await this.idb.deleteCompactionSnapshot(messageId);
    const restoredIds = restored.map((message) => message.id);
    this.selectedMessageIdsSignal.set(restoredIds);
    this.selectionAnchorIdSignal.set(restoredIds.length ? restoredIds[restoredIds.length - 1] : null);
  }

  async deleteSelectedMessages(): Promise<void> {
    const ids = [...this.selectedMessageIdsSignal()];
    if (!ids.length) {
      return;
    }
    for (const id of ids) {
      await this.deleteMessage(id);
    }
    this.resetSelection();
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
      this.syncSelectionWithMessages(ordered);
    }
    await this.syncThreadCount(threadId);
  }

  async deleteMessage(id: Id): Promise<void> {
    const existing = this.messages().find((message) => message.id === id);
    await this.idb.deleteMessage(id);
    let nextMessages: ChatMessage[] = [];
    this.messagesSignal.update((current) => {
      nextMessages = current.filter((message) => message.id !== id);
      return nextMessages;
    });
    this.syncSelectionWithMessages(nextMessages);
    this.selectedMessageIdsSignal.update((current) => current.filter((value) => value !== id));
    if (this.selectionAnchorIdSignal() === id) {
      this.selectionAnchorIdSignal.set(
        this.selectedMessageIdsSignal().length
          ? this.selectedMessageIdsSignal()[this.selectedMessageIdsSignal().length - 1]
          : null
      );
    }
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

  private async loadMessagesForThread(threadId: Id | null): Promise<void> {
    if (!threadId) {
      this.messagesSignal.set([]);
      this.activeMessageIdSignal.set(null);
      this.syncSelectionWithMessages([]);
      return;
    }
    this.isLoadingSignal.set(true);
    try {
      const messages = await this.idb.listMessages(threadId);
      this.messagesSignal.set(messages);
      this.activeMessageIdSignal.set(messages.length ? messages[messages.length - 1].id : null);
      this.syncSelectionWithMessages(messages);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  private generateId(): Id {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef?.randomUUID) {
      return cryptoRef.randomUUID();
    }
    return `msg-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async syncThreadCount(threadId: Id): Promise<void> {
    if (threadId === this.threads.selectedThreadId()) {
      await this.threads.setMessageCount(threadId, this.messagesSignal().length);
    } else {
      const messages = await this.idb.listMessages(threadId);
      await this.threads.setMessageCount(threadId, messages.length);
    }
  }

  private resetSelection(): void {
    this.selectedMessageIdsSignal.set([]);
    this.selectionAnchorIdSignal.set(null);
  }

  private applySingleSelection(id: Id, selected: boolean): void {
    if (selected) {
      const current = new Set(this.selectedMessageIdsSignal());
      current.add(id);
      this.selectedMessageIdsSignal.set(this.orderIdsByMessageSequence([...current]));
      return;
    }
    this.selectedMessageIdsSignal.update((current) => current.filter((value) => value !== id));
  }

  private applyRangeSelection(anchorId: Id, targetId: Id, selected: boolean): void {
    const ids = this.idsBetween(anchorId, targetId);
    if (!ids.length) {
      this.applySingleSelection(targetId, selected);
      return;
    }
    if (selected) {
      const next = new Set(this.selectedMessageIdsSignal());
      ids.forEach((id) => next.add(id));
      this.selectedMessageIdsSignal.set(this.orderIdsByMessageSequence([...next]));
      return;
    }
    this.selectedMessageIdsSignal.update((current) => current.filter((value) => !ids.includes(value)));
  }

  private idsBetween(a: Id, b: Id): Id[] {
    const messages = this.messages();
    const start = messages.findIndex((message) => message.id === a);
    const end = messages.findIndex((message) => message.id === b);
    if (start === -1 || end === -1) {
      return [];
    }
    const [min, max] = start < end ? [start, end] : [end, start];
    return messages.slice(min, max + 1).map((message) => message.id);
  }

  private orderIdsByMessageSequence(ids: Id[]): Id[] {
    const orderMap = new Set(ids);
    return this.messages()
      .map((message) => message.id)
      .filter((id) => orderMap.has(id));
  }

  private getMessagesInOrder(ids: Id[]): ChatMessage[] {
    const lookup = new Set(ids);
    return this.messages().filter((message) => lookup.has(message.id));
  }

  private isSelectionContiguous(selected: ChatMessage[]): boolean {
    if (selected.length <= 1) {
      return true;
    }
    const order = this.messages().map((message) => message.id);
    const positions = selected.map((message) => order.indexOf(message.id));
    if (positions.some((index) => index === -1)) {
      return false;
    }
    positions.sort((a, b) => a - b);
    const start = positions[0];
    return positions.every((value, idx) => value === start + idx);
  }

  private composeMessagesWithCompaction(selected: ChatMessage[], placeholder: ChatMessage): ChatMessage[] {
    if (!selected.length) {
      return this.messages();
    }
    const messages = this.messages();
    const startIdx = messages.findIndex((message) => message.id === selected[0].id);
    if (startIdx === -1) {
      return messages;
    }
    const endIdx = startIdx + selected.length;
    return [...messages.slice(0, startIdx), placeholder, ...messages.slice(endIdx)];
  }

  private buildCompactedMessage(
    threadId: Id,
    selected: ChatMessage[],
    summary: string
  ): ChatMessage {
    const first = selected[0];
    return {
      id: this.generateId(),
      threadId,
      role: 'system',
      parentId: first.parentId,
      createdAt: first.createdAt,
      revision: 1,
      rawMd: summary,
      compactedFrom: selected.map((message) => message.id),
      compactedSummary: summary,
      state: 'complete',
      model: 'compactor'
    };
  }

  private cloneMessagesForThread(targetThreadId: Id, source: ChatMessage[]): ChatMessage[] {
    const idMap = new Map<Id, Id>();
    return source.map((message) => {
      const newId = this.generateId();
      idMap.set(message.id, newId);
      return {
        ...message,
        id: newId,
        threadId: targetThreadId,
        parentId: message.parentId ? idMap.get(message.parentId) ?? undefined : undefined,
        revision: 1,
        compactedFrom: undefined,
        compactedSummary: undefined,
        attachments: message.attachments?.map((attachment) => ({ ...attachment }))
      };
    });
  }

  private cloneForSnapshot(message: ChatMessage): ChatMessage {
    return {
      ...message,
      compactedFrom: message.compactedFrom?.slice(),
      attachments: message.attachments?.map((attachment) => ({ ...attachment }))
    };
  }

  private syncSelectionWithMessages(messages: ChatMessage[]): void {
    const validIds = new Set(messages.map((message) => message.id));
    const filtered = this.selectedMessageIdsSignal().filter((id) => validIds.has(id));
    if (filtered.length !== this.selectedMessageIdsSignal().length) {
      this.selectedMessageIdsSignal.set(filtered);
      this.selectionAnchorIdSignal.set(filtered.length ? filtered[filtered.length - 1] : null);
    }
  }

  private async updateMessage(id: Id, patch: Partial<ChatMessage>): Promise<ChatMessage | null> {
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

  private buildChatTurns(threadId: Id): ChatTurn[] {
    return this.messages()
      .filter((message) => message.threadId === threadId)
      .filter((message) => message.role !== 'assistant' || message.state === 'complete')
      .map((message) => ({
        role: message.role,
        content: message.rawMd ?? ''
      }))
      .filter((turn) => turn.content.trim().length > 0);
  }
}
