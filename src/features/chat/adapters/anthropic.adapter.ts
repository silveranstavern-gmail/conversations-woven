import { ChatTurn, LlmAdapter, LlmModelDescriptor, StreamChunk } from './llm-adapter';

export class AnthropicAdapter implements LlmAdapter {
  public readonly id = 'anthropic';
  public readonly label = 'Anthropic';

  public readonly models: LlmModelDescriptor[] = [
    {
      id: 'anthropic:claude-3-5-sonnet',
      label: 'Claude 3.5 Sonnet',
      adapterId: this.id,
      adapterModelId: 'claude-3-5-sonnet',
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: true,
        maxTokens: 200000
      }
    },
    {
      id: 'anthropic:claude-3-5-haiku',
      label: 'Claude 3.5 Haiku',
      adapterId: this.id,
      adapterModelId: 'claude-3-5-haiku',
      capabilities: {
        streaming: true,
        tools: false,
        jsonMode: false,
        maxTokens: 120000
      }
    }
  ];

  async *streamChat(turns: ChatTurn[], opts: { model: string }): AsyncIterable<StreamChunk> {
    const prompt = turns[turns.length - 1]?.content ?? '';
    const syntheticResponse = `Claude (${opts.model}) is thinking about:\n\n${prompt}\n\n[anthropic dev adapter]`;
    const chunks = syntheticResponse.match(/.{1,60}/g) ?? [];
    for (const deltaText of chunks) {
      yield { deltaText };
      await this.delay(35);
    }
    yield { done: true };
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
