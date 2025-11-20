import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ChatModelOption } from '../../data/chat-adapters.service';
import { UserPreferencesService } from '@core/services/preference/user-preferences.service';
import { KeychainService } from '@core/services/keychain.service';
import { ModelSelectorComponent } from '@shared/ui/model-selector/model-selector.component';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

export interface ComposerSubmitPayload {
  content: string;
  modelId: string;
}

@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [DecimalPipe, ModelSelectorComponent, ButtonDirective, TooltipDirective],
  templateUrl: './composer.component.html',
  styleUrl: './composer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComposerComponent {
  private readonly preferences = inject(UserPreferencesService);
  private readonly keychain = inject(KeychainService);

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
  protected readonly sendHotkey = this.preferences.sendHotkey;
  protected readonly isUnlocked = this.keychain.isUnlocked;
  protected readonly storedProviders = this.keychain.storedProviders;
  protected readonly placeholderText = computed(() => {
    const mode = this.sendHotkey();
    return mode === 'enter' ? 'Enter to send, Shift+Enter for new line' : 'Ctrl/⌘ + Enter to send';
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
        // Use first model (which is already sorted: default first, then pinned, then rest)
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
    const hotkeyMode = this.sendHotkey();
    
    if (hotkeyMode === 'enter') {
      // Enter sends, Shift+Enter creates new line
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.onSubmit();
      }
      // Shift+Enter is allowed to create new line (default behavior)
    } else {
      // Ctrl/Cmd+Enter sends (original behavior)
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        this.onSubmit();
      }
    }
  }

  protected onModelChange(modelId: string): void {
    if (!modelId || modelId === this.selectedModelId()) {
      return;
    }
    this.selectedModelId.set(modelId);
    this.modelSelected.emit(modelId);
  }

  protected onDraftInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) {
      return;
    }
    this.draft.set(textarea.value);
  }
}
