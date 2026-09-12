import { TestBed } from '@angular/core/testing';
import { OpenRouterAdapter } from './openrouter.adapter';
import { KeychainService } from '@core/services/keychain.service';
import type { StreamChunk } from './llm-adapter';

describe('OpenRouter streaming protocol', () => {
  let adapter: OpenRouterAdapter;
  let fetchSpy: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: KeychainService, useValue: { readKey: async () => 'test-key-not-real' } },
      ],
    });
    adapter = TestBed.inject(OpenRouterAdapter);
    fetchSpy = spyOn(globalThis, 'fetch');
  });
  const response = (frames: unknown[]) =>
    new Response(
      frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  async function collect(signal?: AbortSignal) {
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.streamChat([{ role: 'user', content: 'Hello' }], {
      model: 'test/model',
      signal,
    }))
      chunks.push(chunk);
    return chunks;
  }

  it('reads nested reasoning usage and accepts repeated terminal usage frames', async () => {
    fetchSpy.and.resolveTo(
      response([
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            completion_tokens_details: { reasoning_tokens: 15 },
          },
        },
      ]),
    );
    const chunks = await collect();
    expect(chunks.at(-1)?.usage?.reasoningTokens).toBe(15);
    expect(chunks.at(-1)?.finishReason).toBe('stop');
  });
  it('rejects provider errors even after HTTP 200', async () => {
    fetchSpy.and.resolveTo(
      response([
        { error: { message: 'Provider disconnected', code: 'server_error' }, choices: [] },
      ]),
    );
    await expectAsync(collect()).toBeRejectedWithError(/Provider disconnected/);
  });
  it('rejects empty and prematurely terminated responses', async () => {
    fetchSpy.and.resolveTo(response([{ choices: [{ delta: {}, finish_reason: 'length' }] }]));
    await expectAsync(collect()).toBeRejectedWithError(/No response text/);
    fetchSpy.and.resolveTo(response([{ choices: [{ delta: { content: 'Partial' } }] }]));
    await expectAsync(collect()).toBeRejectedWithError(/connection ended/);
  });
  it('uses the real origin and preserves reasoning wire fields in requests', async () => {
    fetchSpy.and.resolveTo(
      response([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }]),
    );
    for await (const chunk of adapter.streamChat(
      [
        {
          role: 'assistant',
          content: 'Earlier',
          reasoningDetails: [
            { type: 'reasoning.encrypted', content: 'opaque', format: 'test-format', index: 0 },
          ],
        },
      ],
      { model: 'test/model', reasoning: { enabled: true, exclude: true } },
    )) {
      void chunk;
    }
    const request = fetchSpy.calls.mostRecent().args[1] as RequestInit;
    const payload = JSON.parse(request.body as string);
    expect(payload.messages[0].reasoning_details[0].data).toBe('opaque');
    expect(payload.messages[0].reasoning_details[0].content).toBeUndefined();
    expect(payload.reasoning.exclude).toBeTrue();
    expect(new Headers(request.headers).get('HTTP-Referer')).toBe(location.origin);
  });
  it('does not send an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expectAsync(collect(controller.signal)).toBeRejected();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
