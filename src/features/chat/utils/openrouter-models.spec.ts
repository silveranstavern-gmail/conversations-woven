import {
  isInteractiveTextModel,
  modelCapabilities,
  openRouterModelSchema,
  supportedOptions,
} from './openrouter-models';

describe('OpenRouter model capabilities', () => {
  const model = (extra = {}) =>
    openRouterModelSchema.parse({ id: 'test/model', name: 'Test', ...extra });

  it('excludes batch-only variants and models without text output', () => {
    expect(isInteractiveTextModel(model({ id: 'test/model:batch' }))).toBeFalse();
    expect(
      isInteractiveTextModel(model({ architecture: { output_modalities: ['image'] } })),
    ).toBeFalse();
    expect(
      isInteractiveTextModel(model({ architecture: { output_modalities: ['text', 'image'] } })),
    ).toBeTrue();
  });

  it('does not infer controls from provider or model names', () => {
    const caps = modelCapabilities(model({ id: 'openai/gpt-test' }));
    expect(caps.reasoning).toBeUndefined();
    expect(
      supportedOptions(caps, { temperature: 1, maxTokens: 200, reasoning: { enabled: true } }),
    ).toEqual({ temperature: undefined, maxTokens: undefined, reasoning: undefined });
  });

  it('uses advertised efforts and respects mandatory reasoning', () => {
    const caps = modelCapabilities(
      model({
        supported_parameters: ['reasoning'],
        reasoning: {
          supported_efforts: ['none', 'minimal', 'high', 'future-effort'],
          mandatory: true,
        },
      }),
    );
    expect(caps.reasoning?.efforts).toEqual(['minimal', 'high']);
    expect(
      supportedOptions(caps, { reasoning: { enabled: false, effort: 'medium' } }).reasoning,
    ).toEqual({ enabled: true, exclude: undefined });
  });

  it('distinguishes omitted effort support from unrestricted effort support', () => {
    expect(
      modelCapabilities(model({ supported_parameters: ['reasoning'], reasoning: {} })).reasoning
        ?.efforts,
    ).toEqual([]);
    expect(
      modelCapabilities(
        model({ supported_parameters: ['reasoning'], reasoning: { supported_efforts: null } }),
      ).reasoning?.efforts,
    ).toContain('xhigh');
  });

  it('sends only one reasoning budget and enforces output headroom', () => {
    const caps = modelCapabilities(
      model({
        supported_parameters: ['reasoning', 'max_tokens'],
        reasoning: { supports_max_tokens: true, supported_efforts: ['high'] },
      }),
    );
    expect(
      supportedOptions(caps, { maxTokens: 4096, reasoning: { effort: 'high', maxTokens: 1024 } })
        .reasoning,
    ).toEqual({ enabled: true, exclude: undefined, maxTokens: 1024 });
    expect(() =>
      supportedOptions(caps, { maxTokens: 1024, reasoning: { maxTokens: 1024 } }),
    ).toThrowError(/smaller/);
  });

  it('clamps valid values and drops non-finite or invalid limits', () => {
    const caps = modelCapabilities(
      model({
        supported_parameters: ['temperature', 'max_tokens'],
        top_provider: { max_completion_tokens: 1000 },
      }),
    );
    expect(supportedOptions(caps, { temperature: 3, maxTokens: 2000 }).maxTokens).toBe(1000);
    expect(supportedOptions(caps, { temperature: 3 }).temperature).toBe(2);
    expect(supportedOptions(caps, { temperature: NaN, maxTokens: -1 }).maxTokens).toBeUndefined();
  });
});
