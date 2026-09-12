import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ChatThread, ReasoningConfig } from '@models/chat';
import { ChatAdaptersService } from '../../data/chat-adapters.service';
import { ChatThreadsService } from '../../data/chat-threads.service';
import { MessageStateService } from '../../data/message-state.service';
import { ModelSelectorComponent } from '@shared/ui/model-selector/model-selector.component';
import { LayoutService } from '@core/services/layout.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';

@Component({
  selector: 'app-chat-options',
  imports: [ModelSelectorComponent, ButtonDirective],
  templateUrl: './chat-options.component.html',
  styleUrl: './chat-options.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatOptionsComponent {
  private readonly numberFormatter = new Intl.NumberFormat();
  private readonly adapters = inject(ChatAdaptersService);
  private readonly threads = inject(ChatThreadsService);
  private readonly messageState = inject(MessageStateService);
  private readonly layoutService = inject(LayoutService);

  public readonly thread = input<ChatThread | undefined>();
  private readonly defaultReasoningConfig: ReasoningConfig = {
    enabled: false,
    effort: undefined,
    maxTokens: undefined,
    showInChat: false,
    captureInHistory: true,
    summaryVerbosity: 'auto'
  };

  protected readonly models = this.adapters.models;
  protected readonly isRightSidebarOpen = this.layoutService.isRightSidebarOpen;

  protected readonly preferredModelId = computed(() => {
    const currentThread = this.thread();
    if (!currentThread) {
      return null;
    }
    return this.adapters.resolveModelSelection(currentThread.preferredModelId ?? null).modelId;
  });

  protected readonly systemPrompt = computed(() => this.thread()?.systemPrompt ?? '');
  protected readonly temperature = computed(() => this.thread()?.temperature ?? 1);
  protected readonly selectedModel = computed(() => {
    const modelId = this.preferredModelId();
    return modelId ? this.adapters.getModelById(modelId) ?? null : null;
  });
  protected readonly selectedModelProvider = computed(() => {
    return this.selectedModel()?.providerId ?? 'OpenRouter';
  });
  protected readonly selectedModelContext = computed(() => {
    const contextLength = this.selectedModel()?.contextLength ?? 0;
    return contextLength > 0 ? `${this.formatNumber(contextLength)} tokens` : 'Unknown';
  });
  protected readonly selectedModelOutput = computed(() => {
    const maxTokens = this.selectedModel()?.capabilities.maxTokens ?? 0;
    return maxTokens > 0 ? `${this.formatNumber(maxTokens)} max output` : 'Output varies';
  });
  protected readonly selectedModelBadges = computed(() => {
    const model = this.selectedModel();
    if (!model) {
      return ['Loading'];
    }
    const badges = ['Streaming'];
    if (model.filterCapabilities.json || model.capabilities.jsonMode) {
      badges.push('JSON');
    }
    if (model.filterCapabilities.tools || model.capabilities.tools) {
      badges.push('Tools');
    }
    if (model.filterCapabilities.image) {
      badges.push('Image input');
    }
    return badges;
  });
  protected readonly systemPromptStats = computed(() => {
    const draft = this.systemPromptDraft().trim();
    if (!draft) {
      return 'No system payload';
    }
    return `${this.formatNumber(this.messageState.estimateTokens(draft) * 2)} estimated tokens`;
  });
  protected readonly reasoningConfig = computed<ReasoningConfig>(() => {
    const current = this.thread()?.reasoningConfig;
    return {
      ...this.defaultReasoningConfig,
      ...current
    };
  });
  protected readonly reasoningEnabled = computed(() => this.reasoningCapabilities()?.mandatory || this.reasoningConfig().enabled);
  protected readonly showReasoningInChat = computed(() => this.reasoningConfig().showInChat);
  protected readonly reasoningEffort = computed(() => this.reasoningCapabilities()?.efforts.includes(this.reasoningConfig().effort!) ? this.reasoningConfig().effort : '');
  protected readonly reasoningMaxTokens = computed(() => this.reasoningConfig().maxTokens);
  protected readonly captureInHistory = computed(() => this.reasoningConfig().captureInHistory);
  protected readonly reasoningSummary = computed(() => {
    if (!this.reasoningEnabled()) {
      return 'Off';
    }
    const visibility = this.showReasoningInChat() ? 'visible' : 'hidden';
    const capture = this.captureInHistory() ? 'captured' : 'not captured';
    return `${visibility}, ${capture}`;
  });
  protected readonly temperatureTone = computed(() => {
    const value = this.temperatureDraft() ?? this.temperature();
    if (value <= 0.3) {
      return 'Precise';
    }
    if (value <= 0.8) {
      return 'Balanced';
    }
    if (value <= 1.3) {
      return 'Exploratory';
    }
    return 'Divergent';
  });
  protected readonly supportsTemperature = computed(() => this.selectedModel()?.capabilities.supportedParameters.includes('temperature') ?? false);
  protected readonly supportsOutputLimit = computed(() => this.selectedModel()?.capabilities.supportedParameters.includes('max_tokens') ?? false);
  protected readonly reasoningCapabilities = computed(() => this.selectedModel()?.capabilities.reasoning);
  protected readonly supportsReasoningEffort = computed(() => !!this.reasoningCapabilities()?.efforts.length);
  protected readonly supportsReasoningMaxTokens = computed(() => this.reasoningCapabilities()?.maxTokens ?? false);
  protected readonly outputLimit = computed(() => Math.min(this.thread()?.maxOutputTokens ?? 4096, this.selectedModel()?.capabilities.maxTokens ?? 4096));

  protected handleOutputLimitChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim() ? Number(input.value) : undefined;
    if (value !== undefined && (!input.checkValidity() || !Number.isInteger(value))) {
      input.reportValidity();
      return;
    }
    const current = this.thread();
    if (current) void this.threads.updateThreadSettings(current.id, { maxOutputTokens: value });
  }

  protected handleResetTemperature(): void {
    this.temperatureDraft.set(undefined);
    this.handleSaveSettings();
  }

  private systemPromptDraft = signal('');
  private temperatureDraft = signal<number | undefined>(undefined);

  constructor() {
    // Initialize drafts from thread
    let lastSettings = '';
    effect(() => {
      const currentThread = this.thread();
      const settingsKey = JSON.stringify([currentThread?.id, currentThread?.systemPrompt, currentThread?.temperature]);
      if (settingsKey === lastSettings) return;
      lastSettings = settingsKey;
      if (currentThread) {
        this.systemPromptDraft.set(currentThread.systemPrompt ?? '');
        this.temperatureDraft.set(currentThread.temperature);
      }
    });
  }

  protected handleModelSelected(modelId: string): void {
    const current = this.thread();
    if (!current) {
      return;
    }
    void this.threads.setPreferredModel(current.id, modelId);
  }

  protected handleSystemPromptChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) {
      return;
    }
    this.systemPromptDraft.set(textarea.value);
    // Auto-resize textarea
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  protected handleTemperatureChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.temperatureDraft.set(value ? parseFloat(value) : undefined);
  }

  protected handleTemperaturePreset(value: number): void {
    this.temperatureDraft.set(value);
    this.handleSaveSettings();
  }

  protected handleReasoningToggle(event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    const enabled = checkbox.checked;
    this.persistReasoningConfig({
      enabled,
      showInChat: enabled ? true : false
    });
  }

  protected handleShowReasoningToggle(event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.persistReasoningConfig({ showInChat: checkbox.checked });
  }

  protected handleReasoningEffortChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    const value = select.value as ReasoningConfig['effort'];
    this.persistReasoningConfig({ effort: value || undefined, maxTokens: undefined });
  }

  protected handleReasoningMaxTokensChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement | null;
    if (!inputEl) {
      return;
    }
    const value = inputEl.value.trim();
    const parsed = value ? Number(value) : undefined;
    if (parsed !== undefined && (!inputEl.checkValidity() || !Number.isInteger(parsed))) {
      inputEl.reportValidity();
      return;
    }
    this.persistReasoningConfig({ maxTokens: parsed, effort: undefined });
  }

  protected handleCaptureInHistoryToggle(event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.persistReasoningConfig({ captureInHistory: checkbox.checked });
  }

  private persistReasoningConfig(patch: Partial<ReasoningConfig>): void {
    const current = this.thread();
    if (!current) {
      return;
    }
    const merged = {
      ...this.reasoningConfig(),
      ...patch
    };
    void this.threads.updateThreadSettings(current.id, { reasoningConfig: merged });
  }

  protected handleSaveSettings(): void {
    const current = this.thread();
    if (!current) {
      return;
    }
    void this.threads.updateThreadSettings(current.id, {
      systemPrompt: this.systemPromptDraft().trim() || undefined,
      temperature: this.temperatureDraft() ?? undefined
    });
  }

  protected handleToggleRightSidebar(): void {
    this.layoutService.toggleRightSidebar();
  }

  protected readonly systemPromptDraftValue = this.systemPromptDraft.asReadonly();
  protected readonly temperatureDraftValue = this.temperatureDraft.asReadonly();

  private formatNumber(value: number): string {
    return this.numberFormatter.format(Math.max(0, Math.round(value)));
  }
}
