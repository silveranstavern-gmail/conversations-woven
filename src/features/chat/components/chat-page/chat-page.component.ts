import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Id } from '@models/chat';
import { ChatWorkspaceComponent } from '../chat-workspace/chat-workspace.component';
import { ThreadListComponent } from '../thread-list/thread-list.component';
import { ChatThreadsService } from '../../data/chat-threads.service';

@Component({
  selector: 'app-chat-page',
  imports: [ThreadListComponent, ChatWorkspaceComponent],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPageComponent {
  private readonly threadsService = inject(ChatThreadsService);

  protected readonly threads = this.threadsService.threads;
  protected readonly activeThreadId = this.threadsService.selectedThreadId;
  protected readonly activeThread = this.threadsService.activeThread;
  protected readonly hasThreads = this.threadsService.hasThreads;
  protected readonly isReady = this.threadsService.isReady;

  protected readonly handleThreadSelected = (threadId: Id): void => {
    this.threadsService.selectThread(threadId);
  };

  protected readonly handleCreateThread = (): void => {
    void this.threadsService.createThread();
  };

  protected readonly handleRenameThread = (threadId: Id): void => {
    const current = this.threadsService.getThreadSnapshot(threadId);
    const nextTitle = window.prompt('Rename conversation', current?.title ?? '');
    if (!nextTitle || nextTitle.trim() === current?.title) {
      return;
    }
    void this.threadsService.renameThread(threadId, nextTitle);
  };

  protected readonly handleDeleteThread = (threadId: Id): void => {
    const current = this.threadsService.getThreadSnapshot(threadId);
    if (!current) {
      return;
    }
    if (current.protected) {
      window.alert('Unprotect this thread before deleting it.');
      return;
    }
    const confirmed = window.confirm(
      `Delete “${current.title}”? This cannot be undone.`
    );
    if (confirmed) {
      void this.threadsService.deleteThread(threadId).then((deleted) => {
        if (!deleted) {
          window.alert('Thread could not be deleted.');
        }
      });
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

  protected readonly handleBulkDelete = (ids: Id[]): void => {
    if (!ids.length) {
      return;
    }
    const confirmed = window.confirm(
      `Delete ${ids.length} selected thread${ids.length === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    void this.threadsService.bulkDeleteThreads(ids).then(({ skipped }) => {
      if (skipped.length) {
        window.alert(
          `${skipped.length} thread${skipped.length === 1 ? '' : 's'} were protected and skipped.`
        );
      }
    });
  };
}
