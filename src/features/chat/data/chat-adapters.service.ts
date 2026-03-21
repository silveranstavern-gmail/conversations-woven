import { computed, inject, Injectable, signal } from '@angular/core';
import {
  LlmCapabilities,
  LlmModelDescriptor,
  ChatTurn,
  LLM_ADAPTER_TOKEN,
  StreamChatOptions,
  GenerateTextOptions
} from '../adapters/llm-adapter';
import { ModelCardData } from '@features/settings/components/models/model-card.model';

export interface ChatModelOption {
  id: string;
  label: string;
  adapterId: string;
  adapterLabel: string;
  adapterModelId: string;
  capabilities: LlmCapabilities;
  details?: ModelCardData;
  // Derived fields for easier filtering and sorting
  providerId: string;
  contextLength: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  filterCapabilities: {
    image: boolean;
    video: boolean;
    tools: boolean;
    json: boolean;
  };
  created: number; // Timestamp for "Newest" sort
}

export interface ChatModelVisibilityOption extends ChatModelOption {
  enabled: boolean;
}

export interface ResolvedChatModelSelection {
  modelId: string | null;
  model: ChatModelOption | null;
  source: 'thread' | 'default' | 'first-available' | 'unresolved';
}

export interface ModelPreset {
  version: 1;
  exportedAt: string;
  disabledModelIds: string[];
  defaultModelId: string | null;
  pinnedModelIds: string[];
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
  public readonly pinnedModelIds = signal<string[]>(this.hydratePinnedModelIds());

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

      const models: ChatModelOption[] = data.map((model: any) => {
        // 1. Parse Provider (e.g., "anthropic" from "anthropic/claude...")
        const providerId = model.id.split('/')[0] || 'unknown';
        
        // 2. Parse Capabilities based on JSON structure
        const inputModalities = model.architecture?.input_modalities || [];
        const supportedParams = model.supported_parameters || [];
        
        // 3. Parse Pricing (Strings to Floats)
        const promptPrice = parseFloat(model.pricing?.prompt || '0');
        const completionPrice = parseFloat(model.pricing?.completion || '0');

        return {
          id: model.id,
          label: model.name,
          adapterId: 'openrouter',
          adapterLabel: 'OpenRouter',
          adapterModelId: model.id,
          providerId,
          created: model.created || 0,
          contextLength: model.context_length || 0,
          pricing: {
            prompt: promptPrice,
            completion: completionPrice
          },
          filterCapabilities: {
            image: inputModalities.includes('image'),
            video: inputModalities.includes('video'),
            tools: supportedParams.includes('tools') || model.supported_features?.includes('tools') || false,
            json: supportedParams.includes('response_format') || model.supported_features?.includes('json_mode') || supportedParams.includes('structured_outputs') || false
          },
          capabilities: {
            streaming: true, // Assume all OpenRouter models support streaming
            tools: supportedParams.includes('tools') || model.supported_features?.includes('tools') || false,
            jsonMode: supportedParams.includes('response_format') || model.supported_features?.includes('json_mode') || false,
            maxTokens: model.top_provider?.max_completion_tokens ?? model.context_length ?? 8000
          },
          details: {
            description: model.description ?? '',
            pricing: {
              prompt: promptPrice,
              completion: completionPrice,
              request: parseFloat(model.pricing?.request || '0'),
              image: parseFloat(model.pricing?.image || '0'),
            },
            contextLength: model.context_length ?? 0,
            architecture: {
              modality: model.architecture?.modality ?? '',
              input_modalities: inputModalities,
              output_modalities: model.architecture?.output_modalities ?? [],
            },
          },
        };
      });

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

  resolveModelSelection(preferredModelId?: string | null): ResolvedChatModelSelection {
    const enabledModels = this.models();

    if (preferredModelId) {
      const preferred = enabledModels.find((model) => model.id === preferredModelId);
      if (preferred) {
        return {
          modelId: preferred.id,
          model: preferred,
          source: 'thread'
        };
      }

      // Preserve the thread's explicit choice while the model catalog is still loading.
      if (enabledModels.length === 0) {
        return {
          modelId: preferredModelId,
          model: null,
          source: 'unresolved'
        };
      }
    }

    const defaultModel = this.defaultModel();
    if (defaultModel) {
      return {
        modelId: defaultModel.id,
        model: defaultModel,
        source: 'default'
      };
    }

    const firstModel = enabledModels[0] ?? null;
    if (firstModel) {
      return {
        modelId: firstModel.id,
        model: firstModel,
        source: 'first-available'
      };
    }

    return {
      modelId: null,
      model: null,
      source: 'unresolved'
    };
  }

  setModelEnabled(id: string, enabled: boolean): void {
    if (!this.allModelsSignal().some((model) => model.id === id)) {
      return;
    }

    // If disabling, remove from pinned and default
    if (!enabled) {
      // Remove from pinned
      if (this.isPinned(id)) {
        this.pinnedModelIds.update((current) => {
          const next = new Set(current);
          next.delete(id);
          const snapshot = Array.from(next);
          this.persistPinnedModelIds(snapshot);
          return snapshot;
        });
      }
      
      // Remove from default
      if (this.isDefault(id)) {
        this.defaultModelId.set(null);
        this.persistPreferences();
      }
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
    
    // Clear all pinned and default models when disabling all
    this.pinnedModelIds.set([]);
    this.defaultModelId.set(null);
    this.persistPreferences();
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
    opts: Omit<StreamChatOptions, 'model'> = {}
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
      system: opts.system,
      reasoning: opts.reasoning
    });
  }

  generateText(
    modelId: string,
    turns: ChatTurn[],
    opts: Omit<GenerateTextOptions, 'model'> = {}
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
      system: opts.system,
      jsonMode: opts.jsonMode
    });
  }

  createModelPreset(): ModelPreset {
    const disabledModelIds = this.catalog()
      .filter((model) => !model.enabled)
      .map((model) => model.id);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      disabledModelIds,
      defaultModelId: this.defaultModelId(),
      pinnedModelIds: [...this.pinnedModelIds()]
    };
  }

  applyModelPreset(preset: Partial<ModelPreset> | null | undefined): void {
    if (!preset || typeof preset !== 'object') {
      return;
    }

    const availableIds = new Set(this.allModelsSignal().map((model) => model.id));
    if (availableIds.size === 0) {
      return;
    }

    const nextDisabledIds = Array.isArray(preset.disabledModelIds)
      ? preset.disabledModelIds.filter((id) => availableIds.has(id))
      : [];
    const disabledSet = new Set(nextDisabledIds);

    const nextPinnedIds = Array.isArray(preset.pinnedModelIds)
      ? preset.pinnedModelIds.filter((id) => availableIds.has(id) && !disabledSet.has(id))
      : [];

    const defaultCandidate = preset.defaultModelId ?? null;
    const nextDefaultId =
      defaultCandidate && availableIds.has(defaultCandidate) && !disabledSet.has(defaultCandidate)
        ? defaultCandidate
        : null;

    this.disabledModelIds.set(nextDisabledIds);
    this.pinnedModelIds.set(nextPinnedIds);
    this.defaultModelId.set(nextDefaultId);
    this.persistPreferences();
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
