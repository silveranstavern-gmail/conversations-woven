import { Directive, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
import { KeychainService } from '@core/services/keychain.service';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export type TooltipAlign = 'start' | 'center' | 'end';

export type TooltipSize = 'sm' | 'md' | 'lg' | 'auto';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
  host: {
    '[class.tooltip-wrapper]': 'true',
    '[attr.data-tooltip]': 'tooltipText()',
    '[attr.aria-label]': 'tooltipText()',
    '[attr.data-size]': 'size()',
    '[attr.data-position]': 'position()',
    '[attr.data-align]': 'align()',
    '[class.tooltip-wrapper--disabled]': 'isDisabled()',
    '[class.tooltip-wrapper--visible]': 'isVisible()',
    '(mouseenter)': 'onEnter()',
    '(mouseleave)': 'onLeave()',
    '(focusin)': 'onEnter()',
    '(focusout)': 'onLeave()',
    '(window:scroll)': 'onScroll()',
    '(window:resize)': 'onScroll()'
  }
})
export class TooltipDirective {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly keychain = inject(KeychainService);

  // Custom tooltip message (overrides auto-detection)
  public readonly message = input<string | null>(null);
  
  // Disabled state (can be passed in or auto-detected)
  public readonly disabled = input<boolean | null>(null);
  
  // Additional context for determining disabled reason
  public readonly hasKeys = input<boolean | null>(null);
  public readonly hasSelection = input<boolean | null>(null);
  public readonly isEmpty = input<boolean | null>(null);
  public readonly isProcessing = input<boolean | null>(null);

  // Tooltip positioning and sizing configuration
  public readonly position = input<TooltipPosition>('top');
  public readonly align = input<TooltipAlign>('center');
  public readonly size = input<TooltipSize>('sm');

  private readonly isUnlocked = this.keychain.isUnlocked;
  private readonly storedProviders = this.keychain.storedProviders;

  private readonly isDisabledSignal = signal<boolean>(false);
  protected readonly isVisible = signal<boolean>(false);

  constructor() {
    // Detect disabled state from the element
    effect(() => {
      const element = this.elementRef.nativeElement;
      const button = element.tagName === 'BUTTON' ? element as HTMLButtonElement : element.querySelector('button');
      if (button) {
        this.isDisabledSignal.set(button.disabled);
      }
    });
  }

  protected readonly isDisabled = computed(() => {
    const explicitDisabled = this.disabled();
    if (explicitDisabled !== null) {
      return explicitDisabled;
    }
    return this.isDisabledSignal();
  });

  protected readonly tooltipText = computed(() => {
    // If custom message provided, use it
    const customMessage = this.message();
    if (customMessage) {
      return customMessage;
    }

    // Only show tooltip if disabled
    if (!this.isDisabled()) {
      return null;
    }

    // Determine disabled reason
    return this.getDisabledReason();
  });

  private getDisabledReason(): string | null {
    if (!this.isDisabled()) {
      return null;
    }

    // Check keychain-related reasons first
    const hasStoredKeys = this.storedProviders().length > 0;
    const explicitHasKeys = this.hasKeys();
    const hasKeysValue = explicitHasKeys !== null ? explicitHasKeys : hasStoredKeys;

    if (!this.isUnlocked()) {
      if (!hasKeysValue) {
        return 'An API key needs to be configured first to perform this action';
      }
      return 'Unlock the application to perform this action';
    }

    // Check other common reasons
    const explicitHasSelection = this.hasSelection();
    if (explicitHasSelection === false) {
      return 'Select items to perform this action';
    }

    const explicitIsEmpty = this.isEmpty();
    if (explicitIsEmpty === true) {
      return 'No items available';
    }

    const explicitIsProcessing = this.isProcessing();
    if (explicitIsProcessing === true) {
      return 'Please wait for the current operation to complete';
    }

    // Default message
    return 'This action is currently unavailable';
  }

  onEnter(): void {
    if (typeof window === 'undefined') return;
    if (!this.tooltipText()) return;
    
    this.isVisible.set(true);
    this.updatePosition();
  }

  onLeave(): void {
    this.isVisible.set(false);
    this.clearPosition();
  }

  onScroll(): void {
    if (!this.isVisible()) return;
    this.updatePosition();
  }

  private updatePosition(): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const offset = 8; // 8px offset from element
    let x = 0;
    let y = 0;

    const position = this.position();
    const align = this.align();

    // Calculate position based on position and align inputs
    switch (position) {
      case 'top':
        y = rect.top - offset;
        switch (align) {
          case 'center':
            x = rect.left + rect.width / 2;
            break;
          case 'start':
            x = rect.left;
            break;
          case 'end':
            x = rect.right;
            break;
        }
        break;
      
      case 'bottom':
        y = rect.bottom + offset;
        switch (align) {
          case 'center':
            x = rect.left + rect.width / 2;
            break;
          case 'start':
            x = rect.left;
            break;
          case 'end':
            x = rect.right;
            break;
        }
        break;
      
      case 'left':
        x = rect.left - offset;
        switch (align) {
          case 'center':
            y = rect.top + rect.height / 2;
            break;
          case 'start':
            y = rect.top;
            break;
          case 'end':
            y = rect.bottom;
            break;
        }
        break;
      
      case 'right':
        x = rect.right + offset;
        switch (align) {
          case 'center':
            y = rect.top + rect.height / 2;
            break;
          case 'start':
            y = rect.top;
            break;
          case 'end':
            y = rect.bottom;
            break;
        }
        break;
    }

    // Set CSS variables for fixed positioning
    this.elementRef.nativeElement.style.setProperty('--tooltip-x', `${x}px`);
    this.elementRef.nativeElement.style.setProperty('--tooltip-y', `${y}px`);
  }

  private clearPosition(): void {
    this.elementRef.nativeElement.style.removeProperty('--tooltip-x');
    this.elementRef.nativeElement.style.removeProperty('--tooltip-y');
  }
}

