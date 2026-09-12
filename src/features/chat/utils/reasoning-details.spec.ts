import {
  fromOpenRouterReasoning,
  mergeReasoningDetail,
  toOpenRouterReasoning,
} from './reasoning-details';
import { chatMessageSchema } from '@models/validators';

describe('reasoning round trips', () => {
  it('preserves each wire format through backup validation', () => {
    const blocks = [
      {
        type: 'reasoning.text',
        text: 'thinking',
        signature: 'signed',
        format: 'anthropic-claude-v1',
        index: 0,
      },
      { type: 'reasoning.summary', summary: 'summary', index: 1 },
      { type: 'reasoning.encrypted', data: 'opaque', index: 2 },
    ];
    const message = chatMessageSchema.parse({
      id: 'm',
      threadId: 't',
      role: 'assistant',
      state: 'complete',
      revision: 1,
      createdAt: new Date().toISOString(),
      reasoning: { details: blocks.map((block) => fromOpenRouterReasoning(block)!) },
    });
    expect(message.reasoning!.details!.map(toOpenRouterReasoning)).toEqual(blocks);
  });

  it('keeps signature-only deltas and does not merge blocks of different types', () => {
    const initial = fromOpenRouterReasoning({ type: 'reasoning.text', text: 'first', index: 0 })!;
    const signature = fromOpenRouterReasoning({
      type: 'reasoning.text',
      signature: 'sig',
      index: 0,
    })!;
    const result = mergeReasoningDetail([initial], signature);
    expect(result[0].content).toBe('first');
    expect(result[0].signature).toBe('sig');
    expect(
      mergeReasoningDetail(result, { type: 'reasoning.encrypted', content: 'opaque', index: 0 })
        .length,
    ).toBe(2);
  });
});
