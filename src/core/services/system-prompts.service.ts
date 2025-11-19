import { inject, Injectable, signal } from '@angular/core';

export type SystemPromptUseCase = 'compactor' | 'metadata';

interface CompactorSettings {
  prompt: string;
  modelId: string | 'default';
  maxTokens: number;
  temperature: number;
}

interface MetadataSettings {
  prompt: string;
  modelId: string | 'default';
  maxTokens: number;
  temperature: number;
}

interface SystemPromptsSnapshot {
  compactor: CompactorSettings;
  metadata: MetadataSettings;
}

const STORAGE_KEY = 'system-prompts';
const DEFAULT_COMPACTOR_PROMPT = `You are a reversible summarizer. Given N consecutive messages, produce a concise summary that preserves:
- factual details
- variable names, code blocks, and error messages verbatim
- user intent and assistant commitments
Output MUST be plain markdown without HTML. Do not invent details.`;

const DEFAULT_METADATA_PROMPT = `You are a metadata generator for chat conversations. Given a conversation, generate:
1. A concise, descriptive title (max 60 characters)
2. 3-5 relevant tags (single words or short phrases, lowercase, separated by commas)
3. A brief summary (2-3 sentences)

Respond in JSON format:
{
  "title": "string",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "string"
}`;

const DEFAULT_SETTINGS: SystemPromptsSnapshot = {
  compactor: {
    prompt: DEFAULT_COMPACTOR_PROMPT,
    modelId: 'default',
    maxTokens: 5000,
    temperature: 0.3
  },
  metadata: {
    prompt: DEFAULT_METADATA_PROMPT,
    modelId: 'default',
    maxTokens: 1000,
    temperature: 0.5
  }
};

@Injectable({
  providedIn: 'root'
})
export class SystemPromptsService {
  private readonly compactorSettingsSignal = signal<CompactorSettings>(DEFAULT_SETTINGS.compactor);
  private readonly metadataSettingsSignal = signal<MetadataSettings>(DEFAULT_SETTINGS.metadata);

  readonly compactor = this.compactorSettingsSignal.asReadonly();
  readonly metadata = this.metadataSettingsSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  setCompactorPrompt(prompt: string): void {
    this.compactorSettingsSignal.update((current) => ({ ...current, prompt }));
    this.persist();
  }

  setCompactorModel(modelId: string | 'default'): void {
    this.compactorSettingsSignal.update((current) => ({ ...current, modelId }));
    this.persist();
  }

  setCompactorMaxTokens(maxTokens: number): void {
    const clamped = Math.min(100000, Math.max(100, Number.isFinite(maxTokens) ? maxTokens : 5000));
    this.compactorSettingsSignal.update((current) => ({ ...current, maxTokens: clamped }));
    this.persist();
  }

  setCompactorTemperature(temperature: number): void {
    const clamped = Math.min(2, Math.max(0, Number.isFinite(temperature) ? temperature : 0.3));
    this.compactorSettingsSignal.update((current) => ({ ...current, temperature: clamped }));
    this.persist();
  }

  resetCompactorToDefaults(): void {
    this.compactorSettingsSignal.set(DEFAULT_SETTINGS.compactor);
    this.persist();
  }

  setMetadataPrompt(prompt: string): void {
    this.metadataSettingsSignal.update((current) => ({ ...current, prompt }));
    this.persist();
  }

  setMetadataModel(modelId: string | 'default'): void {
    this.metadataSettingsSignal.update((current) => ({ ...current, modelId }));
    this.persist();
  }

  setMetadataMaxTokens(maxTokens: number): void {
    const clamped = Math.min(100000, Math.max(100, Number.isFinite(maxTokens) ? maxTokens : 1000));
    this.metadataSettingsSignal.update((current) => ({ ...current, maxTokens: clamped }));
    this.persist();
  }

  setMetadataTemperature(temperature: number): void {
    const clamped = Math.min(2, Math.max(0, Number.isFinite(temperature) ? temperature : 0.5));
    this.metadataSettingsSignal.update((current) => ({ ...current, temperature: clamped }));
    this.persist();
  }

  resetMetadataToDefaults(): void {
    this.metadataSettingsSignal.set(DEFAULT_SETTINGS.metadata);
    this.persist();
  }

  private hydrateFromStorage(): void {
    const entry = this.getStorage()?.getItem(STORAGE_KEY);
    if (!entry) {
      return;
    }
    try {
      const parsed = JSON.parse(entry) as Partial<SystemPromptsSnapshot>;
      if (parsed.compactor) {
        const compactor = parsed.compactor;
        this.compactorSettingsSignal.set({
          prompt: typeof compactor.prompt === 'string' ? compactor.prompt : DEFAULT_SETTINGS.compactor.prompt,
          modelId: compactor.modelId === 'default' || (typeof compactor.modelId === 'string' && compactor.modelId.length > 0) ? compactor.modelId : 'default',
          maxTokens: typeof compactor.maxTokens === 'number' ? compactor.maxTokens : DEFAULT_SETTINGS.compactor.maxTokens,
          temperature: typeof compactor.temperature === 'number' ? compactor.temperature : DEFAULT_SETTINGS.compactor.temperature
        });
      }
      if (parsed.metadata) {
        const metadata = parsed.metadata;
        this.metadataSettingsSignal.set({
          prompt: typeof metadata.prompt === 'string' ? metadata.prompt : DEFAULT_SETTINGS.metadata.prompt,
          modelId: metadata.modelId === 'default' || (typeof metadata.modelId === 'string' && metadata.modelId.length > 0) ? metadata.modelId : 'default',
          maxTokens: typeof metadata.maxTokens === 'number' ? metadata.maxTokens : DEFAULT_SETTINGS.metadata.maxTokens,
          temperature: typeof metadata.temperature === 'number' ? metadata.temperature : DEFAULT_SETTINGS.metadata.temperature
        });
      }
    } catch {
      // ignore corrupt data
    }
  }

  private persist(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    const payload: SystemPromptsSnapshot = {
      compactor: this.compactorSettingsSignal(),
      metadata: this.metadataSettingsSignal()
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
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

