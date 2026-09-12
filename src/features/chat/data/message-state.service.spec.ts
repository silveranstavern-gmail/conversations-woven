import { TestBed } from '@angular/core/testing';
import { ApplicationRef, signal } from '@angular/core';
import { MessageStateService } from './message-state.service';
import { MessagePersistenceService } from './message-persistence.service';
import { ChatThreadsService } from './chat-threads.service';
import type { ChatMessage } from '@models/chat';

describe('message state isolation', () => {
  it('keeps thread histories separate and does not release the stream lock on navigation', async () => {
    const selected = signal<string | null>('first');
    const message = (id: string): ChatMessage => ({
      id,
      threadId: id,
      role: 'user',
      state: 'complete',
      revision: 1,
      createdAt: '2026-01-01',
      rawMd: id,
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: ChatThreadsService, useValue: { selectedThreadId: selected } },
        {
          provide: MessagePersistenceService,
          useValue: { listMessages: async (id: string) => [message(id)] },
        },
      ],
    });
    const state = TestBed.inject(MessageStateService);
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(state.messages().map((m) => m.id)).toEqual(['first']);
    state.setStreamingMessageId('pending');
    selected.set('second');
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(state.messages().map((m) => m.id)).toEqual(['second']);
    selected.set(null);
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(state.isStreaming()).toBeTrue();
  });
});
