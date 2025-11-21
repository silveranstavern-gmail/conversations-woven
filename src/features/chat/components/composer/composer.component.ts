import { AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, ViewChild } from '@angular/core';
import { UserPreferencesService } from '@core/services/preference/user-preferences.service';
import { KeychainService } from '@core/services/keychain.service';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

export interface ComposerSubmitPayload {
  content: string;
  modelId: string;
}

@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [TooltipDirective],
  templateUrl: './composer.component.html',
  styleUrl: './composer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComposerComponent implements AfterViewInit {
  @ViewChild('textarea', { static: false }) private textareaRef?: ElementRef<HTMLTextAreaElement>;

  private readonly preferences = inject(UserPreferencesService);
  private readonly keychain = inject(KeychainService);

  public readonly disabled = input(false);
  public readonly modelId = input<string | null>(null);

  public readonly submitMessage = output<ComposerSubmitPayload>();

  protected readonly draft = signal('');
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
    this.draft.set('');
    // Reset textarea height after clearing
    setTimeout(() => this.autoResize(), 0);
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
    this.draft.set(textarea.value);
    this.autoResize();
  }

  private autoResize(): void {
    if (!this.textareaRef) {
      return;
    }
    const el = this.textareaRef.nativeElement;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
}
