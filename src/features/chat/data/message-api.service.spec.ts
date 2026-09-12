import { TestBed } from '@angular/core/testing';
import { MessageApiService } from './message-api.service';
import { MessageStateService } from './message-state.service';
import { ChatThreadsService } from './chat-threads.service';
import { ChatAdaptersService } from './chat-adapters.service';
import { ContextEngineService } from './context-engine.service';
import { DialogService } from '@core/services/dialog.service';
import type { ChatMessage } from '@models/chat';
import type { StreamChatOptions } from '../adapters/llm-adapter';

describe('message generation lifecycle', () => {
  it('prevents duplicate sends and keeps partial text on cancellation', async () => {
    let streaming = false;
    const saved = new Map<string, ChatMessage>();
    let nextId = 0;
    let started!: () => void;
    let completed!: () => void;
    const firstChunk = new Promise<void>((resolve) => (started = resolve));
    const finished = new Promise<void>((resolve) => (completed = resolve));
    TestBed.configureTestingModule({
      providers: [
        { provide: ChatThreadsService, useValue: { getThreadSnapshot: () => ({ id: 't' }) } },
        {
          provide: MessageStateService,
          useValue: {
            isStreaming: () => streaming,
            generateId: () => String(++nextId),
            upsertMessage: async (message: ChatMessage) => {
              saved.set(message.id, message);
            },
            replaceMessageSignal: () => {},
            setStreamingMessageId: (id: string | null) => {
              streaming = id !== null;
              if (!id) completed();
            },
          },
        },
        {
          provide: ChatAdaptersService,
          useValue: {
            getModelById: () => ({
              id: 'model',
              capabilities: { maxTokens: 4096, supportedParameters: ['max_tokens'] },
            }),
            streamModel: async function* (
              _model: string,
              _turns: unknown,
              options: StreamChatOptions,
            ) {
              yield { deltaText: 'Partial response' };
              started();
              await new Promise<void>((_resolve, reject) =>
                options.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
                  once: true,
                }),
              );
            },
          },
        },
        {
          provide: ContextEngineService,
          useValue: { buildRequestContext: () => ({ turns: [], estimatedTotalTokens: 10 }) },
        },
        { provide: DialogService, useValue: { alert: async () => {} } },
      ],
    });
    const service = TestBed.inject(MessageApiService);
    const first = service.sendUserMessage('Hello', 'model', 't');
    expect(await service.sendUserMessage('Duplicate', 'model', 't')).toBeFalse();
    expect(await first).toBeTrue();
    await firstChunk;
    service.stopGeneration();
    await finished;
    expect(saved.size).toBe(2);
    expect(saved.get('2')?.rawMd).toBe('Partial response');
    expect(saved.get('2')?.state).toBe('stopped');
    expect(streaming).toBeFalse();
  });
});
