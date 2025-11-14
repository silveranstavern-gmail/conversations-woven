import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { Id } from '@models/chat';
import { MessageStateService } from './message-state.service';
import { ChatThreadsService } from './chat-threads.service';

@Injectable({
  providedIn: 'root'
})
export class SelectionStateService {
  private readonly messageState = inject(MessageStateService);
  private readonly threads = inject(ChatThreadsService);

  // Bulk selection (for operations like delete, compact, etc.)
  private readonly selectedMessageIdsSignal = signal<Id[]>([]);
  private readonly selectionAnchorIdSignal = signal<Id | null>(null);

  // Context selection (per-thread, for prompt context)
  private readonly contextSelections = signal<Record<Id, Set<Id>>>({});
  public readonly isContextSelectionActive = signal(false);

  readonly selectedMessageIds = this.selectedMessageIdsSignal.asReadonly();
  readonly selectionCount = computed(() => this.selectedMessageIdsSignal().length);
  readonly hasSelection = computed(() => this.selectionCount() > 0);

  constructor() {
    // Sync selection when messages change to ensure selected IDs are still valid
    effect(() => {
      const messages = this.messageState.messages();
      this.syncSelectionWithMessages(messages);
    });

    // Reset context selection when thread changes
    effect(() => {
      const threadId = this.threads.selectedThreadId();
      if (threadId) {
        this.initializeContextForThread(threadId);
      } else {
        // Clear context selection when no thread is selected
        this.contextSelections.update((current) => {
          const next = { ...current };
          // Don't delete entries, just ensure current thread has default selection
          return next;
        });
      }
    });
  }

  setMessageSelection(id: Id, options: { selected: boolean; range?: boolean } = { selected: true }): void {
    const existing = this.messageState.messages().some((message) => message.id === id);
    if (!existing) {
      return;
    }
    const shouldUseRange = Boolean(options.range && this.selectionAnchorIdSignal());
    if (shouldUseRange) {
      this.applyRangeSelection(this.selectionAnchorIdSignal()!, id, options.selected);
    } else {
      this.applySingleSelection(id, options.selected);
    }
    this.selectionAnchorIdSignal.set(id);
  }

  selectAllMessages(): void {
    const ids = this.messageState.messages().map((message) => message.id);
    this.selectedMessageIdsSignal.set(ids);
    this.selectionAnchorIdSignal.set(ids.length ? ids[ids.length - 1] : null);
  }

  clearSelection(): void {
    this.resetSelection();
  }

  resetSelection(): void {
    this.selectedMessageIdsSignal.set([]);
    this.selectionAnchorIdSignal.set(null);
  }

  syncSelectionWithMessages(messages: Array<{ id: Id }>): void {
    const validIds = new Set(messages.map((message) => message.id));
    const filtered = this.selectedMessageIdsSignal().filter((id) => validIds.has(id));
    if (filtered.length !== this.selectedMessageIdsSignal().length) {
      this.selectedMessageIdsSignal.set(filtered);
      this.selectionAnchorIdSignal.set(filtered.length ? filtered[filtered.length - 1] : null);
    }
  }

  setSelectedIds(ids: Id[]): void {
    this.selectedMessageIdsSignal.set(ids);
    this.selectionAnchorIdSignal.set(ids.length ? ids[ids.length - 1] : null);
  }

  private applySingleSelection(id: Id, selected: boolean): void {
    if (selected) {
      const current = new Set(this.selectedMessageIdsSignal());
      current.add(id);
      this.selectedMessageIdsSignal.set(this.orderIdsByMessageSequence([...current]));
      return;
    }
    this.selectedMessageIdsSignal.update((current) => current.filter((value) => value !== id));
  }

  private applyRangeSelection(anchorId: Id, targetId: Id, selected: boolean): void {
    const ids = this.idsBetween(anchorId, targetId);
    if (!ids.length) {
      this.applySingleSelection(targetId, selected);
      return;
    }
    if (selected) {
      const next = new Set(this.selectedMessageIdsSignal());
      ids.forEach((id) => next.add(id));
      this.selectedMessageIdsSignal.set(this.orderIdsByMessageSequence([...next]));
      return;
    }
    this.selectedMessageIdsSignal.update((current) => current.filter((value) => !ids.includes(value)));
  }

  private idsBetween(a: Id, b: Id): Id[] {
    const messages = this.messageState.messages();
    const start = messages.findIndex((message) => message.id === a);
    const end = messages.findIndex((message) => message.id === b);
    if (start === -1 || end === -1) {
      return [];
    }
    const [min, max] = start < end ? [start, end] : [end, start];
    return messages.slice(min, max + 1).map((message) => message.id);
  }

  private orderIdsByMessageSequence(ids: Id[]): Id[] {
    const orderMap = new Set(ids);
    return this.messageState
      .messages()
      .map((message) => message.id)
      .filter((id) => orderMap.has(id));
  }

  // Context selection methods (per-thread)

  toggleContextSelection(isActive: boolean): void {
    this.isContextSelectionActive.set(isActive);
    if (!isActive) {
      // When turning off, reset context for current thread
      const threadId = this.threads.selectedThreadId();
      if (threadId) {
        this.initializeContextForThread(threadId);
      }
    }
  }

  setContextForMessage(threadId: Id, messageId: Id, included: boolean): void {
    this.contextSelections.update((selections) => {
      const currentSet = selections[threadId] ?? new Set<Id>();
      const nextSet = new Set(currentSet);
      if (included) {
        nextSet.add(messageId);
      } else {
        nextSet.delete(messageId);
      }
      return { ...selections, [threadId]: nextSet };
    });
  }

  getContextForThread(threadId: Id): Set<Id> {
    return this.contextSelections()[threadId] ?? new Set<Id>();
  }

  private initializeContextForThread(threadId: Id): void {
    // Default: select all messages in the thread for context
    const messages = this.messageState.messages().filter((m) => m.threadId === threadId);
    const allIds = new Set(messages.map((m) => m.id));
    
    this.contextSelections.update((selections) => {
      // Only initialize if not already set (preserve user's manual selection)
      if (!selections[threadId]) {
        return { ...selections, [threadId]: allIds };
      }
      return selections;
    });
  }
}

