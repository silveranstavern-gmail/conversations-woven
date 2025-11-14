import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ChatModelOption } from '../../data/chat-adapters.service';

export interface ComposerSubmitPayload {
  content: string;
  modelId: string;
}

@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './composer.component.html',
  styleUrl: './composer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComposerComponent {
  public readonly disabled = input(false);
  public readonly models = input<ChatModelOption[]>([]);
  public readonly selectedModelIdInput = input<string | null>(null, { alias: 'selectedModelId' });

  public readonly submitMessage = output<ComposerSubmitPayload>();
  public readonly modelSelected = output<string>();

  protected readonly draft = signal('');
  protected readonly selectedModelId = signal<string | null>(null);
  protected readonly activeModel = computed(() => {
    const currentId = this.selectedModelId();
    return this.models().find((option) => option.id === currentId) ?? null;
  });

  constructor() {
    effect(() => {
      const options = this.models();
      const incoming = this.selectedModelIdInput();
      const first = options[0]?.id ?? null;

      if (!options.length) {
        this.selectedModelId.set(null);
        return;
      }

      if (incoming && options.some((option) => option.id === incoming)) {
        this.selectedModelId.set(incoming);
        return;
      }

      const current = this.selectedModelId();
      if (!current || !options.some((option) => option.id === current)) {
        this.selectedModelId.set(first);
      }
    });
  }

  protected onSubmit(): void {
    const modelId = this.selectedModelId();
    if (!this.draft().trim() || this.disabled() || !modelId) {
      return;
    }
    this.submitMessage.emit({
      content: this.draft().trim(),
      modelId
    });
    this.draft.set('');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.onSubmit();
    }
  }

  protected onModelChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    const next = select.value || null;
    if (!next || next === this.selectedModelId()) {
      return;
    }
    this.selectedModelId.set(next);
    this.modelSelected.emit(next);
  }

  protected onDraftInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) {
      return;
    }
    this.draft.set(textarea.value);
  }
}
