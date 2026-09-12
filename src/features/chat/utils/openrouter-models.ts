import { z } from 'zod';
import type { LlmCapabilities, StreamChatOptions } from '../adapters/llm-adapter';
import type { ReasoningEffort } from '@models/chat';

const efforts: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const strings = z.array(z.string());
const positive = z.number().positive().nullish();

// Validate the external boundary; a malformed entry must not disable the entire catalog.
export const openRouterModelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullish(),
  created: z.number().optional(),
  context_length: positive,
  architecture: z
    .object({
      modality: z.string().optional(),
      input_modalities: strings.optional(),
      output_modalities: strings.optional(),
    })
    .optional(),
  supported_parameters: strings.optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
      request: z.string().optional(),
      image: z.string().optional(),
    })
    .optional(),
  top_provider: z.object({ max_completion_tokens: positive }).optional(),
  reasoning: z
    .object({
      supported_efforts: strings.nullish(),
      supports_max_tokens: z.boolean().optional(),
      mandatory: z.boolean().optional(),
    })
    .nullish(),
});

export function isInteractiveTextModel(model: z.infer<typeof openRouterModelSchema>): boolean {
  return (
    !model.id.endsWith(':batch') &&
    (!model.architecture?.input_modalities ||
      model.architecture.input_modalities.includes('text')) &&
    (!model.architecture?.output_modalities ||
      model.architecture.output_modalities.includes('text'))
  );
}

export function modelCapabilities(model: z.infer<typeof openRouterModelSchema>): LlmCapabilities {
  const params = model.supported_parameters ?? [];
  const reasoning = model.reasoning;
  return {
    streaming: true,
    tools: params.includes('tools'),
    jsonMode: params.includes('response_format'),
    maxTokens: model.top_provider?.max_completion_tokens ?? model.context_length ?? 8000,
    supportedParameters: params,
    reasoning: params.includes('reasoning')
      ? {
          efforts: (reasoning?.supported_efforts === null
            ? efforts
            : (reasoning?.supported_efforts ?? [])
          )
            .filter((value): value is ReasoningEffort => efforts.includes(value as ReasoningEffort))
            .filter((value) => value !== 'none'),
          maxTokens: reasoning?.supports_max_tokens === true,
          mandatory: reasoning?.mandatory === true,
        }
      : undefined,
  };
}

/** One policy for UI settings, background tasks, and imported thread preferences. */
export function supportedOptions(
  capabilities: LlmCapabilities,
  opts: Omit<StreamChatOptions, 'model'>,
) {
  const supports = (name: string) => capabilities.supportedParameters.includes(name);
  const result = { ...opts, reasoning: undefined } as Omit<StreamChatOptions, 'model'>;
  result.temperature =
    supports('temperature') && Number.isFinite(opts.temperature)
      ? Math.min(2, Math.max(0, opts.temperature!))
      : undefined;
  result.maxTokens =
    supports('max_tokens') && Number.isFinite(opts.maxTokens) && opts.maxTokens! >= 1
      ? Math.min(capabilities.maxTokens, Math.floor(opts.maxTokens!))
      : undefined;
  const config = opts.reasoning;
  const reasoning = capabilities.reasoning;
  if (config && reasoning) {
    const enabled = reasoning.mandatory || config.enabled !== false;
    result.reasoning = { enabled, exclude: config.exclude };
    if (enabled) {
      if (reasoning.maxTokens && Number.isInteger(config.maxTokens) && config.maxTokens! > 0) {
        if (result.maxTokens !== undefined && config.maxTokens! >= result.maxTokens) {
          throw new Error(
            'The reasoning token budget must be smaller than the maximum output tokens.',
          );
        }
        result.reasoning.maxTokens = config.maxTokens;
      } else if (config.effort && reasoning.efforts.includes(config.effort)) {
        result.reasoning.effort = config.effort;
      }
    }
  }
  return result;
}
