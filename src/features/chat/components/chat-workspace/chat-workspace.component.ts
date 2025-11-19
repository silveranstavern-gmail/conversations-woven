import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChatMessage, ChatThread, Id } from '@models/chat';
import { MessageListComponent } from '../message-list/message-list.component';
import { ComposerComponent, ComposerSubmitPayload } from '../composer/composer.component';
import { ActiveChatService } from '../../data/active-chat.service';
import { ChatAdaptersService } from '../../data/chat-adapters.service';
import { ChatThreadsService } from '../../data/chat-threads.service';
import { SelectionStateService } from '../../data/selection-state.service';
import { DialogService } from '@core/services/dialog.service';

@Component({
  selector: 'app-chat-workspace',
  imports: [MessageListComponent, ComposerComponent],
  templateUrl: './chat-workspace.component.html',
  styleUrl: './chat-workspace.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatWorkspaceComponent {
  public readonly thread = input<ChatThread | undefined>();
  public readonly hasThreads = input<boolean>(false);

  private readonly activeChat = inject(ActiveChatService);
  private readonly adapters = inject(ChatAdaptersService);
  private readonly threads = inject(ChatThreadsService);
  private readonly selectionState = inject(SelectionStateService);
  private readonly dialogService = inject(DialogService);

  protected readonly messages = this.activeChat.messages;
  protected readonly activeMessageId = this.activeChat.activeMessageId;
  protected readonly isLoading = this.activeChat.isLoading;
  protected readonly isStreaming = this.activeChat.isStreaming;
  protected readonly models = this.adapters.models;
  protected readonly selectedMessageIds = this.activeChat.selectedMessageIds;
  protected readonly selectionCount = this.activeChat.selectionCount;
  protected readonly hasSelection = this.activeChat.hasSelection;
  protected readonly canCompactSelection = computed(
    () => this.selectionCount() >= 2 && !this.isLoading() && !this.isStreaming()
  );
  protected readonly preferredModelId = computed(() => {
    const currentThread = this.thread();
    if (!currentThread) {
      return null;
    }
    const available = this.models();
    // First check thread's preferred model
    const threadPreferred = currentThread.preferredModelId;
    if (threadPreferred && available.some((model) => model.id === threadPreferred)) {
      return threadPreferred;
    }
    // Then check for default model
    const defaultModel = this.adapters.defaultModel();
    if (defaultModel && available.some((model) => model.id === defaultModel.id)) {
      return defaultModel.id;
    }
    // Fallback to first available
    return available[0]?.id ?? null;
  });

  protected readonly headerSubtitle = computed(() => {
    const current = this.thread();
    if (!current) {
      return null;
    }
    return `${current.messageCount} message${current.messageCount === 1 ? '' : 's'} · Updated ${new Date(
      current.updatedAt
    ).toLocaleString()}`;
  });

  protected readonly composerDisabled = computed(
    () => !this.thread() || this.isLoading() || this.isStreaming() || !this.preferredModelId()
  );

  protected readonly isContextSelectionActive = this.selectionState.isContextSelectionActive.asReadonly();
  protected readonly currentThreadContextSet = computed(() => {
    const threadId = this.thread()?.id;
    if (!threadId) {
      return new Set<Id>();
    }
    return this.selectionState.getContextForThread(threadId);
  });

  protected handleDeleteMessage(messageId: Id): void {
    void this.activeChat.deleteMessage(messageId);
  }

  protected handleComposerSubmit(payload: ComposerSubmitPayload): void {
    void this.activeChat.sendUserMessage(payload.content, payload.modelId);
  }

  protected handleModelSelected(modelId: string): void {
    const current = this.thread();
    if (!current) {
      return;
    }
    void this.threads.setPreferredModel(current.id, modelId);
  }

  protected handleCopyMessage(messageId: Id): void {
    const message = this.messages().find((item) => item.id === messageId);
    if (message?.rawMd && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(message.rawMd).catch(() => {
        // noop fallback
      });
    }
  }

  protected handleBranchMessage(messageId: Id): void {
    void this.activeChat.branchFromMessage(messageId);
  }

  protected handleUpdateMessage(event: { id: Id; content: string }): void {
    void this.activeChat.editMessageContent(event.id, event.content);
  }

  protected handleSelectionChange(event: { id: Id; selected: boolean; range: boolean }): void {
    this.activeChat.setMessageSelection(event.id, {
      selected: event.selected,
      range: event.range
    });
  }

  protected handleClearSelection(): void {
    this.activeChat.clearSelection();
  }

  protected handleSelectAll(): void {
    this.activeChat.selectAllMessages();
  }

  protected handleDeleteSelected(): void {
    void this.activeChat.deleteSelectedMessages();
  }

  protected handleCompactSelection(): void {
    void this.activeChat.compactSelection();
  }

  protected handleRestoreCompaction(messageId: Id): void {
    void this.activeChat.uncompactMessage(messageId);
  }

  protected handleToggleContextSelection(): void {
    this.selectionState.toggleContextSelection(!this.isContextSelectionActive());
  }

  protected handleContextSelectionChange(event: { messageId: Id; included: boolean }): void {
    const threadId = this.thread()?.id;
    if (!threadId) {
      return;
    }
    this.selectionState.setContextForMessage(threadId, event.messageId, event.included);
  }

  protected handleCopySelection(): void {
    const ids = this.selectedMessageIds();
    if (!ids.length || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const idSet = new Set(ids);
    const ordered = this.messages().filter((message) => idSet.has(message.id));
    const markdown = this.formatMessagesMarkdown(ordered);
    if (!markdown.trim()) {
      return;
    }
    navigator.clipboard.writeText(markdown).catch(() => {});
  }

  protected handleExportThread(): void {
    const thread = this.thread();
    if (!thread) {
      return;
    }
    const messages = this.messages();
    if (!messages.length) {
      return;
    }
    const markdown = this.buildThreadDocument(thread, messages);
    this.downloadTextFile(markdown, `${this.buildFilename(thread.title)}.md`);
  }

  protected async handleOpenSettings(): Promise<void> {
    const thread = this.thread();
    if (!thread) {
      return;
    }
    const settings = await this.dialogService.threadSettings({
      systemPrompt: thread.systemPrompt,
      temperature: thread.temperature
    });
    if (settings !== null) {
      void this.threads.updateThreadSettings(thread.id, settings);
    }
  }

  protected async handleTitleClick(): Promise<void> {
    const thread = this.thread();
    if (!thread) {
      return;
    }
    const nextTitle = await this.dialogService.prompt({
      title: 'Edit title',
      message: 'Enter a new title for this conversation',
      initialValue: thread.title
    });
    if (!nextTitle || nextTitle.trim() === thread.title) {
      return;
    }
    void this.threads.renameThread(thread.id, nextTitle.trim());
  }

  private formatMessagesMarkdown(messages: ChatMessage[]): string {
    if (!messages.length) {
      return '';
    }
    return messages
      .map((message) => {
        const author =
          message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'You' : message.role;
        const timestamp = new Date(message.createdAt).toLocaleString();
        const body = (message.rawMd ?? '').trim();
        return `### ${author} · ${timestamp}\n\n${body}`;
      })
      .join('\n\n---\n\n');
  }

  private buildThreadDocument(thread: ChatThread, messages: ChatMessage[]): string {
    const header = `# ${thread.title}\n\nExported ${new Date().toLocaleString()}\n`;
    const body = this.formatMessagesMarkdown(messages);
    return body ? `${header}\n${body}` : header;
  }

  private downloadTextFile(content: string, filename: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private buildFilename(title: string): string {
    const safe = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '');
    const base = safe || 'chat-thread';
    return `${base}-${new Date().toISOString().replace(/[:]/g, '-')}`;
  }
}
