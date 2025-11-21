import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-dialog-shell',
  templateUrl: './dialog-shell.component.html',
  styleUrl: './dialog-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'handleEscape($event)'
  }
})
export class DialogShellComponent {
  public readonly title = input('');
  public readonly message = input<string | undefined>();
  public readonly width = input('500px');

  public readonly cancel = output<void>();

  handleEscape(event: Event): void {
    (event as KeyboardEvent).preventDefault();
    this.handleCancel();
  }

  protected handleCancel(): void {
    this.cancel.emit();
  }

  protected handleOverlayClick(): void {
    this.handleCancel();
  }

  protected handleContainerClick(event: Event): void {
    event.stopPropagation();
  }
}

