import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import type { ChatMessage, ChatThread, Id } from '@models/chat';
import type { Folder } from '@models/folder';
import {
  chatMessageSchema,
  chatMessagesSchema,
  chatThreadSchema,
  chatThreadsSchema
} from '@models/validators';
import { folderSchema, foldersSchema } from '@models/folder';

export interface KvEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface CompactionSnapshot {
  threadId: Id;
  messageIds: Id[];
  messages: ChatMessage[];
  createdAt: string;
}

const DB_NAME = 'advanced-llm-chat';
const DB_VERSION = 2;
const COMPACTION_KEY_PREFIX = 'compaction:';

class ChatDatabase extends Dexie {
  public threads!: Table<ChatThread, Id>;
  public messages!: Table<ChatMessage, Id>;
  public kv!: Table<KvEntry, string>;
  public folders!: Table<Folder, Id>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      threads: '&id, updatedAt, pinned, protected',
      messages: '&id, threadId, parentId, createdAt',
      kv: '&key'
    });

    this.version(2).stores({
      threads: '&id, updatedAt, pinned, protected, folderId',
      messages: '&id, threadId, parentId, createdAt',
      kv: '&key',
      folders: '&id, name, createdAt'
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class IdbService {
  private readonly db = new ChatDatabase();
  private buildCompactionKey(messageId: Id): string {
    return `${COMPACTION_KEY_PREFIX}${messageId}`;
  }

  async listThreads(): Promise<ChatThread[]> {
    const records = await this.db.threads.toArray();
    return chatThreadsSchema.parse(records);
  }

  async getThread(id: Id): Promise<ChatThread | undefined> {
    const record = await this.db.threads.get(id);
    return record ? chatThreadSchema.parse(record) : undefined;
  }

  async putThread(thread: ChatThread): Promise<void> {
    const payload = chatThreadSchema.parse(thread);
    await this.db.threads.put(payload);
  }

  async deleteThread(id: Id): Promise<void> {
    await Dexie.waitFor(
      Promise.all([
        this.db.messages.where('threadId').equals(id).delete(),
        this.db.threads.delete(id)
      ])
    );
  }

  async bulkPutThreads(threads: ChatThread[]): Promise<void> {
    const payload = chatThreadsSchema.parse(threads);
    await this.db.threads.bulkPut(payload);
  }

  async listMessages(threadId: Id): Promise<ChatMessage[]> {
    const records = await this.db.messages.where('threadId').equals(threadId).sortBy('createdAt');
    return chatMessagesSchema.parse(records);
  }

  async listAllMessages(): Promise<ChatMessage[]> {
    const records = await this.db.messages.toArray();
    return chatMessagesSchema.parse(records);
  }

  async getMessage(id: Id): Promise<ChatMessage | undefined> {
    const record = await this.db.messages.get(id);
    return record ? chatMessageSchema.parse(record) : undefined;
  }

  async putMessage(message: ChatMessage): Promise<void> {
    const payload = chatMessageSchema.parse(message);
    await this.db.messages.put(payload);
  }

  async bulkPutMessages(messages: ChatMessage[]): Promise<void> {
    const payload = chatMessagesSchema.parse(messages);
    await this.db.messages.bulkPut(payload);
  }

  async deleteMessage(id: Id): Promise<void> {
    await this.db.messages.delete(id);
  }

  async deleteMessagesForThread(threadId: Id): Promise<void> {
    await this.db.messages.where('threadId').equals(threadId).delete();
  }

  async getKv<T = unknown>(key: string): Promise<T | undefined> {
    const record = await this.db.kv.get(key);
    return record?.value as T | undefined;
  }

  async setKv<T = unknown>(key: string, value: T): Promise<void> {
    const entry: KvEntry<T> = {
      key,
      value,
      updatedAt: new Date().toISOString()
    };
    await this.db.kv.put(entry);
  }

  async deleteKv(key: string): Promise<void> {
    await this.db.kv.delete(key);
  }

  async listKvEntries(prefix?: string): Promise<KvEntry[]> {
    if (!prefix) {
      return this.db.kv.toArray();
    }
    return this.db.kv.where('key').startsWith(prefix).toArray();
  }

  async saveCompactionSnapshot(messageId: Id, snapshot: CompactionSnapshot): Promise<void> {
    await this.setKv(this.buildCompactionKey(messageId), snapshot);
  }

  async loadCompactionSnapshot(messageId: Id): Promise<CompactionSnapshot | undefined> {
    return this.getKv<CompactionSnapshot>(this.buildCompactionKey(messageId));
  }

  async deleteCompactionSnapshot(messageId: Id): Promise<void> {
    await this.deleteKv(this.buildCompactionKey(messageId));
  }

  async listCompactionSnapshots(): Promise<Record<Id, CompactionSnapshot>> {
    const entries = await this.listKvEntries(COMPACTION_KEY_PREFIX);
    return entries.reduce<Record<Id, CompactionSnapshot>>((acc, entry) => {
      const messageId = entry.key.replace(COMPACTION_KEY_PREFIX, '');
      acc[messageId] = entry.value as CompactionSnapshot;
      return acc;
    }, {});
  }

  async listFolders(): Promise<Folder[]> {
    const records = await this.db.folders.toArray();
    return foldersSchema.parse(records) as Folder[];
  }

  async getFolder(id: Id): Promise<Folder | undefined> {
    const record = await this.db.folders.get(id);
    return record ? (folderSchema.parse(record) as Folder) : undefined;
  }

  async putFolder(folder: Folder): Promise<void> {
    const payload = folderSchema.parse(folder) as Folder;
    await this.db.folders.put(payload);
  }

  async bulkPutFolders(folders: Folder[]): Promise<void> {
    const payload = foldersSchema.parse(folders) as Folder[];
    await this.db.folders.bulkPut(payload);
  }

  async deleteFolder(id: Id): Promise<void> {
    await this.db.folders.delete(id);
  }

  async replaceWithBundle(payload: {
    threads: ChatThread[];
    messages: ChatMessage[];
    compactions: Record<Id, CompactionSnapshot>;
  }): Promise<void> {
    const threads = chatThreadsSchema.parse(payload.threads);
    const messages = chatMessagesSchema.parse(payload.messages);
    const compactions = payload.compactions ?? {};

    await this.db.transaction('rw', this.db.threads, this.db.messages, this.db.kv, async () => {
      await this.db.threads.clear();
      await this.db.messages.clear();
      await this.db.kv.where('key').startsWith(COMPACTION_KEY_PREFIX).delete();

      if (threads.length) {
        await this.db.threads.bulkPut(threads);
      }
      if (messages.length) {
        await this.db.messages.bulkPut(messages);
      }
      const entries = Object.entries(compactions).map(([messageId, snapshot]) => ({
        key: this.buildCompactionKey(messageId),
        value: snapshot,
        updatedAt: snapshot.createdAt ?? new Date().toISOString()
      }));
      if (entries.length) {
        await this.db.kv.bulkPut(entries);
      }
    });
  }
}
