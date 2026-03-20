import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ChatThread, ReasoningConfig } from '@models/chat';
import { ChatAdaptersService } from '../../data/chat-adapters.service';
import { ChatThreadsService } from '../../data/chat-threads.service';
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
  private readonly adapters = inject(ChatAdaptersService);
  private readonly threads = inject(ChatThreadsService);
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
    const available = this.models();
    // First check thread's preferred model
    const threadPreferred = currentThread.preferredModelId;
    if (threadPreferred && available.some((model) => model.id === threadPreferred)) {
      return threadPreferred;
    }
    // Then check for default model
    const defaultModel = this.adapters.defaultModel();
    if (defaultModel && available.some((model) => model.id === defaultModel.id)) {
      return defaultModel.id;
    }
    // Fallback to first available
    return available[0]?.id ?? null;
  });

  protected readonly systemPrompt = computed(() => this.thread()?.systemPrompt ?? '');
  protected readonly temperature = computed(() => this.thread()?.temperature ?? 1);
  protected readonly reasoningConfig = computed<ReasoningConfig>(() => {
    const current = this.thread()?.reasoningConfig;
    return {
      ...this.defaultReasoningConfig,
      ...current
    };
  });
  protected readonly reasoningEnabled = computed(() => this.reasoningConfig().enabled);
  protected readonly showReasoningInChat = computed(() => this.reasoningConfig().showInChat);
  protected readonly reasoningEffort = computed(() => this.reasoningConfig().effort ?? 'medium');
  protected readonly reasoningMaxTokens = computed(() => this.reasoningConfig().maxTokens);
  protected readonly captureInHistory = computed(() => this.reasoningConfig().captureInHistory);
  protected readonly reasoningSummaryVerbosity = computed(
    () => this.reasoningConfig().summaryVerbosity ?? 'auto'
  );
  protected readonly supportsReasoningEffort = computed(() => {
    const modelId = this.preferredModelId();
    if (!modelId) {
      return false;
    }
    const descriptor = this.adapters.getModelById(modelId);
    if (!descriptor) {
      return false;
    }
    const provider = descriptor.providerId.toLowerCase();
    return provider.includes('openai') || descriptor.id.toLowerCase().includes('gpt');
  });
  protected readonly supportsReasoningMaxTokens = computed(() => {
    const modelId = this.preferredModelId();
    if (!modelId) {
      return false;
    }
    const descriptor = this.adapters.getModelById(modelId);
    if (!descriptor) {
      return false;
    }
    const provider = descriptor.providerId.toLowerCase();
    return provider.includes('anthropic') || descriptor.id.toLowerCase().includes('claude');
  });

  private systemPromptDraft = signal('');
  private temperatureDraft = signal<number | undefined>(undefined);

  constructor() {
    // Initialize drafts from thread
    effect(() => {
      const currentThread = this.thread();
      if (currentThread) {
        this.systemPromptDraft.set(currentThread.systemPrompt ?? '');
        this.temperatureDraft.set(currentThread.temperature ?? 1);
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
    this.persistReasoningConfig({ effort: value });
  }

  protected handleReasoningMaxTokensChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement | null;
    if (!inputEl) {
      return;
    }
    const value = inputEl.value.trim();
    const parsed = value ? Number.parseInt(value, 10) : undefined;
    this.persistReasoningConfig({ maxTokens: Number.isNaN(parsed) ? undefined : parsed });
  }

  protected handleCaptureInHistoryToggle(event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.persistReasoningConfig({ captureInHistory: checkbox.checked });
  }

  protected handleReasoningSummaryVerbosityChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    const value = select.value as ReasoningConfig['summaryVerbosity'];
    this.persistReasoningConfig({ summaryVerbosity: value });
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
}

