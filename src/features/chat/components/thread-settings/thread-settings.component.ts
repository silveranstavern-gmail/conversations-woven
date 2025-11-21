import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DialogShellComponent } from '@shared/ui/dialog-shell/dialog-shell.component';
import { ButtonDirective } from '@shared/ui/button/button.directive';

export interface ThreadSettings {
  systemPrompt?: string;
  temperature?: number;
}

@Component({
  selector: 'app-thread-settings',
  imports: [DialogShellComponent, ButtonDirective],
  templateUrl: './thread-settings.component.html',
  styleUrl: './thread-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThreadSettingsComponent {
  title = 'Thread Settings';
  initialSystemPrompt = '';
  initialTemperature: number | undefined = undefined;

  readonly systemPrompt = signal('');
  readonly temperature = signal<number | undefined>(undefined);

  readonly result$ = new Subject<ThreadSettings | null>();

  protected handleTemperatureChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.temperature.set(value ? parseFloat(value) : undefined);
  }

  protected handleSystemPromptChange(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.systemPrompt.set(value);
    // Auto-resize textarea
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  protected handleConfirm(): void {
    const settings: ThreadSettings = {
      systemPrompt: this.systemPrompt().trim() || undefined,
      temperature: this.temperature() ?? undefined
    };
    this.result$.next(settings);
    this.result$.complete();
  }

  protected handleCancel(): void {
    this.result$.next(null);
    this.result$.complete();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleCancel();
    }
    // Allow Ctrl/Cmd+Enter to submit
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.handleConfirm();
    }
  }
}

