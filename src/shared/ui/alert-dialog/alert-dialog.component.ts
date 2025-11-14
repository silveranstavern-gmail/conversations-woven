import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  templateUrl: './alert-dialog.component.html',
  styleUrl: './alert-dialog.component.css',
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

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      this.handleConfirm();
    }
  }
}

