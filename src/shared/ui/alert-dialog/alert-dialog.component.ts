import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Subject } from 'rxjs';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';

@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  imports: [DialogShellComponent],
  templateUrl: './alert-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertDialogComponent {
  title = '';
  message = '';
  confirmLabel = 'OK';

  readonly result$ = new Subject<void>();

  protected handleConfirm(): void {
    this.result$.next();
    this.result$.complete();
  }

  protected handleCancel(): void {
    this.handleConfirm();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      this.handleConfirm();
    }
  }
}

