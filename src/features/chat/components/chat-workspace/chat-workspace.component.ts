import { AfterViewInit, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { ChatMessage, ChatThread, Id, ReasoningConfig } from '@models/chat';
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
import { ContextIndicatorComponent } from '../context-indicator/context-indicator.component';

@Component({
  selector: 'app-chat-workspace',
  imports: [MessageListComponent, ComposerComponent, ButtonDirective, TooltipDirective, ChatHeaderComponent, ContextIndicatorComponent],
  templateUrl: './chat-workspace.component.html',
  styleUrl: './chat-workspace.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatWorkspaceComponent implements OnDestroy, AfterViewInit {
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

  protected readonly isUnlocked = this.keychain.isUnlocked;
  protected readonly storedProviders = this.keychain.storedProviders;

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

  protected readonly currentModelLimit = computed<number | null>(() => {
    const model = this.modelSelection().model;
    return typeof model?.contextLength === 'number' && model.contextLength > 0
      ? model.contextLength
      : null;
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
  private resizeObserver?: ResizeObserver;
  private userHasScrolledUp = false;

  constructor() {
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
  }

  ngAfterViewInit(): void {
    // Hook up the observer and scroll listener when the view renders
    const ref = this.scrollContainer();
    if (ref) {
      const el = ref.nativeElement;
      // Add scroll listener to detect user scroll
      el.addEventListener('scroll', this.onScroll);

      // Create observer to watch the *inner* container or the last element
      this.resizeObserver = new ResizeObserver(() => {
        this.scrollToBottomIfPinned();
      });
      
      // Observe the container's first child (the stream container)
      if (el.firstElementChild) {
        this.resizeObserver.observe(el.firstElementChild);
      }
    }
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

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    const ref = this.scrollContainer();
    if (ref) {
      ref.nativeElement.removeEventListener('scroll', this.onScroll);
    }
  }
  protected readonly currentThreadContextSet = computed(() => {
    return this.promptContext().selection.selectedIds;
  });

  protected handleDeleteMessage(messageId: Id): void {
    const threadId = this.thread()?.id;
    if (!threadId) {
      return;
    }
    void this.messageState.deleteMessage(messageId).then(() => {
      this.selectionState.syncSelectionWithMessages(this.messageState.messages());
    });
  }

  protected handleComposerSubmit(payload: ComposerSubmitPayload): void {
    const threadId = this.thread()?.id;
    if (!threadId) {
      return;
    }
    void this.submitComposerMessage(payload, threadId);
  }

  protected handleComposerDraftChange(nextDraft: string): void {
    this.setComposerDraft(this.getComposerDraftKey(), nextDraft);
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
    void this.chatActions.branchFromMessage(messageId);
  }

  protected handleUpdateMessage(event: { id: Id; content: string }): void {
    void this.chatActions.editMessageContent(event.id, event.content);
  }

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
    const markdown = this.formatMessagesMarkdown(ordered, thread.reasoningConfig ?? null);
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

  private formatMessagesMarkdown(
    messages: ChatMessage[],
    reasoningConfig: ReasoningConfig | null
  ): string {
    if (!messages.length) {
      return '';
    }
    return messages
      .map((message) => {
        const author =
          message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'You' : message.role;
        const timestamp = new Date(message.createdAt).toLocaleString();
        const body = (message.rawMd ?? '').trim();
        const includeReasoning =
          (reasoningConfig?.captureInHistory ?? true) && (message.reasoning?.visible ?? false);
        let reasoning = '';
        if (includeReasoning && message.reasoning) {
          const summaryLine = message.reasoning.summary
            ? `> ${message.reasoning.summary}`
            : null;
          const detailLines =
            message.reasoning.details
              ?.filter((detail) => detail.type === 'reasoning.text' || detail.type === 'reasoning.summary')
              .map((detail) => `> ${detail.content}`) ?? [];
          const lines = [summaryLine, ...detailLines].filter(Boolean) as string[];
          if (lines.length) {
            reasoning = `\n\n**Thinking Process:**\n${lines.join('\n')}`;
          }
        }
        return `### ${author} · ${timestamp}\n\n${body}${reasoning}`;
      })
      .join('\n\n---\n\n');
  }

  private buildThreadDocument(thread: ChatThread, messages: ChatMessage[]): string {
    const header = `# ${thread.title}\n\nExported ${new Date().toLocaleString()}\n`;
    const body = this.formatMessagesMarkdown(messages, thread.reasoningConfig ?? null);
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

  private async submitComposerMessage(
    payload: ComposerSubmitPayload,
    threadId: Id
  ): Promise<void> {
    if (this.isSubmittingComposer()) {
      return;
    }
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
      console.error('Failed to send message', error);
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
