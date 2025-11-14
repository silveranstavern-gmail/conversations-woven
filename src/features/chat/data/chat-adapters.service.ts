import { Injectable, Signal, computed, signal } from '@angular/core';
import { LLM_ADAPTER_MAP, LLM_MODELS, LLM_MODEL_MAP } from '../adapters/adapters.registry';
import { ChatTurn, LlmCapabilities } from '../adapters/llm-adapter';

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
  private readonly baseModels: ChatModelOption[] = LLM_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    adapterId: model.adapterId,
    adapterLabel: LLM_ADAPTER_MAP.get(model.adapterId)?.label ?? model.adapterId,
    adapterModelId: model.adapterModelId,
    capabilities: model.capabilities
  }));

  private readonly disabledModelIds = signal<string[]>(this.hydrateDisabledModelIds());

  private readonly catalogSignal: Signal<ChatModelVisibilityOption[]> = computed(() => {
    const disabled = new Set(this.disabledModelIds());
    return this.baseModels.map((model) => ({
      ...model,
      enabled: !disabled.has(model.id)
    }));
  });

  readonly catalog = this.catalogSignal;

  readonly models = computed<ChatModelOption[]>(() =>
    this.catalogSignal()
      .filter((model) => model.enabled)
      .map(({ enabled: _enabled, ...rest }) => rest)
  );

  getModelById(id: string): ChatModelOption | undefined {
    const match = this.catalogSignal().find((model) => model.id === id);
    if (!match) {
      return undefined;
    }
    const { enabled: _enabled, ...rest } = match;
    return rest;
  }

  setModelEnabled(id: string, enabled: boolean): void {
    if (!this.baseModels.some((model) => model.id === id)) {
      return;
    }
    this.disabledModelIds.update((current) => {
      const next = new Set(current);
      if (enabled) {
        next.delete(id);
      } else {
        next.add(id);
      }
      const snapshot = Array.from(next);
      this.persistDisabledModelIds(snapshot);
      return snapshot;
    });
  }

  enableAllModels(): void {
    this.disabledModelIds.set([]);
    this.persistDisabledModelIds([]);
  }

  async streamModel(
    modelId: string,
    turns: ChatTurn[],
    opts: { maxTokens?: number; temperature?: number }
  ) {
    const descriptor = LLM_MODEL_MAP.get(modelId);
    if (!descriptor) {
      throw new Error(`Unknown model ${modelId}`);
    }
    const adapter = LLM_ADAPTER_MAP.get(descriptor.adapterId);
    if (!adapter) {
      throw new Error(`Missing adapter ${descriptor.adapterId}`);
    }
    return adapter.streamChat(turns, {
      model: descriptor.adapterModelId,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature
    });
  }

  private hydrateDisabledModelIds(): string[] {
    const storage = this.getStorage();
    if (!storage) {
      return [];
    }
    try {
      const raw = storage.getItem(MODEL_PREFERENCES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Partial<ModelPreferencesSnapshot>;
      const disabled = Array.isArray(parsed.disabledModelIds) ? parsed.disabledModelIds : [];
      const validIds = disabled.filter((id): id is string =>
        this.baseModels.some((model) => model.id === id)
      );
      return Array.from(new Set(validIds));
    } catch {
      return [];
    }
  }

  private persistDisabledModelIds(ids: string[]): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    const payload: ModelPreferencesSnapshot = {
      disabledModelIds: ids
    };
    try {
      storage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota issues
    }
  }

  private getStorage(): Storage | null {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
      return null;
    }
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }
}
