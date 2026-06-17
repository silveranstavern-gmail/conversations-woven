import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ChatAdaptersService } from '@features/chat/data/chat-adapters.service';

@Component({
  selector: 'app-model-selector',
  templateUrl: './model-selector.component.html',
  styleUrl: './model-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.model-selector-host--compact]': 'compact()'
  }
})
export class ModelSelectorComponent {
  private readonly adapters = inject(ChatAdaptersService);

  public readonly disabled = input(false);
  public readonly selectedModelId = input<string | null>(null);
  public readonly customOptions = input<{ id: string; label: string }[]>([]);
  public readonly compact = input(false);

  public readonly modelSelected = output<string>();

  protected readonly selectedLabel = computed(() => {
    const id = this.selectedModelId();
    if (!id) {
      return null;
    }
    const match = this.displayModels().find((option) => option.id === id);
    return match?.label ?? id;
  });

  protected readonly selectedModel = computed(() => {
    const id = this.selectedModelId();
    if (!id) {
      return null;
    }
    return this.adapters.getModelById(id) ?? null;
  });

  protected readonly providerLabel = computed(() => {
    const model = this.selectedModel();
    return model?.providerId ?? null;
  });

  protected readonly displayModels = computed(() => {
    const custom = this.customOptions();
    const serviceModels = this.adapters.models();
    const allOptions = [...custom, ...serviceModels];

    const currentId = this.selectedModelId();
    
    // If the stored model ID exists but isn't in the list (e.g. models haven't loaded yet),
    // add it temporarily so the dropdown displays the ID instead of falling back to the first option.
    if (currentId && !allOptions.some((opt) => opt.id === currentId)) {
      return [
        ...allOptions,
        { id: currentId, label: currentId } // Use ID as label until real label loads
      ];
    }

    return allOptions;
  });

  protected readonly isDefault = (modelId: string) => this.adapters.isDefault(modelId);

  protected onModelChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    const next = select.value || null;
    if (next) {
      this.modelSelected.emit(next);
    }
  }
}

