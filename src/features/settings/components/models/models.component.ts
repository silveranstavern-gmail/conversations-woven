import { DecimalPipe, SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ChatAdaptersService,
  ChatModelVisibilityOption
} from '@features/chat/data/chat-adapters.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

@Component({
  selector: 'app-settings-models',
  imports: [DecimalPipe, SlicePipe, ButtonDirective, TooltipDirective],
  templateUrl: './models.component.html',
  styleUrl: './models.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelsComponent {
  private readonly adapters = inject(ChatAdaptersService);

  protected readonly searchTerm = signal('');
  protected readonly catalog = this.adapters.catalog;
  protected readonly totalCount = computed(() => this.catalog().length);
  protected readonly disabledCount = computed(
    () => this.catalog().filter((model) => !model.enabled).length
  );
  protected readonly enabledCount = computed(() => this.totalCount() - this.disabledCount());
  protected readonly freeModels = computed(() =>
    this.catalog().filter((model) => model.label.toLowerCase().includes('(free)'))
  );
  protected readonly freeModelsCount = computed(() => this.freeModels().length);
  protected readonly enabledFreeCount = computed(
    () => this.freeModels().filter((model) => model.enabled).length
  );
  protected readonly filteredCatalog = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) {
      return this.catalog();
    }
    return this.catalog().filter(
      (model) =>
        model.label.toLowerCase().includes(term) ||
        model.adapterLabel.toLowerCase().includes(term) ||
        model.id.toLowerCase().includes(term)
    );
  });

  protected handleToggleModel(modelId: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.adapters.setModelEnabled(modelId, checkbox.checked);
  }

  protected handleEnableAll(): void {
    if (this.disabledCount() === 0) {
      return;
    }
    this.adapters.enableAllModels();
  }

  protected handleDisableAll(): void {
    if (this.enabledCount() === 0) {
      return;
    }
    this.adapters.disableAllModels();
  }

  protected handleEnableFree(): void {
    if (this.enabledFreeCount() === this.freeModelsCount()) {
      return;
    }
    this.adapters.enableFreeModels();
  }

  protected trackByModelId(_: number, model: ChatModelVisibilityOption): string {
    return model.id;
  }

  protected handleSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  protected handleSetDefault(modelId: string): void {
    const isDefault = this.adapters.isDefault(modelId);
    this.adapters.setDefaultModel(isDefault ? null : modelId);
  }

  protected handleTogglePin(modelId: string): void {
    this.adapters.togglePinModel(modelId);
  }

  protected isDefault(modelId: string): boolean {
    return this.adapters.isDefault(modelId);
  }

  protected isPinned(modelId: string): boolean {
    return this.adapters.isPinned(modelId);
  }
}
