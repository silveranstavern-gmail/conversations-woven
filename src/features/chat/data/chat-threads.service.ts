import { inject, Injectable, computed, signal } from '@angular/core';
import { Id } from '@models/chat';
import type { ChatMessage, ChatThread } from '@models/chat';
import { IdbService } from '@core/services/persistence/idb.service';
import { ChatAdaptersService } from './chat-adapters.service';

interface CreateThreadOptions {
  title?: string;
  tags?: string[];
  preferredModelId?: string;
}

const SEED_THREADS: ChatThread[] = [
  {
    id: 'thread-claude-context',
    title: 'Claude — context tools exploration',
    createdAt: '2024-10-12T08:12:00.000Z',
    updatedAt: '2024-10-13T19:42:00.000Z',
    preferredModelId: 'anthropic/claude-3.5-sonnet',
    messageCount: 18,
    tags: ['context', 'analysis'],
    pinned: true,
    version: 1
  },
  {
    id: 'thread-bug-triage',
    title: 'Prompt refactor for bug triage',
    createdAt: '2024-10-09T14:20:00.000Z',
    updatedAt: '2024-10-11T15:10:00.000Z',
    preferredModelId: 'openai/gpt-4o-mini',
    messageCount: 9,
    tags: ['llm', 'triage'],
    version: 1,
    protected: true
  },
  {
    id: 'thread-research-helper',
    title: 'Idea board — research helper persona',
    createdAt: '2024-10-02T09:05:00.000Z',
    updatedAt: '2024-10-05T12:33:00.000Z',
    preferredModelId: 'anthropic/claude-3-haiku-20240307',
    messageCount: 25,
    version: 1
  }
];

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-claude-1',
    threadId: 'thread-claude-context',
    role: 'user',
    createdAt: '2024-10-13T18:00:00.000Z',
    revision: 1,
    rawMd: 'Walk me through how context windows expand when I attach a tool plan.',
    state: 'complete'
  },
  {
    id: 'msg-claude-2',
    threadId: 'thread-claude-context',
    role: 'assistant',
    parentId: 'msg-claude-1',
    createdAt: '2024-10-13T18:00:10.000Z',
    revision: 1,
    rawMd:
      'Sure! 1) we capture document embeddings, 2) we summarize per tool constraint, 3) we stream merges. Each step stays within 120k tokens so compaction is safe.',
    state: 'complete',
    model: 'anthropic/claude-3.5-sonnet'
  },
  {
    id: 'msg-triage-1',
    threadId: 'thread-bug-triage',
    role: 'user',
    createdAt: '2024-10-11T11:00:00.000Z',
    revision: 1,
    rawMd: 'Help me refactor this triage prompt to capture the repro + steps as bullet points.',
    state: 'complete'
  },
  {
    id: 'msg-triage-2',
    threadId: 'thread-bug-triage',
    role: 'assistant',
    parentId: 'msg-triage-1',
    createdAt: '2024-10-11T11:00:06.000Z',
    revision: 1,
    rawMd:
      'Consider a format like:\n\n1. **Repro** – required steps\n2. **Impact** – affected personas\n3. **Logs** – attach sanitized output\n\nHappy to iterate.',
    state: 'complete',
    model: 'openai/gpt-4o'
  },
  {
    id: 'msg-research-1',
    threadId: 'thread-research-helper',
    role: 'assistant',
    createdAt: '2024-10-05T10:00:00.000Z',
    revision: 1,
    rawMd: 'What research helper persona traits are you exploring today?',
    state: 'complete',
    model: 'perplexity/sonar-small-online'
  }
];

@Injectable({
  providedIn: 'root'
})
export class ChatThreadsService {
  private readonly idb = inject(IdbService);
  private readonly adapters = inject(ChatAdaptersService);

  private readonly threadsSignal = signal<ChatThread[]>([]);
  private readonly selectedThreadIdSignal = signal<Id | null>(null);
  private readonly isInitializingSignal = signal(true);

  readonly threads = this.threadsSignal.asReadonly();
  readonly selectedThreadId = this.selectedThreadIdSignal.asReadonly();
  readonly hasThreads = computed(() => this.threads().length > 0);
  readonly activeThread = computed(
    () => this.threads().find((thread) => thread.id === this.selectedThreadId()) ?? null
  );
  readonly isReady = computed(() => !this.isInitializingSignal());

