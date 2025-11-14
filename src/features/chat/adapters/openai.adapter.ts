import { ChatTurn, LlmAdapter, LlmModelDescriptor, StreamChunk } from './llm-adapter';

export class OpenAiAdapter implements LlmAdapter {
  public readonly id = 'openai';
  public readonly label = 'OpenAI';

  public readonly models: LlmModelDescriptor[] = [
    {
      id: 'openai:gpt-4o-mini',
      label: 'GPT-4o Mini',
      adapterId: this.id,
      adapterModelId: 'gpt-4o-mini',
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: true,
        maxTokens: 32000
      }
    },
    {
      id: 'openai:o3-mini',
      label: 'o3 Mini',
      adapterId: this.id,
      adapterModelId: 'o3-mini',
      capabilities: {
        streaming: true,
        tools: false,
        jsonMode: false,
        maxTokens: 16000
      }
    }
  ];

  async *streamChat(turns: ChatTurn[], opts: { model: string }): AsyncIterable<StreamChunk> {
    const prompt = turns[turns.length - 1]?.content ?? '';
    const syntheticResponse = `OpenAI (${opts.model}) would respond to:\n\n${prompt}\n\n[dev placeholder stream]`;
    const chunks = syntheticResponse.match(/.{1,60}/g) ?? [];
    for (const deltaText of chunks) {
      yield { deltaText };
      await this.delay(30);
    }
    yield { done: true };
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
