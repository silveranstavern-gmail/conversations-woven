import { buildThreadDocument } from './markdown-export';
import type { ChatMessage, ChatThread } from '@models/chat';

describe('Markdown export', () => {
  it('includes instructions, model, partial state, and original Markdown without encrypted reasoning', () => {
    const thread: ChatThread = {
      id: 't',
      title: 'Test',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      messageCount: 1,
      version: 1,
      preferredModelId: 'test/model',
      systemPrompt: 'Be concise.',
    };
    const message: ChatMessage = {
      id: 'm',
      threadId: 't',
      role: 'assistant',
      state: 'stopped',
      revision: 1,
      createdAt: '2026-01-01',
      model: 'test/model',
      rawMd: '## Example\n\n```ts\nconst x = 1;\n```',
      reasoning: {
        visible: true,
        details: [{ type: 'reasoning.encrypted', content: 'secret-blob', index: 0 }],
      },
    };
    const exported = buildThreadDocument(thread, [message]);
    expect(exported).toContain('Be concise.');
    expect(exported).toContain('Model: test/model');
    expect(exported).toContain('Status: stopped');
    expect(exported).toContain(message.rawMd!);
    expect(exported).not.toContain('secret-blob');
  });
});
