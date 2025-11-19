import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-dialog-shell',
  standalone: true,
  templateUrl: './dialog-shell.component.html',
  styleUrl: './dialog-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogShellComponent {
  @Input() title = '';
  @Input() message?: string;
  @Input() width = '500px';

  @Output() cancel = new EventEmitter<void>();

  @HostListener('document:keydown.escape', ['$event'])
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

