import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  templateUrl: './prompt-dialog.component.html',
  styleUrl: './prompt-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PromptDialogComponent {
  title = '';
  message = '';
  initialValue = '';
  placeholder = '';
  inputType: 'text' | 'password' = 'text';
  confirmLabel = 'OK';
  cancelLabel = 'Cancel';

  readonly inputValue = signal('');

  readonly result$ = new Subject<string | null>();

  protected handleConfirm(): void {
    const value = this.inputValue().trim();
    this.result$.next(value || null);
    this.result$.complete();
  }

  protected handleCancel(): void {
    this.result$.next(null);
    this.result$.complete();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleConfirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.handleCancel();
    }
  }
}

