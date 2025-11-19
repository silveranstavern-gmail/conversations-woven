import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SystemPromptsService } from '@core/services/system-prompts.service';
import { ChatAdaptersService } from '@features/chat/data/chat-adapters.service';
import { ChatThreadsService } from '@features/chat/data/chat-threads.service';
import { ModelSelectorComponent } from '@shared/ui/model-selector/model-selector.component';
import { UserPreferencesService, SystemPromptUseCase } from '@core/services/preference/user-preferences.service';

@Component({
  selector: 'app-system-prompts',
  imports: [ModelSelectorComponent],
  templateUrl: './system-prompts.component.html',
  styleUrl: './system-prompts.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SystemPromptsComponent {
  private readonly systemPrompts = inject(SystemPromptsService);
  private readonly adapters = inject(ChatAdaptersService);
  private readonly threads = inject(ChatThreadsService);
  private readonly preferences = inject(UserPreferencesService);

  protected readonly useCases: SystemPromptUseCase[] = ['compactor', 'metadata'];
  protected readonly selectedUseCase = this.preferences.systemPromptsUseCase;

  protected readonly compactor = this.systemPrompts.compactor;
  protected readonly metadata = this.systemPrompts.metadata;
  protected readonly models = this.adapters.models;

  protected readonly defaultModelOption = [{ id: 'default', label: 'Default' }];

  protected readonly currentChatModelId = computed(() => {
    const activeThread = this.threads.activeThread();
    if (!activeThread) {
      return null;
    }
    const available = this.models();
    const candidate = activeThread.preferredModelId;
    if (candidate && available.some((model) => model.id === candidate)) {
      return candidate;
    }
    return available[0]?.id ?? null;
  });

  protected readonly effectiveModelId = computed(() => {
    const useCase = this.selectedUseCase();
    if (useCase === 'compactor') {
      const compactor = this.compactor();
      if (compactor.modelId === 'default') {
        return this.currentChatModelId();
      }
      return compactor.modelId;
    } else {
      const metadata = this.metadata();
      if (metadata.modelId === 'default') {
        return this.currentChatModelId();
      }
      return metadata.modelId;
    }
  });

  protected readonly effectiveModelLabel = computed(() => {
    const modelId = this.effectiveModelId();
    if (!modelId) {
      return null;
    }
    const model = this.models().find((m) => m.id === modelId);
    return model?.label ?? null;
  });

  protected onUseCaseChange(useCase: SystemPromptUseCase): void {
    this.preferences.setSystemPromptsUseCase(useCase);
  }

  protected onPromptChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    if (textarea) {
      this.systemPrompts.setCompactorPrompt(textarea.value);
    }
  }

  protected onModelChange(modelId: string): void {
    this.systemPrompts.setCompactorModel(modelId as string | 'default');
  }

  protected onMaxTokensChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      this.systemPrompts.setCompactorMaxTokens(Number(input.value));
    }
  }

  protected onTemperatureChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      this.systemPrompts.setCompactorTemperature(Number(input.value));
    }
  }

  protected onMetadataPromptChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    if (textarea) {
      this.systemPrompts.setMetadataPrompt(textarea.value);
    }
  }

  protected onMetadataModelChange(modelId: string): void {
    this.systemPrompts.setMetadataModel(modelId as string | 'default');
  }

  protected onMetadataMaxTokensChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      this.systemPrompts.setMetadataMaxTokens(Number(input.value));
    }
  }

  protected onMetadataTemperatureChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      this.systemPrompts.setMetadataTemperature(Number(input.value));
    }
  }

  protected restoreToDefaults(): void {
    this.systemPrompts.resetCompactorToDefaults();
  }

  protected restoreMetadataToDefaults(): void {
    this.systemPrompts.resetMetadataToDefaults();
  }
}

