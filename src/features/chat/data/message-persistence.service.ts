import { inject, Injectable } from '@angular/core';
import type { ChatMessage, Id } from '@models/chat';
import {
  CompactionSnapshot,
  IdbService
} from '@core/services/persistence/idb.service';

@Injectable({
  providedIn: 'root'
})
export class MessagePersistenceService {
  private readonly idb = inject(IdbService);

  listMessages(threadId: Id): Promise<ChatMessage[]> {
    return this.idb.listMessages(threadId);
  }

  getMessage(id: Id): Promise<ChatMessage | undefined> {
    return this.idb.getMessage(id);
  }

  saveMessage(message: ChatMessage): Promise<void> {
    return this.idb.putMessage(message);
  }

  bulkSaveMessages(messages: ChatMessage[]): Promise<void> {
    return this.idb.bulkPutMessages(messages);
  }

  deleteMessage(id: Id): Promise<void> {
    return this.idb.deleteMessage(id);
  }

  deleteMessagesForThread(threadId: Id): Promise<void> {
    return this.idb.deleteMessagesForThread(threadId);
  }

  async replaceThreadMessages(threadId: Id, messages: ChatMessage[]): Promise<void> {
    await this.idb.deleteMessagesForThread(threadId);
    if (messages.length) {
      await this.idb.bulkPutMessages(messages);
    }
  }

  saveCompactionSnapshot(messageId: Id, snapshot: CompactionSnapshot): Promise<void> {
    return this.idb.saveCompactionSnapshot(messageId, snapshot);
  }

  loadCompactionSnapshot(messageId: Id): Promise<CompactionSnapshot | undefined> {
    return this.idb.loadCompactionSnapshot(messageId);
  }

  deleteCompactionSnapshot(messageId: Id): Promise<void> {
    return this.idb.deleteCompactionSnapshot(messageId);
  }
}
