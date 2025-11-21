import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Subject } from 'rxjs';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';
import { ButtonDirective } from '../button/button.directive';

@Component({
  selector: 'app-alert-dialog',
  imports: [DialogShellComponent, ButtonDirective],
  templateUrl: './alert-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertDialogComponent {
  public readonly title = input('');
  public readonly message = input('');
  public readonly confirmLabel = input('OK');

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

