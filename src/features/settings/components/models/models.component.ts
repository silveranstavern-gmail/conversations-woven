import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  ChatAdaptersService,
  ChatModelVisibilityOption
} from '@features/chat/data/chat-adapters.service';

@Component({
  selector: 'app-settings-models',
  imports: [DecimalPipe],
  templateUrl: './models.component.html',
  styleUrl: './models.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelsComponent {
  private readonly adapters = inject(ChatAdaptersService);

  protected readonly catalog = this.adapters.catalog;
  protected readonly totalCount = computed(() => this.catalog().length);
  protected readonly disabledCount = computed(
    () => this.catalog().filter((model) => !model.enabled).length
  );
  protected readonly enabledCount = computed(() => this.totalCount() - this.disabledCount());

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

  protected trackByModelId(_: number, model: ChatModelVisibilityOption): string {
    return model.id;
  }
}
