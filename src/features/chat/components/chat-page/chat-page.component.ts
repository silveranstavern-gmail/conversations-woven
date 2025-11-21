import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Id } from '@models/chat';
import { ChatWorkspaceComponent } from '../chat-workspace/chat-workspace.component';
import { ThreadListComponent } from '../thread-list/thread-list.component';
import { ChatOptionsComponent } from '../chat-options/chat-options.component';
import { ChatThreadsService } from '../../data/chat-threads.service';
import { DialogService } from '@core/services/dialog.service';
import { MessageStateService } from '../../data/message-state.service';
import { LayoutService } from '@core/services/layout.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';

@Component({
  selector: 'app-chat-page',
  imports: [ThreadListComponent, ChatWorkspaceComponent, ChatOptionsComponent, ButtonDirective],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPageComponent {
  private readonly threadsService = inject(ChatThreadsService);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);
  private readonly messageState = inject(MessageStateService);
  public readonly layoutService = inject(LayoutService);

  public readonly threadId = input<string | undefined>();

  protected readonly threads = this.threadsService.threads;
  protected readonly activeThreadId = this.threadsService.selectedThreadId;
  protected readonly activeThread = this.threadsService.activeThread;
  protected readonly hasThreads = this.threadsService.hasThreads;
  protected readonly isSidebarOpen = this.layoutService.isSidebarOpen;
  protected readonly isRightSidebarOpen = this.layoutService.isRightSidebarOpen;

  constructor() {
    // Sync route param to service for UI highlighting only
    // Navigation should only happen via RouterLink or explicit router.navigate calls
    effect(() => {
      const routeThreadId = this.threadId();
      if (routeThreadId) {
        // Update service selection for UI highlighting, but don't let service drive navigation
        const exists = this.threads().some((thread) => thread.id === routeThreadId);
        if (exists) {
          this.threadsService.selectThread(routeThreadId);
        }
      }
    });
  }

  protected readonly handleThreadSelected = (threadId: Id): void => {
    // Navigation will be handled by routerLink, but we keep this for programmatic selection
    void this.router.navigate(['/chat', threadId]);
  };

  protected readonly handleCreateThread = async (): Promise<void> => {
    const newThread = await this.threadsService.createThread();
    void this.router.navigate(['/chat', newThread.id]);
  };

  protected readonly handleRenameThread = async (threadId: Id): Promise<void> => {
    const current = this.threadsService.getThreadSnapshot(threadId);
    const nextTitle = await this.dialogService.prompt({
      title: 'Rename conversation',
      initialValue: current?.title ?? ''
    });
    if (!nextTitle || nextTitle.trim() === current?.title) {
      return;
    }
    void this.threadsService.renameThread(threadId, nextTitle);
  };

  protected readonly handleDeleteThread = async (threadId: Id): Promise<void> => {
    const current = this.threadsService.getThreadSnapshot(threadId);
    if (!current) {
      return;
    }
    if (current.protected) {
      await this.dialogService.alert({
        title: 'Cannot delete protected thread',
        message: 'Unprotect this thread before deleting it.'
      });
      return;
    }
    const confirmed = await this.dialogService.confirm({
      title: 'Delete conversation',
      message: `Delete "${current.title}"? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete'
    });
    if (confirmed) {
      const isActiveThread = threadId === this.activeThreadId();
      const deleted = await this.threadsService.deleteThread(threadId);
      if (!deleted) {
        await this.dialogService.alert({
          title: 'Error',
          message: 'Thread could not be deleted.'
        });
      } else if (isActiveThread) {
        // Navigate to root or first available thread
        const remainingThreads = this.threads();
        if (remainingThreads.length > 0) {
          void this.router.navigate(['/chat', remainingThreads[0].id]);
        } else {
          void this.router.navigate(['/chat']);
        }
      }
    }
  };

  protected readonly handleTogglePin = (payload: { id: Id; pinned: boolean }): void => {
    void this.threadsService.setPinned(payload.id, payload.pinned);
  };

  protected readonly handleToggleProtection = (payload: {
    id: Id;
    protected: boolean;
  }): void => {
    void this.threadsService.setProtection(payload.id, payload.protected);
  };

  protected readonly handleBulkPin = (payload: { ids: Id[]; pinned: boolean }): void => {
    void this.threadsService.bulkUpdatePinned(payload.ids, payload.pinned);
  };

  protected readonly handleBulkProtect = (payload: {
    ids: Id[];
    protected: boolean;
  }): void => {
    void this.threadsService.bulkUpdateProtection(payload.ids, payload.protected);
  };

  protected readonly handleBulkDelete = async (ids: Id[]): Promise<void> => {
    if (!ids.length) {
      return;
    }
    const confirmed = await this.dialogService.confirm({
      title: 'Delete conversations',
      message: `Delete ${ids.length} selected thread${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete'
    });
    if (!confirmed) {
      return;
    }
    const { skipped } = await this.threadsService.bulkDeleteThreads(ids);
    if (skipped.length) {
      await this.dialogService.alert({
        title: 'Some threads skipped',
        message: `${skipped.length} thread${skipped.length === 1 ? '' : 's'} were protected and skipped.`
      });
    }
  };

  protected readonly handleGenerateMetadata = async (threadId: Id): Promise<void> => {
    const thread = this.threadsService.getThreadSnapshot(threadId);
    if (!thread) {
      return;
    }
    
    // Load messages for this thread
    const messages = await this.messageState.getMessagesForThread(threadId);
    
    const result = await this.dialogService.metadataDialog({
      threadId,
      initialTitle: thread.title,
      initialTags: thread.tags ?? [],
      initialSummary: thread.meta?.['summary'] as string | undefined,
      messages
    });
    
    if (result) {
      void this.threadsService.updateThreadMetadata(threadId, {
        title: result.title,
        tags: result.tags,
        summary: result.summary
      });
    }
  };
}
