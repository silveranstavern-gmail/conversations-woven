import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ContextEngineService } from './context-engine.service';
import { MessageStateService } from './message-state.service';
import { SelectionStateService } from './selection-state.service';
import { ChatAdaptersService } from './chat-adapters.service';
import type { ChatMessage, ChatThread } from '@models/chat';

describe('context selection', () => {
  const thread: ChatThread = {
    id: 't',
    title: 'Test',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    messageCount: 2,
    version: 1,
  };
  const messages: ChatMessage[] = [
    {
      id: 'a',
      threadId: 't',
      role: 'user',
      rawMd: 'keep',
      state: 'complete',
      revision: 1,
      createdAt: '2026-01-01',
    },
    {
      id: 'b',
      threadId: 'other',
      role: 'user',
      rawMd: 'private other thread',
      state: 'complete',
      revision: 1,
      createdAt: '2026-01-01',
    },
  ];
  let service: ContextEngineService;
  const active = signal(true);
  let selected = new Set<string>();
  beforeEach(() => {
    active.set(true);
    selected = new Set();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MessageStateService,
          useValue: {
            getMessagesInOrder: (ids: string[]) => messages.filter((m) => ids.includes(m.id)),
            getEffectiveHistory: () => [messages[0]],
            calculateTotalTokens: (items: ChatMessage[]) =>
              items.reduce((sum, m) => sum + m.rawMd!.length, 0),
            estimateTokens: (text: string) => text.length,
          },
        },
        {
          provide: SelectionStateService,
          useValue: { isContextSelectionActive: active, getContextForThread: () => selected },
        },
        {
          provide: ChatAdaptersService,
          useValue: { resolveModelSelection: () => ({ model: null }) },
        },
      ],
    });
    service = TestBed.inject(ContextEngineService);
  });
  it('sends no history when the curated selection is empty', () => {
    const context = service.buildRequestContext(thread, 'draft', 100);
    expect(context.turns).toEqual([{ role: 'user', content: 'draft' }]);
    expect(context.estimatedTotalTokens).toBe(105);
  });
  it('never leaks another thread through stale selected IDs', () => {
    selected = new Set(['a', 'b']);
    expect(service.buildContext(thread).messages.map((m) => m.id)).toEqual(['a']);
  });
  it('keeps the existing system sandwich and appends the draft once', () => {
    active.set(false);
    const result = service.buildRequestContext({ ...thread, systemPrompt: 'system' }, 'draft');
    expect(result.turns.map((t) => t.content)).toEqual(['system', 'keep', 'system', 'draft']);
  });
});
