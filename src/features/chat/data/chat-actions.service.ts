import { inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { CompactionSnapshot, IdbService } from '@core/services/persistence/idb.service';
import { SummarizerService } from '@core/services/summarizer.service';
import { ChatThreadsService } from './chat-threads.service';
import { MessageStateService } from './message-state.service';
import { SelectionStateService } from './selection-state.service';

@Injectable({
  providedIn: 'root'
})
export class ChatActionsService {
  private readonly idb = inject(IdbService);
  private readonly threads = inject(ChatThreadsService);
  private readonly summarizer = inject(SummarizerService);
  private readonly messageState = inject(MessageStateService);
  private readonly selectionState = inject(SelectionStateService);

  async branchFromMessage(messageId: Id): Promise<void> {
    const thread = this.threads.activeThread();
    if (!thread) {
      return;
    }
    const messages = this.messageState.messages();
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
    await this.messageState.bulkReplaceMessages(newThread.id, clonedMessages);
    await this.threads.setMessageCount(newThread.id, clonedMessages.length);
  }

  async editMessageContent(messageId: Id, rawMd: string): Promise<void> {
    const nextContent = rawMd.trim();
    if (!nextContent) {
      return;
    }
    const target = this.messageState.getMessageById(messageId);
    if (!target) {
      return;
    }
    if (target.state === 'streaming' || target.state === 'sending') {
      return;
    }
    await this.messageState.updateMessage(messageId, {
      rawMd: nextContent,
      error: undefined,
      state: target.state === 'failed' ? 'complete' : target.state
    });
    await this.threads.touchThread(target.threadId);
  }

  async compactSelection(): Promise<void> {
    const threadId = this.threads.selectedThreadId();
    const selection = this.selectionState.selectedMessageIds();
    if (!threadId || selection.length < 2) {
      return;
    }
    const ordered = this.messageState.getMessagesInOrder(selection);
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
    await this.messageState.bulkReplaceMessages(threadId, nextMessages);
    await this.idb.saveCompactionSnapshot(compacted.id, snapshot);
    await this.threads.touchThread(threadId);
    this.selectionState.setSelectedIds([compacted.id]);
  }

  async uncompactMessage(messageId: Id): Promise<void> {
    const placeholder = this.messageState.getMessageById(messageId);
    if (!placeholder?.compactedFrom?.length) {
      return;
    }
    const snapshot = await this.idb.loadCompactionSnapshot(messageId);
    if (!snapshot) {
      return;
    }
    const threadId = placeholder.threadId;
    const messages = this.messageState.messages();
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
    await this.messageState.bulkReplaceMessages(threadId, nextMessages);
    await this.idb.deleteCompactionSnapshot(messageId);
    const restoredIds = restored.map((message) => message.id);
    this.selectionState.setSelectedIds(restoredIds);
  }

  async deleteSelectedMessages(): Promise<void> {
    const ids = [...this.selectionState.selectedMessageIds()];
    if (!ids.length) {
      return;
    }
    for (const id of ids) {
      await this.messageState.deleteMessage(id);
    }
    this.selectionState.resetSelection();
  }

  private isSelectionContiguous(selected: ChatMessage[]): boolean {
    if (selected.length <= 1) {
      return true;
    }
    const order = this.messageState.messages().map((message) => message.id);
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
      return this.messageState.messages();
    }
    const messages = this.messageState.messages();
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
      id: this.messageState.generateId(),
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
      const newId = this.messageState.generateId();
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
}

