import { inject, Injectable } from '@angular/core';

import type { ChatMessage, Id } from '@models/chat';

import { CompactionSnapshot } from '@core/services/persistence/idb.service';
import { MessagePersistenceService } from './message-persistence.service';

import { SummarizerService } from '@core/services/summarizer.service';

import { DialogService } from '@core/services/dialog.service';

import { LoadingOverlayService } from '@core/services/loading-overlay.service';

import { ChatThreadsService } from './chat-threads.service';

import { MessageStateService } from './message-state.service';

import { SelectionStateService } from './selection-state.service';

@Injectable({
  providedIn: 'root'
})
export class ChatActionsService {
  private readonly persistence = inject(MessagePersistenceService);
  private readonly threads = inject(ChatThreadsService);
  private readonly summarizer = inject(SummarizerService);
  private readonly messageState = inject(MessageStateService);
  private readonly selectionState = inject(SelectionStateService);
  private readonly dialog = inject(DialogService);
  private readonly loadingOverlay = inject(LoadingOverlayService);

  async branchFromMessage(messageId: Id): Promise<Id | undefined> {
    if (this.messageState.isStreaming()) return;
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
      tags: thread.tags,
      folderId: thread.folderId,
      systemPrompt: thread.systemPrompt,
      temperature: thread.temperature,
      maxOutputTokens: thread.maxOutputTokens,
      reasoningConfig: thread.reasoningConfig
    });
    const clonedMessages = this.cloneMessagesForThread(newThread.id, branchSource);
    await this.messageState.bulkReplaceMessages(newThread.id, clonedMessages);
    return newThread.id;
  }

  async editMessageContent(messageId: Id, rawMd: string): Promise<boolean> {
    if (this.messageState.isStreaming()) return false;
    const nextContent = rawMd.trim();
    if (!nextContent) {
      return false;
    }
    const target = this.messageState.getMessageById(messageId);
    if (!target) {
      return false;
    }
    if (target.state === 'streaming' || target.state === 'sending') {
      return false;
    }
    if (target.rawMd === nextContent && target.state === 'complete') return true;
    await this.messageState.updateMessage(messageId, {
      rawMd: nextContent,
      renderedMd: undefined,
      reasoning: undefined,
      tokensIn: undefined,
      tokensOut: undefined,
      finishReason: undefined,
      error: undefined,
      state: 'complete'
    });
    await this.threads.touchThread(target.threadId);
    return true;
  }

  async compactSelection(): Promise<void> {
    const threadId = this.threads.selectedThreadId();
    const selection = this.selectionState.selectedMessageIds();
    
    if (!threadId) {
      console.warn('[ChatActions] Compaction aborted: No active thread selected.');
      return;
    }
    
    if (selection.length < 2) {
      console.warn('[ChatActions] Compaction aborted: Fewer than 2 messages selected.');
      return;
    }
    
    const ordered = this.messageState.getMessagesInOrder(selection);
    
    if (ordered.length !== selection.length) {
      console.warn('[ChatActions] Compaction aborted: Selection mismatch (phantom IDs detected).');
      // Attempt to repair state
      this.selectionState.syncSelectionWithMessages(this.messageState.messages());
      return;
    }

    if (!this.isSelectionContiguous(ordered)) {
      console.warn('[ChatActions] Compaction aborted: Selection is not contiguous.');
      await this.dialog.alert({
        title: 'Cannot Compact',
        message: 'Please select a continuous range of messages to compact. You cannot skip messages in the middle.'
      });
      return;
    }
    
    const hasIncomplete = ordered.some((message) => message.state !== 'complete');
    if (hasIncomplete) {
      console.warn('[ChatActions] Compaction aborted: Selection contains incomplete/failed messages.');
      await this.dialog.alert({
        title: 'Cannot Compact',
        message: 'Some selected messages are not in a "complete" state (e.g. they are still sending, streaming, or have failed).'
      });
      return;
    }
    
    const includesCompacted = ordered.some((message) => message.compactedFrom?.length);
    if (includesCompacted) {
      console.warn('[ChatActions] Compaction aborted: Selection includes existing compactions.');
      await this.dialog.alert({
        title: 'Cannot Compact',
        message: 'Your selection includes a message that is already compacted. Please restore it before compacting again.'
      });
      return;
    }

    console.log(`[ChatActions] Starting compaction for ${ordered.length} messages...`);
    
    // Show loading overlay
    this.loadingOverlay.show('Compacting');
    
    try {
      const summary = await this.summarizer.summarize(ordered);
      console.log('[ChatActions] Summary generated, applying changes...');

      const compacted = this.buildCompactedMessage(threadId, ordered, summary);
      const nextMessages = this.composeMessagesWithCompaction(ordered, compacted);
      const snapshot: CompactionSnapshot = {
        threadId,
        messageIds: ordered.map((message) => message.id),
        messages: ordered.map((message) => this.cloneForSnapshot(message)),
        createdAt: new Date().toISOString()
      };
      
      await this.messageState.bulkReplaceMessages(threadId, nextMessages);
      await this.persistence.saveCompactionSnapshot(compacted.id, snapshot);
      await this.threads.touchThread(threadId);
      this.selectionState.setSelectedIds([compacted.id]);
      
      console.log('[ChatActions] Compaction complete.');
    } catch (error) {
      console.error('[ChatActions] Compaction failed unexpectedly:', error);
      await this.dialog.alert({
        title: 'Compaction Error',
        message: 'An unexpected error occurred while compacting messages.'
      });
    } finally {
      // Hide loading overlay on both success and failure
      this.loadingOverlay.hide();
    }
  }

  async uncompactMessage(messageId: Id): Promise<void> {
    const placeholder = this.messageState.getMessageById(messageId);
    if (!placeholder?.compactedFrom?.length) {
      return;
    }
    const snapshot = await this.persistence.loadCompactionSnapshot(messageId);
    if (!snapshot) {
      console.warn(`[ChatActions] Restore failed: No snapshot found for message ${messageId}`);
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
    await this.persistence.deleteCompactionSnapshot(messageId);
    const restoredIds = restored.map((message) => message.id);
    this.selectionState.setSelectedIds(restoredIds);
  }

  async deleteSelectedMessages(): Promise<void> {
    if (this.messageState.isStreaming()) return;
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
        compactedSummary: undefined
      };
    });
  }

  private cloneForSnapshot(message: ChatMessage): ChatMessage {
    return {
      ...message,
      compactedFrom: message.compactedFrom?.slice()
    };
  }
}

