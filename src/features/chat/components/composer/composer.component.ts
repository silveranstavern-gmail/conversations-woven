import { AfterViewInit, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { UserPreferencesService } from '@core/services/preference/user-preferences.service';
import { KeychainService } from '@core/services/keychain.service';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { ModelSelectorComponent } from '@shared/ui/model-selector/model-selector.component';
import { ContextIndicatorComponent } from '../context-indicator/context-indicator.component';

export interface ComposerSubmitPayload {
  content: string;
  modelId: string;
}

@Component({
  selector: 'app-composer',
  imports: [TooltipDirective, ButtonDirective, ModelSelectorComponent, ContextIndicatorComponent],
  templateUrl: './composer.component.html',
  styleUrl: './composer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComposerComponent implements AfterViewInit {
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  private readonly preferences = inject(UserPreferencesService);
  private readonly keychain = inject(KeychainService);

  public readonly disabled = input(false);
  public readonly draft = input('');
  public readonly modelId = input<string | null>(null);
  public readonly showToolbar = input(true);
  public readonly contextUsage = input<number | null>(null);
  public readonly contextLimit = input<number | null>(null);
  public readonly contextPending = input(0);
  public readonly contextModeLabel = input('Full history');
  public readonly contextModeDetail = input<string | null>(null);
  public readonly isContextSelectionActive = input(false);

  public readonly draftChange = output<string>();
  public readonly submitMessage = output<ComposerSubmitPayload>();
  public readonly modelSelected = output<string>();
  public readonly contextModeToggled = output<void>();

  protected readonly sendHotkey = this.preferences.sendHotkey;
  protected readonly isUnlocked = this.keychain.isUnlocked;
  protected readonly storedProviders = this.keychain.storedProviders;
  protected readonly placeholderText = computed(() => {
    // Check if sending is blocked due to lock/keychain issues
    if (!this.isUnlocked()) {
      const hasStoredKeys = this.storedProviders().length > 0;
      if (!hasStoredKeys) {
        return 'No API key configured. Configure API keys in settings';
      }
      return 'Application is locked. Unlock to send messages';
    }

    // If unlocked and can send, show normal placeholder
    const mode = this.sendHotkey();
    return mode === 'enter' ? 'Enter to send, Shift+Enter for new line' : 'Ctrl/⌘ + Enter to send';
  });

  protected readonly showContextIndicator = computed(
    () => this.showToolbar() && (this.contextUsage() !== null || this.contextLimit() !== null)
  );

  protected readonly isSendDisabled = computed(() => {
    return this.disabled() || !this.draft().trim() || !this.modelId() || !this.isUnlocked();
  });

  protected readonly sendTooltipMessage = computed(() => {
    if (!this.isSendDisabled()) {
      return null;
    }
    // Unlock/Key messages are handled by TooltipDirective via [requiresUnlock]="true"

    if (!this.modelId()) {
      return 'Select a model to send messages';
    }
    if (!this.draft().trim()) {
      return 'Enter a message to send';
    }
    if (this.disabled()) {
      return 'Sending messages is currently disabled';
    }
    return null; // Allow default fallbacks if any
  });

  protected handleModelSelected(modelId: string): void {
    this.modelSelected.emit(modelId);
  }

  protected handleContextModeToggle(): void {
    this.contextModeToggled.emit();
  }

  protected onSubmit(): void {
    if (this.isSendDisabled() || !this.draft().trim() || this.disabled()) {
      return;
    }
    const modelId = this.modelId();
    if (!modelId) {
      return;
    }
    this.submitMessage.emit({
      content: this.draft().trim(),
      modelId
    });
  }

  constructor() {
    effect(() => {
      this.draft();
      queueMicrotask(() => this.autoResize());
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const hotkeyMode = this.sendHotkey();
    
    if (hotkeyMode === 'enter') {
      // Enter sends, Shift+Enter creates new line
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!this.isSendDisabled()) {
          this.onSubmit();
        }
      }
      // Shift+Enter is allowed to create new line (default behavior)
    } else {
      // Ctrl/Cmd+Enter sends (original behavior)
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!this.isSendDisabled()) {
          this.onSubmit();
        }
      }
    }
  }

  ngAfterViewInit(): void {
    this.autoResize();
  }

  protected onDraftInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) {
      return;
    }
    this.setDraft(textarea.value);
    this.autoResize();
  }

  private setDraft(value: string): void {
    if (value === this.draft()) {
      return;
    }
    this.draftChange.emit(value);
  }

  private autoResize(): void {
    const ref = this.textareaRef();
    if (!ref) {
      return;
    }
    const el = ref.nativeElement;
    el.style.height = 'auto';
    const maxHeight = Number.parseFloat(getComputedStyle(el).maxHeight);
    const nextHeight = Number.isFinite(maxHeight) && maxHeight > 0
      ? Math.min(el.scrollHeight, maxHeight)
      : el.scrollHeight;

    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > nextHeight ? 'auto' : 'hidden';
  }
}