  constructor() {
    void this.loadInitialThreads();
  }

  getThreadSnapshot(id: Id): ChatThread | undefined {
    return this.threads().find((thread) => thread.id === id);
  }

  async refresh(): Promise<void> {
    await this.loadInitialThreads();
  }

  async createThread(options: CreateThreadOptions = {}): Promise<ChatThread> {
    const now = new Date().toISOString();
    const preferredModelId = this.resolvePreferredModelId(options.preferredModelId);
    const thread: ChatThread = {
      id: this.generateId(),
      title: options.title?.trim() || 'Untitled conversation',
      createdAt: now,
      updatedAt: now,
      preferredModelId: preferredModelId ?? undefined,
      messageCount: 0,
      tags: options.tags ?? ['draft'],
      version: 1
    };

    await this.idb.putThread(thread);
    this.threadsSignal.update((current) => [thread, ...current]);
    this.selectedThreadIdSignal.set(thread.id);
    return thread;
  }

  selectThread(id: Id | null): void {
    if (!id) {
      this.selectedThreadIdSignal.set(null);
      return;
    }
    const exists = this.threads().some((thread) => thread.id === id);
    if (exists) {
      this.selectedThreadIdSignal.set(id);
    }
  }

  async renameThread(id: Id, nextTitle: string): Promise<void> {
    const title = nextTitle.trim();
    if (!title) {
      return;
    }
    const thread = await this.idb.getThread(id);
    if (!thread) {
      return;
    }

    const updated: ChatThread = {
      ...thread,
      title,
      updatedAt: new Date().toISOString()
    };

    await this.idb.putThread(updated);
    this.upsertThreadInSignal(updated);
  }

  async deleteThread(id: Id): Promise<boolean> {
    const record = await this.idb.getThread(id);
    if (!record || record.protected) {
      return false;
    }

    await this.idb.deleteThread(id);
    this.threadsSignal.update((current) => current.filter((thread) => thread.id !== id));

    if (this.selectedThreadId() === id) {
      this.selectedThreadIdSignal.set(this.threadsSignal()[0]?.id ?? null);
    }

    return true;
  }

  async bulkDeleteThreads(ids: Id[]): Promise<{ deleted: Id[]; skipped: Id[] }> {
    const unique = Array.from(new Set(ids));
    if (!unique.length) {
      return { deleted: [], skipped: [] };
    }
    const deleted: Id[] = [];
    const skipped: Id[] = [];
    for (const id of unique) {
      const record = await this.idb.getThread(id);
      if (!record) {
        skipped.push(id);
        continue;
      }
      if (record.protected) {
        skipped.push(id);
        continue;
      }
      await this.idb.deleteThread(id);
      deleted.push(id);
    }

    if (deleted.length) {
      const deletedSet = new Set(deleted);
      this.threadsSignal.update((current) => current.filter((thread) => !deletedSet.has(thread.id)));
      const currentSelected = this.selectedThreadIdSignal();
      if (currentSelected && deletedSet.has(currentSelected)) {
        this.selectedThreadIdSignal.set(this.threadsSignal()[0]?.id ?? null);
      }
    }

    return { deleted, skipped };
  }

  async setPinned(id: Id, pinned: boolean): Promise<void> {
    const thread = await this.idb.getThread(id);
    if (!thread || (thread.pinned ?? false) === pinned) {
      return;
    }
    const updated: ChatThread = {
      ...thread,
      pinned,
      updatedAt: new Date().toISOString()
    };
    await this.idb.putThread(updated);
    this.upsertThreadInSignal(updated);
  }

  async setProtection(id: Id, isProtected: boolean): Promise<void> {
    const thread = await this.idb.getThread(id);
    if (!thread || (thread.protected ?? false) === isProtected) {
      return;
    }
    const updated: ChatThread = {
      ...thread,
      protected: isProtected,
      updatedAt: new Date().toISOString()
    };
    await this.idb.putThread(updated);
    this.upsertThreadInSignal(updated);
  }

  async bulkUpdatePinned(ids: Id[], pinned: boolean): Promise<void> {
    await this.bulkUpdateThreads(ids, (thread) =>
      (thread.pinned ?? false) === pinned ? null : { pinned }
    );
  }

