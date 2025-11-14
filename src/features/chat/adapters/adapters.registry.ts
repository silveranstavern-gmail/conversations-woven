import { AnthropicAdapter } from './anthropic.adapter';
import { LlmAdapter, LlmModelDescriptor } from './llm-adapter';
import { OpenAiAdapter } from './openai.adapter';

const ADAPTERS: LlmAdapter[] = [new OpenAiAdapter(), new AnthropicAdapter()];

export const LLM_ADAPTERS: ReadonlyArray<LlmAdapter> = ADAPTERS;
export const LLM_MODELS: ReadonlyArray<LlmModelDescriptor> = ADAPTERS.flatMap(
  (adapter) => adapter.models
);

export const LLM_MODEL_MAP: ReadonlyMap<string, LlmModelDescriptor> = new Map(
  LLM_MODELS.map((model) => [model.id, model])
);

export const LLM_ADAPTER_MAP: ReadonlyMap<string, LlmAdapter> = new Map(
  ADAPTERS.map((adapter) => [adapter.id, adapter])
);
