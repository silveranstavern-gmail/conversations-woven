import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ChatThread } from '@models/chat';
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

