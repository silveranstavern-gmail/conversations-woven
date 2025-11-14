import { inject, Injectable } from '@angular/core';
import type { ChatMessage, ChatThread, Id } from '@models/chat';
import { chatMessagesSchema, chatThreadsSchema } from '@models/validators';
import { CompactionSnapshot, IdbService } from './idb.service';

export interface ChatBackupBundle {
  version: number;
  exportedAt: string;
  threads: ChatThread[];
  messages: ChatMessage[];
  compactions: Record<Id, CompactionSnapshot>;
}

const BUNDLE_VERSION = 1;

@Injectable({
  providedIn: 'root'
})
export class BackupService {
  private readonly idb = inject(IdbService);

  async exportBundle(): Promise<ChatBackupBundle> {
    const [threads, messages, compactions] = await Promise.all([
      this.idb.listThreads(),
      this.idb.listAllMessages(),
      this.idb.listCompactionSnapshots()
    ]);

    return {
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      threads,
      messages,
      compactions
    };
  }

  async importBundle(bundle: ChatBackupBundle): Promise<void> {
    const incomingVersion = bundle.version ?? BUNDLE_VERSION;
    if (incomingVersion > BUNDLE_VERSION) {
      throw new Error('Backup bundle was created by a newer version of the app.');
    }
    const threads = chatThreadsSchema.parse(bundle.threads);
    const messages = chatMessagesSchema.parse(bundle.messages);
    const compactions = bundle.compactions ?? {};
    await this.idb.replaceWithBundle({ threads, messages, compactions });
  }
}
