import { computed, inject, Injectable, signal } from '@angular/core';
import { LlmCapabilities, LlmModelDescriptor, ChatTurn } from '../adapters/llm-adapter';
import { OpenRouterAdapter } from '../adapters/openrouter.adapter';

export interface ChatModelOption {
  id: string;
  label: string;
  adapterId: string;
  adapterLabel: string;
  adapterModelId: string;
  capabilities: LlmCapabilities;
}

export interface ChatModelVisibilityOption extends ChatModelOption {
  enabled: boolean;
}

interface ModelPreferencesSnapshot {
  disabledModelIds: string[];
}

const MODEL_PREFERENCES_KEY = 'model-preferences';

@Injectable({
  providedIn: 'root'
})
export class ChatAdaptersService {
  private readonly openrouterAdapter = inject(OpenRouterAdapter);

  private readonly allModelsSignal = signal<ChatModelOption[]>([]);

  private readonly disabledModelIds = signal<string[]>(this.hydrateDisabledModelIds());

  public readonly catalog = computed(() => {
    const disabled = new Set(this.disabledModelIds());
    return this.allModelsSignal().map((model) => ({
      ...model,
      enabled: !disabled.has(model.id)
    }));
  });

  public readonly models = computed<ChatModelOption[]>(() =>
    this.catalog()
      .filter((model) => model.enabled)
      .map(({ enabled: _enabled, ...rest }) => rest)
  );

  constructor() {
    void this.initializeModels();
  }

  private async initializeModels(): Promise<void> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error('Failed to fetch models from OpenRouter');
      }

      const { data } = (await response.json()) as { data: any[] };

      const models: ChatModelOption[] = data.map((model: any) => ({
        id: model.id,
        label: model.name,
        adapterId: 'openrouter',
        adapterLabel: 'OpenRouter',
        adapterModelId: model.id,
        capabilities: {
          streaming: true, // Assume all OpenRouter models support streaming
          tools: model.supported_features?.includes('tools') ?? false,
          jsonMode: model.supported_features?.includes('json_mode') ?? false,
          maxTokens: model.context_length ?? 8000
        }
      }));

      this.allModelsSignal.set(models);
    } catch (error) {
      console.error('Error initializing models:', error);
      // Optionally, set a fallback or error state
    }
  }

  getModelById(id: string): ChatModelOption | undefined {
    const match = this.catalog().find((model) => model.id === id);
    if (!match) {
      return undefined;
    }
    const { enabled: _enabled, ...rest } = match;
    return rest;
  }

  setModelEnabled(id: string, enabled: boolean): void {
    if (!this.allModelsSignal().some((model) => model.id === id)) {
      return;
    }

    this.disabledModelIds.update((current) => {
      const next = new Set(current);
      enabled ? next.delete(id) : next.add(id);
      const snapshot = Array.from(next);
      this.persistDisabledModelIds(snapshot);
      return snapshot;
    });
  }

  enableAllModels(): void {
    this.disabledModelIds.set([]);
    this.persistDisabledModelIds([]);
  }

  streamModel(
    modelId: string,
    turns: ChatTurn[],
    opts: { maxTokens?: number; temperature?: number; system?: string }
  ) {
    const model = this.getModelById(modelId);
    if (model?.adapterId !== 'openrouter') {
      throw new Error(`Adapter for model ${modelId} not found or not supported.`);
    }

    return this.openrouterAdapter.streamChat(turns, {
      model: model.adapterModelId,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system
    });
  }

  private hydrateDisabledModelIds(): string[] {
    const storage = this.getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(MODEL_PREFERENCES_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as Partial<ModelPreferencesSnapshot>;
      return Array.isArray(parsed.disabledModelIds) ? parsed.disabledModelIds : [];
    } catch {
      return [];
    }
  }

  private persistDisabledModelIds(ids: string[]): void {
    const storage = this.getStorage();
    if (!storage) return;

    const payload: ModelPreferencesSnapshot = { disabledModelIds: ids };
    try {
      storage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private getStorage(): Storage | null {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }
}
