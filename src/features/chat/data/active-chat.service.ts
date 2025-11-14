import { computed, effect, inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import { ChatThreadsService } from './chat-threads.service';
import { MessageStateService } from './message-state.service';
import { SelectionStateService } from './selection-state.service';
import { MessageApiService } from './message-api.service';
import { ChatActionsService } from './chat-actions.service';

/**
 * @deprecated This service is now a facade delegating to specialized services.
 * Consider using MessageStateService, SelectionStateService, MessageApiService, and ChatActionsService directly.
 */
@Injectable({
  providedIn: 'root'
})
export class ActiveChatService {
  private readonly threads = inject(ChatThreadsService);
  private readonly messageState = inject(MessageStateService);
  private readonly selectionState = inject(SelectionStateService);
  private readonly messageApi = inject(MessageApiService);
  private readonly chatActions = inject(ChatActionsService);

  readonly messages = this.messageState.messages;
  readonly activeMessageId = this.messageState.activeMessageId;
  readonly isLoading = this.messageState.isLoading;
  readonly isStreaming = this.messageState.isStreaming;
  readonly hasMessages = this.messageState.hasMessages;
  readonly selectedMessageIds = this.selectionState.selectedMessageIds;
  readonly selectionCount = this.selectionState.selectionCount;
  readonly hasSelection = this.selectionState.hasSelection;

  constructor() {
    effect(() => {
      const threadId = this.threads.selectedThreadId();
      this.selectionState.resetSelection();
    });
  }

  async reloadActiveThread(): Promise<void> {
    await this.messageState.reloadActiveThread();
  }

  setMessageSelection(id: Id, options: { selected: boolean; range?: boolean } = { selected: true }): void {
    this.selectionState.setMessageSelection(id, options);
  }

  selectAllMessages(): void {
    this.selectionState.selectAllMessages();
  }

  clearSelection(): void {
    this.selectionState.clearSelection();
  }

  setActiveMessage(id: Id | null): void {
    this.messageState.setActiveMessage(id);
  }

  async upsertMessage(message: ChatMessage): Promise<void> {
    await this.messageState.upsertMessage(message);
    this.selectionState.syncSelectionWithMessages(this.messageState.messages());
  }

  async sendUserMessage(rawMd: string, modelId: string): Promise<void> {
    const threadId = this.threads.selectedThreadId();
    if (!threadId) {
      return;
    }
    await this.messageApi.sendUserMessage(rawMd, modelId, threadId);
  }

  async branchFromMessage(messageId: Id): Promise<void> {
    await this.chatActions.branchFromMessage(messageId);
  }

  async editMessageContent(messageId: Id, rawMd: string): Promise<void> {
    await this.chatActions.editMessageContent(messageId, rawMd);
  }

  async compactSelection(): Promise<void> {
    await this.chatActions.compactSelection();
  }

  async uncompactMessage(messageId: Id): Promise<void> {
    await this.chatActions.uncompactMessage(messageId);
  }

  async deleteSelectedMessages(): Promise<void> {
    await this.chatActions.deleteSelectedMessages();
  }

  async bulkReplaceMessages(threadId: Id, messages: ChatMessage[]): Promise<void> {
    await this.messageState.bulkReplaceMessages(threadId, messages);
    this.selectionState.syncSelectionWithMessages(this.messageState.messages());
  }

  async deleteMessage(id: Id): Promise<void> {
    await this.messageState.deleteMessage(id);
    this.selectionState.syncSelectionWithMessages(this.messageState.messages());
  }
}
