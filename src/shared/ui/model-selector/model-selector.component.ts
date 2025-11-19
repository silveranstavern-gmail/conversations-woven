import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ChatAdaptersService } from '@features/chat/data/chat-adapters.service';

@Component({
  selector: 'app-model-selector',
  standalone: true,
  templateUrl: './model-selector.component.html',
  styleUrl: './model-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelSelectorComponent {
  private readonly adapters = inject(ChatAdaptersService);

  public readonly disabled = input(false);
  public readonly selectedModelId = input<string | null>(null);
  public readonly customOptions = input<{ id: string; label: string }[]>([]);

  public readonly modelSelected = output<string>();

  protected readonly displayModels = computed(() => {
    const custom = this.customOptions();
    const serviceModels = this.adapters.models();
    return [...custom, ...serviceModels];
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

