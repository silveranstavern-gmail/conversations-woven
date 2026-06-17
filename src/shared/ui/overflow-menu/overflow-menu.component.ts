import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core';
import { ButtonDirective } from '@shared/ui/button/button.directive';

@Component({
  selector: 'app-overflow-menu',
  imports: [ButtonDirective],
  templateUrl: './overflow-menu.component.html',
  styleUrl: './overflow-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'overflow-menu',
    '[class.overflow-menu--open]': 'isOpen()',
    '[attr.data-align]': 'align()'
  }
})
export class OverflowMenuComponent {
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  public readonly align = input<'start' | 'end'>('end');
  public readonly triggerAriaLabel = input<string>('More actions');
  public readonly triggerTitle = input<string | null>(null);
  public readonly disabled = input(false);

  protected readonly isOpen = signal(false);

  toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.isOpen.update((open) => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) {
      return;
    }
    const target = event.target as Node | null;
    if (target && this.hostRef.nativeElement.contains(target)) {
      return;
    }
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close();
      this.triggerBtn()?.nativeElement.focus();
    }
  }

  protected onMenuItemClick(): void {
    this.close();
  }
}
