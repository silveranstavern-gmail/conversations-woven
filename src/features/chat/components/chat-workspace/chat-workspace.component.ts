import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ChatMessage, ChatThread, Id } from '@models/chat';
import { MessageListComponent } from '../message-list/message-list.component';
import { ComposerComponent, ComposerSubmitPayload } from '../composer/composer.component';
import { MessageStateService } from '../../data/message-state.service';
import { SelectionStateService } from '../../data/selection-state.service';
import { MessageApiService } from '../../data/message-api.service';
import { ChatActionsService } from '../../data/chat-actions.service';
import { ChatAdaptersService } from '../../data/chat-adapters.service';
import { ContextEngineService } from '../../data/context-engine.service';
import { ChatThreadsService } from '../../data/chat-threads.service';
import { KeychainService } from '@core/services/keychain.service';
import { DialogService } from '@core/services/dialog.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { formatMessagesMarkdown, buildThreadDocument } from '../../utils/markdown-export';

@Component({
  selector: 'app-chat-workspace',
  imports: [MessageListComponent, ComposerComponent, ButtonDirective, TooltipDirective, ChatHeaderComponent],
  templateUrl: './chat-workspace.component.html',
  styleUrl: './chat-workspace.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatWorkspaceComponent {
  private static readonly EMPTY_COMPOSER_DRAFT_KEY = '__empty__';
  private readonly scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  private readonly composerDrafts = signal<Record<string, string>>({});
  private readonly isSubmittingComposer = signal(false);

  public readonly thread = input<ChatThread | undefined>();
  public readonly hasThreads = input<boolean>(false);

  private readonly messageState = inject(MessageStateService);
  private readonly selectionState = inject(SelectionStateService);
  private readonly messageApi = inject(MessageApiService);
  private readonly chatActions = inject(ChatActionsService);
  private readonly adapters = inject(ChatAdaptersService);
  private readonly contextEngine = inject(ContextEngineService);
  private readonly threads = inject(ChatThreadsService);
  private readonly keychain = inject(KeychainService);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly isUnlocked = this.keychain.isUnlocked;
  protected readonly storedProviders = this.keychain.storedProviders;

  protected readonly copyStatus = signal('');
  protected readonly messages = this.messageState.messages;
  protected readonly activeMessageId = this.messageState.activeMessageId;
  protected readonly isLoading = this.messageState.isLoading;
  protected readonly isStreaming = this.messageState.isStreaming;
  protected readonly selectedMessageIds = this.selectionState.selectedMessageIds;
  protected readonly selectionCount = this.selectionState.selectionCount;
  protected readonly hasSelection = this.selectionState.hasSelection;
  protected readonly canCompactSelection = computed(
    () => this.selectionCount() >= 2 && !this.isLoading() && !this.isStreaming()
  );
  protected readonly promptContext = computed(() => this.contextEngine.buildContext(this.thread() ?? null));
  protected readonly visibleMessagesBelongToCurrentThread = computed(() => {
    const currentThread = this.thread();
    if (!currentThread) {
      return false;
    }
    return this.messages().some((message) => message.threadId === currentThread.id);
  });
  protected readonly modelSelection = computed(() => {
    const currentThread = this.thread();
    if (!currentThread) {
      return this.adapters.resolveModelSelection(null);
    }
    return this.adapters.resolveModelSelection(currentThread.preferredModelId ?? null);
  });
  protected readonly preferredModelId = computed(() => {
    return this.modelSelection().modelId;
  });

  private readonly pendingEmptyStateModelId = signal<string | null>(null);

  protected readonly composerModelId = computed(() => {
    const current = this.thread();
    if (current) {
      return this.preferredModelId();
    }
    return this.pendingEmptyStateModelId() ?? this.preferredModelId();
  });

  protected readonly composerContextUsage = computed(() => {
    const current = this.thread();
    if (!current) {
      return 0;
    }
    return this.currentContextTokens();
  });

  protected readonly emptyStateComposerDisabled = computed(
    () => this.isSubmittingComposer() || this.isStreaming() || !this.modelSelection().model
  );

  protected readonly currentModelLimit = computed<number | null>(() => {
    const id = this.composerModelId();
    const model = id ? this.adapters.getModelById(id) : null;
    return typeof model?.contextLength === 'number' && model.contextLength > 0
      ? model.contextLength
      : null;
  });
  protected readonly currentThreadMessageCount = computed(() => {
    const current = this.thread();
    if (!current) {
      return 0;
    }
    return this.messages().filter((message) => message.threadId === current.id).length;
  });
  protected readonly contextIncludedCount = computed(() => {
    const current = this.thread();
    if (!current) {
      return 0;
    }
    return this.promptContext().messages.length;
  });
  protected readonly contextModeLabel = computed(() => {
    if (!this.thread()) {
      return 'Full history';
    }
    if (!this.isContextSelectionActive()) {
      return 'Full history';
    }
    return `Curated ${this.contextIncludedCount()}/${this.currentThreadMessageCount()}`;
  });
  protected readonly contextModeDetail = computed(() => {
    const current = this.thread();
    if (!current) {
      return null;
    }
    if (!this.isContextSelectionActive()) {
      return 'Every complete message in this thread is eligible for the next request.';
    }
    return `${this.contextIncludedCount()} of ${this.currentThreadMessageCount()} messages are included in the next request.`;
  });
  protected readonly composerDraft = computed(() => {
    return this.composerDrafts()[this.getComposerDraftKey()] ?? '';
  });
  protected readonly estimatedDraftTokens = computed(() => {
    const draft = this.composerDraft().trim();
    return draft ? this.messageState.estimateTokens(draft) : 0;
  });

  protected readonly isContextUsageLoading = computed(() => {
    const currentThread = this.thread();
    if (!currentThread) {
      return false;
    }
    return (
      this.isLoading() &&
      currentThread.messageCount > 0 &&
      !this.visibleMessagesBelongToCurrentThread()
    );
  });

  protected readonly currentContextTokens = computed<number | null>(() => {
    if (this.isContextUsageLoading()) {
      return null;
    }
    return this.promptContext().tokens.total;
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
    () =>
      this.isSubmittingComposer() ||
      !this.thread() ||
      this.isLoading() ||
      this.isStreaming() ||
      !this.modelSelection().model
  );

  protected readonly isContextSelectionActive = this.selectionState.isContextSelectionActive.asReadonly();

  // ResizeObserver for auto-scroll optimization
  private userHasScrolledUp = false;

  constructor() {
    effect(onCleanup => {
      const element = this.scrollContainer()?.nativeElement;
      if (!element) return;
      this.userHasScrolledUp = false;
      element.addEventListener('scroll', this.onScroll, { passive: true });
      const observer = new ResizeObserver(() => this.scrollToBottomIfPinned());
      if (element.firstElementChild) observer.observe(element.firstElementChild);
      onCleanup(() => {
        observer.disconnect();
        element.removeEventListener('scroll', this.onScroll);
      });
    });
    // Handle new user messages - always scroll to bottom and reset scroll flag
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
        this.userHasScrolledUp = false;
        setTimeout(() => {
          const ref = this.scrollContainer();
          if (ref) {
            ref.nativeElement.scrollTo({ top: ref.nativeElement.scrollHeight, behavior: 'smooth' });
          }
        }, 50);
      }
    });

    // Clear the empty-state model preference once a real thread is active.
    effect(() => {
      if (this.thread()) {
        this.pendingEmptyStateModelId.set(null);
      }
    });
  }


  private onScroll = () => {
    const ref = this.scrollContainer();
    if (!ref) return;
    const el = ref.nativeElement;
    
    // Tolerance of 20px
    const isAtBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 20;
    
    // If user is NOT at bottom, we mark them as having scrolled up
    // If they ARE at bottom, we reset it (they are pinned again)
    this.userHasScrolledUp = !isAtBottom;
  }

  private scrollToBottomIfPinned(): void {
    if (this.userHasScrolledUp) return;

    const ref = this.scrollContainer();
    if (!ref) return;
    const el = ref.nativeElement;

    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }); 
    // Use 'instant' during streaming for performance, 'smooth' only for new user messages
  }

  protected readonly currentThreadContextSet = computed(() => {
    return this.promptContext().selection.selectedIds;
  });

  protected handleDeleteMessage(messageId: Id): void {
    if (this.isStreaming()) return;
    const threadId = this.thread()?.id;
    if (!threadId) {
      return;
    }
    void this.messageState.deleteMessage(messageId).then(() => {
      this.selectionState.syncSelectionWithMessages(this.messageState.messages());
    });
  }

  protected handleComposerSubmit(payload: ComposerSubmitPayload): void {
    if (this.isSubmittingComposer()) {
      return;
    }
    const existing = this.thread();
    if (existing) {
      void this.runSubmit(payload, existing.id);
      return;
    }
    // Empty state: spin up a new thread on first send, then deliver the message.
    void this.runSubmitFromEmpty(payload);
  }

  protected handleModelSelected(modelId: string): void {
    const current = this.thread();
    if (current) {
      void this.threads.setPreferredModel(current.id, modelId);
      return;
    }
    // Empty state: remember the choice so the first message creates a thread with this model.
    this.pendingEmptyStateModelId.set(modelId);
  }

  protected handleComposerDraftChange(nextDraft: string): void {
    this.setComposerDraft(this.getComposerDraftKey(), nextDraft);
  }

  protected handleCopyMessage(messageId: Id): void {
    const message = this.messages().find((item) => item.id === messageId);
    if (message?.rawMd) void this.copyMarkdown(message.rawMd);
  }

  protected async handleBranchMessage(messageId: Id): Promise<void> {
    const id = await this.chatActions.branchFromMessage(messageId);
    if (id) await this.router.navigate(['/chat', id]);
  }

  protected handleStopGeneration(): void { this.messageApi.stopGeneration(); }

  protected readonly contextPreview = computed(() => this.promptContext().turns
    .map(turn => `[${turn.role}]\n${turn.content}`).join('\n\n---\n\n'));


  protected handleSelectionChange(event: { id: Id; selected: boolean; range: boolean }): void {
    this.selectionState.setMessageSelection(event.id, {
      selected: event.selected,
      range: event.range
    });
  }

  protected handleClearSelection(): void {
    this.selectionState.clearSelection();
  }

  protected handleSelectAll(): void {
    this.selectionState.selectAllMessages();
  }

  protected handleDeleteSelected(): void {
    void this.chatActions.deleteSelectedMessages();
  }

  protected handleCompactSelection(): void {
    void this.chatActions.compactSelection();
  }

  protected handleRestoreCompaction(messageId: Id): void {
    void this.chatActions.uncompactMessage(messageId);
  }

  protected handleToggleContextSelection(): void {
    if (!this.thread()) {
      return;
    }
    this.selectionState.toggleContextSelection(!this.isContextSelectionActive());
  }

  protected handleIncludeAllContext(): void {
    const threadId = this.thread()?.id;
    if (!threadId) {
      return;
    }
    for (const message of this.messages()) {
      if (message.threadId === threadId) {
        this.selectionState.setContextForMessage(threadId, message.id, true);
      }
    }
  }

  protected handleContextSelectionChange(event: { messageId: Id; included: boolean }): void {
    const threadId = this.thread()?.id;
    if (!threadId) {
      return;
    }
    this.selectionState.setContextForMessage(threadId, event.messageId, event.included);
  }

  protected handleCopySelection(): void {
    const thread = this.thread();
    if (!thread) {
      return;
    }
    const ids = this.selectedMessageIds();
    if (!ids.length || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const idSet = new Set(ids);
    const ordered = this.messages().filter((message) => idSet.has(message.id));
    const markdown = formatMessagesMarkdown(ordered, thread.reasoningConfig ?? null);
    if (!markdown.trim()) {
      return;
    }
    void this.copyMarkdown(markdown);
  }

  private async copyMarkdown(markdown: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(markdown);
      this.copyStatus.set('Markdown copied.');
    } catch {
      this.copyStatus.set('Clipboard unavailable. Use Export to download Markdown.');
    }
  }

  protected handleExportSelection(): void {
    const thread = this.thread();
    if (!thread) return;
    const selected = new Set(this.selectedMessageIds());
    const messages = this.messages().filter(message => selected.has(message.id));
    if (messages.length) this.downloadTextFile(buildThreadDocument(thread, messages), `${this.buildFilename(thread.title)}-selection.md`);
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
    const markdown = buildThreadDocument(thread, messages);
    this.downloadTextFile(markdown, `${this.buildFilename(thread.title)}.md`);
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

  private downloadTextFile(content: string, filename: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private buildFilename(title: string): string {
    const safe = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '');
    const base = safe || 'chat-thread';
    return `${base}-${new Date().toISOString().replace(/[:]/g, '-')}`;
  }

  private async runSubmitFromEmpty(payload: ComposerSubmitPayload): Promise<void> {
    this.isSubmittingComposer.set(true);
    try {
      const created = await this.threads.createThread({
        preferredModelId: payload.modelId
      });
      void this.router.navigate(['/chat', created.id]);
      // The empty-state draft is keyed off the sentinel; clear it now that we have a real thread.
      this.setComposerDraft(created.id, payload.content);
      this.setComposerDraft(ChatWorkspaceComponent.EMPTY_COMPOSER_DRAFT_KEY, '');
      const started = await this.messageApi.sendUserMessage(payload.content, payload.modelId, created.id);
      if (started) this.setComposerDraft(created.id, '');
    } catch (error) {
      console.error('Failed to start new conversation', error);
    } finally {
      this.isSubmittingComposer.set(false);
    }
  }

  private async runSubmit(payload: ComposerSubmitPayload, threadId: Id): Promise<void> {
    this.isSubmittingComposer.set(true);
    try {
      const didStart = await this.messageApi.sendUserMessage(
        payload.content,
        payload.modelId,
        threadId
      );
      if (!didStart) {
        return;
      }
      this.setComposerDraft(threadId, '');
    } catch (error) {
      await this.dialogService.alert({ title: 'Message not sent', message: error instanceof Error ? error.message : 'Unable to save the message. Your draft has been kept.' });
    } finally {
      this.isSubmittingComposer.set(false);
    }
  }

  private setComposerDraft(threadId: Id, draft: string): void {
    this.composerDrafts.update((current) => {
      const existing = current[threadId] ?? '';
      if (existing === draft) {
        return current;
      }
      if (!draft) {
        const { [threadId]: _removed, ...rest } = current;
        return rest;
      }
      return {
        ...current,
        [threadId]: draft
      };
    });
  }

  private getComposerDraftKey(): Id {
    return this.thread()?.id ?? ChatWorkspaceComponent.EMPTY_COMPOSER_DRAFT_KEY;
  }
}
