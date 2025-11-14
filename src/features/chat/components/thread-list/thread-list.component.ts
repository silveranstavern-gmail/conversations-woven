import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal
} from '@angular/core';
import { ChatThread, Id } from '@models/chat';

@Component({
  selector: 'app-thread-list',
  imports: [DatePipe],
  templateUrl: './thread-list.component.html',
  styleUrl: './thread-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThreadListComponent {
  public readonly threads = input<ChatThread[]>([]);
  public readonly activeThreadId = input<Id | null>(null);
  public readonly threadSelected = output<Id>();
  public readonly createThread = output<void>();
  public readonly renameThread = output<Id>();
  public readonly deleteThread = output<Id>();
  public readonly togglePin = output<{ id: Id; pinned: boolean }>();
  public readonly toggleProtection = output<{ id: Id; protected: boolean }>();
  public readonly bulkDelete = output<Id[]>();
  public readonly bulkPin = output<{ ids: Id[]; pinned: boolean }>();
  public readonly bulkProtect = output<{ ids: Id[]; protected: boolean }>();

  protected readonly term = signal('');
  protected readonly selectedIds = signal<Id[]>([]);

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

  protected onFilterChange(event: Event): void {
    const nextTerm = (event.target as HTMLInputElement).value;
    this.term.set(nextTerm);
  }

  protected onSelectThread(threadId: Id): void {
    this.threadSelected.emit(threadId);
  }

  protected onCreateThread(): void {
    this.createThread.emit();
  }

  protected onRenameThread(event: Event, threadId: Id): void {
    event.stopPropagation();
    this.renameThread.emit(threadId);
  }

  protected onDeleteThread(event: Event, threadId: Id): void {
    event.stopPropagation();
    this.deleteThread.emit(threadId);
  }

  protected onTogglePin(event: Event, threadId: Id, pinned: boolean): void {
    event.stopPropagation();
    this.togglePin.emit({ id: threadId, pinned });
  }

  protected onToggleProtection(event: Event, threadId: Id, isProtected: boolean): void {
    event.stopPropagation();
    this.toggleProtection.emit({ id: threadId, protected: isProtected });
  }

  protected onKeydownSelect(event: KeyboardEvent, threadId: Id): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.threadSelected.emit(threadId);
    }
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
