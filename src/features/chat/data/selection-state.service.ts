import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { Id } from '@models/chat';
import { MessageStateService } from './message-state.service';

@Injectable({
  providedIn: 'root'
})
export class SelectionStateService {
  private readonly messageState = inject(MessageStateService);

  private readonly selectedMessageIdsSignal = signal<Id[]>([]);
  private readonly selectionAnchorIdSignal = signal<Id | null>(null);

  readonly selectedMessageIds = this.selectedMessageIdsSignal.asReadonly();
  readonly selectionCount = computed(() => this.selectedMessageIdsSignal().length);
  readonly hasSelection = computed(() => this.selectionCount() > 0);

  constructor() {
    // Sync selection when messages change to ensure selected IDs are still valid
    effect(() => {
      const messages = this.messageState.messages();
      this.syncSelectionWithMessages(messages);
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
}

