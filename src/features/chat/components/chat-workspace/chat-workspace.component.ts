import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, OnDestroy, viewChild, AfterViewInit } from '@angular/core';
import { ChatMessage, ChatThread, Id } from '@models/chat';
import { MessageListComponent } from '../message-list/message-list.component';
import { ComposerComponent, ComposerSubmitPayload } from '../composer/composer.component';
import { MessageStateService } from '../../data/message-state.service';
import { SelectionStateService } from '../../data/selection-state.service';
import { MessageApiService } from '../../data/message-api.service';
import { ChatActionsService } from '../../data/chat-actions.service';
import { ChatAdaptersService } from '../../data/chat-adapters.service';
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
  private readonly scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  public readonly thread = input<ChatThread | undefined>();
  public readonly hasThreads = input<boolean>(false);

  private readonly messageState = inject(MessageStateService);
  private readonly selectionState = inject(SelectionStateService);
  private readonly messageApi = inject(MessageApiService);
  private readonly chatActions = inject(ChatActionsService);
  private readonly adapters = inject(ChatAdaptersService);
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
  protected readonly preferredModelId = computed(() => {
    const currentThread = this.thread();
    if (!currentThread) {
      return null;
    }
    const available = this.adapters.models();
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

  // --- NEW COMPUTEDS FOR CONTEXT INDICATOR ---
  protected readonly currentModelLimit = computed(() => {
    const id = this.preferredModelId();
    if (!id) return 0;
    const model = this.adapters.getModelById(id);
    return model?.contextLength || 4096;
  });

  protected readonly estimatedCurrentTokens = computed(() => {
    const thread = this.thread();
    if (!thread) return 0;
    
    let msgs: ChatMessage[] = [];
    // Respect context selection if active
    if (this.isContextSelectionActive()) {
        const contextIds = this.selectionState.getContextForThread(thread.id);
        msgs = this.messageState.getMessagesInOrder(Array.from(contextIds));
    } else {
        msgs = this.messageState.getEffectiveHistory(thread.id);
    }

    const history = this.messageState.calculateTotalTokens(msgs);
    
    let system = 0;
    if (thread.systemPrompt) {
        system = this.messageState.estimateTokens(thread.systemPrompt) * 2; // Sandwich
    }
    return history + system;
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
    const threadId = this.thread()?.id;
    if (!threadId) {
      return new Set<Id>();
    }
    return this.selectionState.getContextForThread(threadId);
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
    void this.messageApi.sendUserMessage(payload.content, payload.modelId, threadId);
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
