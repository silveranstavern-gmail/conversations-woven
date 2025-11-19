import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';
import { ButtonDirective } from '../button/button.directive';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [DialogShellComponent, ButtonDirective],
  templateUrl: './confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  title = '';
  message = '';
  confirmLabel = 'Confirm';
  cancelLabel = 'Cancel';
  danger = false;

  readonly result$ = new Subject<boolean>();

  protected handleConfirm(): void {
    this.result$.next(true);
    this.result$.complete();
  }

  protected handleCancel(): void {
    this.result$.next(false);
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

