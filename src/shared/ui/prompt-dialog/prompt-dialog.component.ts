import {
  AfterViewInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core';
import { Subject } from 'rxjs';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';
import { ButtonDirective } from '../button/button.directive';

@Component({
  selector: 'app-prompt-dialog',
  imports: [DialogShellComponent, ButtonDirective],
  templateUrl: './prompt-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PromptDialogComponent implements AfterViewInit {
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly title = input('');
  public readonly message = input('');
  public readonly initialValue = input('');
  public readonly placeholder = input('');
  public readonly inputType = input<'text' | 'password'>('text');
  public readonly confirmLabel = input('OK');
  public readonly cancelLabel = input('Cancel');

  public readonly inputValue = signal('');

  readonly result$ = new Subject<string | null>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputRef');

  constructor() {
    // Sync initialValue input to inputValue signal
    effect(() => {
      const initial = this.initialValue();
      if (initial) {
        this.inputValue.set(initial);
      }
    });
  }

  ngAfterViewInit(): void {
    // Use requestAnimationFrame to ensure the dialog is fully rendered before focusing
    requestAnimationFrame(() => {
      this.cdr.detectChanges();
      this.inputRef()?.nativeElement?.focus();
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