  async bulkUpdateProtection(ids: Id[], isProtected: boolean): Promise<void> {
    await this.bulkUpdateThreads(ids, (thread) =>
      (thread.protected ?? false) === isProtected ? null : { protected: isProtected }
    );
  }

  async reloadFromStore(): Promise<void> {
    const records = await this.idb.listThreads();
    this.threadsSignal.set(records);
    if (!records.length) {
      this.selectedThreadIdSignal.set(null);
      return;
    }
    const current = this.selectedThreadIdSignal();
    if (!current || !records.some((thread) => thread.id === current)) {
      this.selectedThreadIdSignal.set(records[0].id);
    }
  }

  async setMessageCount(id: Id, count: number): Promise<void> {
    const safeCount = Math.max(0, count);
    const thread = await this.idb.getThread(id);
    if (!thread) {
      return;
    }
    const updated: ChatThread = {
      ...thread,
      messageCount: safeCount,
      updatedAt: new Date().toISOString()
    };
    await this.idb.putThread(updated);
    this.upsertThreadInSignal(updated);
  }

  async touchThread(id: Id): Promise<void> {
    const thread = await this.idb.getThread(id);
    if (!thread) {
      return;
    }
    const updated: ChatThread = {
      ...thread,
      updatedAt: new Date().toISOString()
    };
    await this.idb.putThread(updated);
    this.upsertThreadInSignal(updated);
  }

  async setPreferredModel(id: Id, modelId: string): Promise<void> {
    if (!this.isKnownModel(modelId)) {
      return;
    }
    const thread = await this.idb.getThread(id);
    if (!thread || thread.preferredModelId === modelId) {
      return;
    }
    const updated: ChatThread = {
      ...thread,
      preferredModelId: modelId,
      updatedAt: new Date().toISOString()
    };
    await this.idb.putThread(updated);
    this.upsertThreadInSignal(updated);
  }

  private async loadInitialThreads(): Promise<void> {
    this.isInitializingSignal.set(true);
    try {
      const records = await this.idb.listThreads();
      if (records.length === 0) {
        await this.idb.bulkPutThreads(SEED_THREADS);
        await this.idb.bulkPutMessages(SEED_MESSAGES);
        this.threadsSignal.set(SEED_THREADS);
      } else {
        this.threadsSignal.set(records);
      }
      this.selectedThreadIdSignal.set(this.threadsSignal()[0]?.id ?? null);
    } finally {
      this.isInitializingSignal.set(false);
    }
  }

  private upsertThreadInSignal(thread: ChatThread): void {
    const exists = this.threadsSignal().some((item) => item.id === thread.id);
    if (exists) {
      this.threadsSignal.update((current) =>
        current.map((item) => (item.id === thread.id ? thread : item))
      );
      return;
    }
    this.threadsSignal.update((current) => [thread, ...current]);
  }

  private async bulkUpdateThreads(
    ids: Id[],
    transform: (thread: ChatThread) => Partial<ChatThread> | null
  ): Promise<void> {
    const unique = Array.from(new Set(ids));
    if (!unique.length) {
      return;
    }
    const updates: ChatThread[] = [];
    for (const id of unique) {
      const thread = await this.idb.getThread(id);
      if (!thread) {
        continue;
      }
      const patch = transform(thread);
      if (!patch) {
        continue;
      }
      updates.push({
        ...thread,
        ...patch,
        updatedAt: new Date().toISOString()
      });
    }
    if (!updates.length) {
      return;
    }
    await this.idb.bulkPutThreads(updates);
    this.replaceThreadsInSignal(updates);
  }

  private replaceThreadsInSignal(updates: ChatThread[]): void {
    const map = new Map(updates.map((thread) => [thread.id, thread]));
    this.threadsSignal.update((current) =>
      current.map((thread) => map.get(thread.id) ?? thread)
    );
  }

  private generateId(): Id {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef?.randomUUID) {
      return cryptoRef.randomUUID();
    }

    return `thread-${Math.random().toString(36).slice(2, 10)}`;
  }

  private resolvePreferredModelId(candidate?: string | null): string | null {
    if (candidate && this.isKnownModel(candidate)) {
      return candidate;
    }
    const first = this.adapters.models()[0];
    return first?.id ?? null;
  }

  private isKnownModel(modelId: string): boolean {
    return this.adapters.models().some((model) => model.id === modelId);
  }
}
