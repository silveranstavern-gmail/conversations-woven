import { computed, inject, Injectable, signal } from '@angular/core';
import { LlmCapabilities, LlmModelDescriptor, ChatTurn, LLM_ADAPTER_TOKEN } from '../adapters/llm-adapter';
import { ModelCardData } from '@features/settings/components/models/model-card.model';

export interface ChatModelOption {
  id: string;
  label: string;
  adapterId: string;
  adapterLabel: string;
  adapterModelId: string;
  capabilities: LlmCapabilities;
  details?: ModelCardData;
}

export interface ChatModelVisibilityOption extends ChatModelOption {
  enabled: boolean;
}

interface ModelPreferencesSnapshot {
  disabledModelIds: string[];
  defaultModelId?: string;
  pinnedModelIds: string[];
}

const MODEL_PREFERENCES_KEY = 'model-preferences';

@Injectable({
  providedIn: 'root'
})
export class ChatAdaptersService {
  private readonly adapters = inject(LLM_ADAPTER_TOKEN);

  private readonly allModelsSignal = signal<ChatModelOption[]>([]);

  private readonly disabledModelIds = signal<string[]>(this.hydrateDisabledModelIds());
  private readonly defaultModelId = signal<string | null>(this.hydrateDefaultModelId());
  private readonly pinnedModelIds = signal<string[]>(this.hydratePinnedModelIds());

  public readonly catalog = computed(() => {
    const disabled = new Set(this.disabledModelIds());
    return this.allModelsSignal().map((model) => ({
      ...model,
      enabled: !disabled.has(model.id)
    }));
  });

  public readonly models = computed<ChatModelOption[]>(() => {
    const catalog = this.catalog();
    const enabled = catalog
      .filter((model) => model.enabled)
      .map(({ enabled: _enabled, ...rest }) => rest);
    
    // Sort: default first, then pinned, then rest
    const defaultId = this.defaultModelId();
    const pinned = new Set(this.pinnedModelIds());
    
    return enabled.sort((a, b) => {
      if (a.id === defaultId) return -1;
      if (b.id === defaultId) return 1;
      const aPinned = pinned.has(a.id);
      const bPinned = pinned.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return a.label.localeCompare(b.label); // Alphabetical fallback
    });
  });

  public readonly defaultModel = computed(() => {
    const defaultId = this.defaultModelId();
    if (!defaultId) return null;
    return this.models().find(m => m.id === defaultId) ?? null;
  });

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
          tools: model.supported_parameters?.includes('tools') ?? model.supported_features?.includes('tools') ?? false,
          jsonMode: model.supported_parameters?.includes('response_format') ?? model.supported_features?.includes('json_mode') ?? false,
          maxTokens: model.top_provider?.max_completion_tokens ?? model.context_length ?? 8000
        },
        details: {
          description: model.description ?? '',
          pricing: {
            prompt: model.pricing?.prompt ?? 0,
            completion: model.pricing?.completion ?? 0,
            request: model.pricing?.request ?? 0,
            image: model.pricing?.image ?? 0,
          },
          contextLength: model.context_length ?? 0,
          architecture: {
            modality: model.architecture?.modality ?? '',
            input_modalities: model.architecture?.input_modalities ?? [],
            output_modalities: model.architecture?.output_modalities ?? [],
          },
        },
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

  disableAllModels(): void {
    const allModelIds = this.allModelsSignal().map((model) => model.id);
    this.disabledModelIds.set(allModelIds);
    this.persistDisabledModelIds(allModelIds);
  }

  enableFreeModels(): void {
    const freeModelIds = this.allModelsSignal()
      .filter((model) => model.label.toLowerCase().includes('(free)'))
      .map((model) => model.id);

    if (freeModelIds.length === 0) {
      return;
    }

    this.disabledModelIds.update((current) => {
      const next = new Set(current);
      freeModelIds.forEach((id) => next.delete(id));
      const snapshot = Array.from(next);
      this.persistDisabledModelIds(snapshot);
      return snapshot;
    });
  }

  setDefaultModel(modelId: string | null): void {
    if (modelId && !this.allModelsSignal().some((model) => model.id === modelId)) {
      return;
    }
    this.defaultModelId.set(modelId);
    this.persistPreferences();
  }

  togglePinModel(modelId: string): void {
    if (!this.allModelsSignal().some((model) => model.id === modelId)) {
      return;
    }
    this.pinnedModelIds.update((current) => {
      const next = new Set(current);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      const snapshot = Array.from(next);
      this.persistPinnedModelIds(snapshot);
      return snapshot;
    });
  }

  isPinned(modelId: string): boolean {
    return this.pinnedModelIds().includes(modelId);
  }

  isDefault(modelId: string): boolean {
    return this.defaultModelId() === modelId;
  }

  streamModel(
    modelId: string,
    turns: ChatTurn[],
    opts: { maxTokens?: number; temperature?: number; system?: string }
  ) {
    const model = this.getModelById(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found.`);
    }

    const adapter = this.adapters.find(a => a.id === model.adapterId);
    if (!adapter) {
      throw new Error(`Adapter for model ${modelId} (adapterId: ${model.adapterId}) not found.`);
    }

    return adapter.streamChat(turns, {
      model: model.adapterModelId,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system
    });
  }

  generateText(
    modelId: string,
    turns: ChatTurn[],
    opts: { maxTokens?: number; temperature?: number; system?: string }
  ): Promise<string> {
    const model = this.getModelById(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found.`);
    }

    const adapter = this.adapters.find(a => a.id === model.adapterId);
    if (!adapter) {
      throw new Error(`Adapter for model ${modelId} (adapterId: ${model.adapterId}) not found.`);
    }

    return adapter.generateText(turns, {
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

  private hydrateDefaultModelId(): string | null {
    const storage = this.getStorage();
    if (!storage) return null;

    try {
      const raw = storage.getItem(MODEL_PREFERENCES_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<ModelPreferencesSnapshot>;
      return typeof parsed.defaultModelId === 'string' ? parsed.defaultModelId : null;
    } catch {
      return null;
    }
  }

  private hydratePinnedModelIds(): string[] {
    const storage = this.getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(MODEL_PREFERENCES_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as Partial<ModelPreferencesSnapshot>;
      return Array.isArray(parsed.pinnedModelIds) ? parsed.pinnedModelIds : [];
    } catch {
      return [];
    }
  }

  private persistDisabledModelIds(ids: string[]): void {
    this.persistPreferences({ disabledModelIds: ids });
  }

  private persistPinnedModelIds(ids: string[]): void {
    this.persistPreferences({ pinnedModelIds: ids });
  }

  private persistPreferences(updates?: Partial<ModelPreferencesSnapshot>): void {
    const storage = this.getStorage();
    if (!storage) return;

    const current: ModelPreferencesSnapshot = {
      disabledModelIds: this.disabledModelIds(),
      defaultModelId: this.defaultModelId() ?? undefined,
      pinnedModelIds: this.pinnedModelIds()
    };

    const payload: ModelPreferencesSnapshot = { ...current, ...updates };
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
