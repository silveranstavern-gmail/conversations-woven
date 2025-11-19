import { Directive, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';

@Directive({
  selector: 'button[appButton], a[appButton]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  }
})
export class ButtonDirective {
  public readonly variant = input<ButtonVariant>('primary');
  public readonly size = input<ButtonSize>('md');

  protected readonly computedClass = computed(() => {
    const base = 'ui-btn';
    const variantClass = `${base}--${this.variant()}`;
    const sizeClass = `${base}--${this.size()}`;
    
    return `${base} ${variantClass} ${sizeClass}`;
  });
}

