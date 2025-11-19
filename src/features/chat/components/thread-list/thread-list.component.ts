import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatThread, Id } from '@models/chat';
import { FolderStateService } from '../../data/folder-state.service';
import { ChatThreadsService } from '../../data/chat-threads.service';
import { DialogService } from '@core/services/dialog.service';

@Component({
  selector: 'app-thread-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './thread-list.component.html',
  styleUrl: './thread-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThreadListComponent {
  private readonly folderService = inject(FolderStateService);
  private readonly threadsService = inject(ChatThreadsService);
  private readonly dialogService = inject(DialogService);

  public readonly threads = input<ChatThread[]>([]);
  public readonly activeThreadId = input<Id | null>(null);
  public readonly threadSelected = output<Id>();
  public readonly createThread = output<void>();
  public readonly renameThread = output<Id>();
  public readonly deleteThread = output<Id>();
  public readonly togglePin = output<{ id: Id; pinned: boolean }>();
  public readonly toggleProtection = output<{ id: Id; protected: boolean }>();
  public readonly generateMetadata = output<Id>();
  public readonly bulkDelete = output<Id[]>();
  public readonly bulkPin = output<{ ids: Id[]; pinned: boolean }>();
  public readonly bulkProtect = output<{ ids: Id[]; protected: boolean }>();

  protected readonly term = signal('');
  protected readonly selectedIds = signal<Id[]>([]);
  protected readonly openMenuThreadId = signal<Id | null>(null);

  protected readonly folders = this.folderService.folders;
  protected readonly expandedFolderIds = this.folderService.expandedFolderIds;

  protected readonly sortedThreads = computed(() =>
    [...this.threads()].sort((a, b) => {
      if ((a.pinned ?? false) !== (b.pinned ?? false)) {
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
  );
  protected readonly filteredThreads = computed(() => {
    const filter = this.term().trim().toLowerCase();
    if (!filter) {
      return this.sortedThreads();
    }

    return this.sortedThreads().filter((thread) => {
      const matchesTitle = thread.title.toLowerCase().includes(filter);
      const matchesTags = thread.tags?.some((tag) => tag.toLowerCase().includes(filter));
      return matchesTitle || matchesTags;
    });
  });

  protected readonly uncategorizedThreads = computed(() =>
    this.filteredThreads().filter((t) => !t.folderId)
  );

  protected readonly threadsByFolder = computed(() => {
    const map = new Map<Id, ChatThread[]>();
    for (const thread of this.filteredThreads()) {
      if (thread.folderId) {
        if (!map.has(thread.folderId)) {
          map.set(thread.folderId, []);
        }
        map.get(thread.folderId)!.push(thread);
      }
    }
    return map;
  });

  protected readonly pinnedCount = computed(
    () => this.threads().filter((thread) => thread.pinned).length
  );

  protected readonly selectedCount = computed(() => this.selectedIds().length);
  protected readonly hasSelection = computed(() => this.selectedCount() > 0);
  protected readonly selectedSet = computed(() => new Set(this.selectedIds()));
  protected readonly allFilteredSelected = computed(() => {
    const set = this.selectedSet();
    const filtered = this.filteredThreads();
    return filtered.length > 0 && filtered.every((thread) => set.has(thread.id));
  });

  constructor() {
    effect(() => {
      const available = new Set(this.threads().map((thread) => thread.id));
      const current = this.selectedIds();
      const next = current.filter((id) => available.has(id));
      if (next.length !== current.length) {
        this.selectedIds.set(next);
      }
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isMenuClick = target.closest('.thread-list__item-menu');
    const isTriggerClick = target.closest('.thread-list__item-menu-trigger');
    if (!isMenuClick && !isTriggerClick) {
      this.closeMenu();
    }
  }

  protected onFilterChange(event: Event): void {
    const nextTerm = (event.target as HTMLInputElement).value;
    this.term.set(nextTerm);
  }

  protected onToggleMenu(event: Event, threadId: Id): void {
    event.stopPropagation();
    event.preventDefault();
    this.openMenuThreadId.update(current => (current === threadId ? null : threadId));
  }

  protected closeMenu(): void {
    this.openMenuThreadId.set(null);
  }

  protected onSelectThread(threadId: Id): void {
    // Navigation is now handled by routerLink, but we keep this for programmatic selection
    this.threadSelected.emit(threadId);
  }

  protected onKeydownSelect(event: KeyboardEvent, threadId: Id): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // Navigation is handled by routerLink, trigger click to activate routerLink
      const element = event.currentTarget as HTMLElement;
      const link = element.querySelector<HTMLElement>('[routerLink]') || element;
      link.click();
    }
  }

  protected onCreateThread(): void {
    this.createThread.emit();
  }

  protected onRenameThread(event: Event, threadId: Id): void {
    event.stopPropagation();
    this.closeMenu();
    this.renameThread.emit(threadId);
  }

  protected onDeleteThread(event: Event, threadId: Id): void {
    event.stopPropagation();
    this.closeMenu();
    this.deleteThread.emit(threadId);
  }

  protected onTogglePin(event: Event, threadId: Id, pinned: boolean): void {
    event.stopPropagation();
    this.closeMenu();
    this.togglePin.emit({ id: threadId, pinned });
  }

  protected onToggleProtection(event: Event, threadId: Id, isProtected: boolean): void {
    event.stopPropagation();
    this.closeMenu();
    this.toggleProtection.emit({ id: threadId, protected: isProtected });
  }

  protected onGenerateMetadata(event: Event, threadId: Id): void {
    event.stopPropagation();
    this.closeMenu();
    this.generateMetadata.emit(threadId);
  }

  protected onSelectionChange(event: Event, threadId: Id): void {
    event.stopPropagation();
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    this.updateSelection(threadId, checked);
  }

  protected onSelectFiltered(): void {
    const ids = this.filteredThreads().map((thread) => thread.id);
    this.selectedIds.set(ids);
  }

  protected onClearSelection(): void {
    if (!this.hasSelection()) {
      return;
    }
    this.selectedIds.set([]);
  }

  protected onBulkPin(pinned: boolean): void {
    if (!this.selectedIds().length) {
      return;
    }
    this.bulkPin.emit({ ids: this.selectedIds(), pinned });
    this.selectedIds.set([]);
  }

  protected onBulkProtect(isProtected: boolean): void {
    if (!this.selectedIds().length) {
      return;
    }
    this.bulkProtect.emit({ ids: this.selectedIds(), protected: isProtected });
    this.selectedIds.set([]);
  }

  protected onBulkDelete(): void {
    if (!this.selectedIds().length) {
      return;
    }
    this.bulkDelete.emit(this.selectedIds());
    this.selectedIds.set([]);
  }

  protected onToggleSelectFiltered(event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    if (checkbox.checked) {
      this.onSelectFiltered();
    } else {
      this.onClearSelection();
    }
  }

  protected async onCreateFolder(): Promise<void> {
    const name = await this.dialogService.prompt({
      title: 'New Folder',
      message: 'Enter a name for the folder',
      placeholder: 'Folder name'
    });
    if (!name || !name.trim()) {
      return;
    }
    try {
      await this.folderService.createFolder(name);
    } catch (error) {
      await this.dialogService.alert({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to create folder'
      });
    }
  }

  protected onToggleFolderExpansion(folderId: Id): void {
    this.folderService.toggleFolderExpansion(folderId);
  }

  protected async onRenameFolder(event: Event, folderId: Id): Promise<void> {
    event.stopPropagation();
    const folder = this.folderService.folders().find((f) => f.id === folderId);
    if (!folder) {
      return;
    }
    const newName = await this.dialogService.prompt({
      title: 'Rename Folder',
      message: 'Enter a new name for the folder',
      initialValue: folder.name
    });
    if (!newName || newName.trim() === folder.name) {
      return;
    }
    try {
      await this.folderService.renameFolder(folderId, newName);
    } catch (error) {
      await this.dialogService.alert({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to rename folder'
      });
    }
  }

  protected async onDeleteFolder(event: Event, folderId: Id): Promise<void> {
    event.stopPropagation();
    const folder = this.folderService.folders().find((f) => f.id === folderId);
    if (!folder) {
      return;
    }
    const threadsInFolder = this.threads().filter((t) => t.folderId === folderId);
    const confirmed = await this.dialogService.confirm({
      title: 'Delete Folder',
      message: `Are you sure you want to delete the folder "${folder.name}"? All ${threadsInFolder.length} thread${threadsInFolder.length === 1 ? '' : 's'} inside will become uncategorized.`,
      danger: true,
      confirmLabel: 'Delete'
    });
    if (!confirmed) {
      return;
    }
    try {
      // Move all threads in this folder to uncategorized (null folderId)
      for (const thread of threadsInFolder) {
        await this.threadsService.moveThreadToFolder(thread.id, null);
      }
      await this.folderService.deleteFolder(folderId);
    } catch (error) {
      await this.dialogService.alert({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete folder'
      });
    }
  }

  protected async onMoveThreadToFolder(event: Event, threadId: Id): Promise<void> {
    event.stopPropagation();
    this.closeMenu();
    const folders = this.folderService.folders();
    const currentFolderId = this.threads().find((t) => t.id === threadId)?.folderId ?? null;

    // Create a simple selection dialog
    const folderOptions = [
      { id: null, name: 'Uncategorized' },
      ...folders.map((f) => ({ id: f.id, name: f.name }))
    ];

    // For now, we'll use a simple prompt-based approach
    // In a more sophisticated UI, this could be a dropdown or modal
    const selectedIndex = await this.dialogService.prompt({
      title: 'Move to Folder',
      message: `Select folder (0-${folderOptions.length - 1}):\n${folderOptions.map((f, i) => `${i}: ${f.name}`).join('\n')}`,
      initialValue: currentFolderId ? folderOptions.findIndex((f) => f.id === currentFolderId)?.toString() ?? '0' : '0'
    });

    if (selectedIndex === null) {
      return;
    }

    const index = parseInt(selectedIndex, 10);
    if (isNaN(index) || index < 0 || index >= folderOptions.length) {
      return;
    }

    const selectedFolder = folderOptions[index];
    await this.threadsService.moveThreadToFolder(threadId, selectedFolder.id);
  }

  private updateSelection(threadId: Id, selected: boolean): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(threadId);
      } else {
        next.delete(threadId);
      }
      return Array.from(next);
    });
  }
}
