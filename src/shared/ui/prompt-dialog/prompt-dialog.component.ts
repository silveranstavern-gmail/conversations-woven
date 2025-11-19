import {
  AfterViewInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  signal,
  ViewChild
} from '@angular/core';
import { Subject } from 'rxjs';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';
import { ButtonDirective } from '../button/button.directive';

@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  imports: [DialogShellComponent, ButtonDirective],
  templateUrl: './prompt-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PromptDialogComponent implements AfterViewInit {
  title = '';
  message = '';
  initialValue = '';
  placeholder = '';
  inputType: 'text' | 'password' = 'text';
  confirmLabel = 'OK';
  cancelLabel = 'Cancel';

  readonly inputValue = signal('');

  readonly result$ = new Subject<string | null>();

  @ViewChild('inputRef', { static: false }) inputRef?: ElementRef<HTMLInputElement>;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    // Use requestAnimationFrame to ensure the dialog is fully rendered before focusing
    requestAnimationFrame(() => {
      this.cdr.detectChanges();
      this.inputRef?.nativeElement?.focus();
    });
  }

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

