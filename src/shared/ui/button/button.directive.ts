import { Directive, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';

@Directive({
  selector: 'button[appButton], a[appButton]',
  standalone: true,
  host: {
    'class': 'ui-btn',
    '[class.ui-btn--primary]': 'variant() === "primary"',
    '[class.ui-btn--secondary]': 'variant() === "secondary"',
    '[class.ui-btn--ghost]': 'variant() === "ghost"',
    '[class.ui-btn--danger]': 'variant() === "danger"',
    '[class.ui-btn--sm]': 'size() === "sm"',
    '[class.ui-btn--md]': 'size() === "md"',
    '[class.ui-btn--icon]': 'size() === "icon"',
  }
})
export class ButtonDirective {
  public readonly variant = input<ButtonVariant>('primary');
  public readonly size = input<ButtonSize>('md');
}

