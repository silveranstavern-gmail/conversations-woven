import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-context-indicator',
  templateUrl: './context-indicator.component.html',
  styleUrl: './context-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextIndicatorComponent {
  private readonly numberFormatter = new Intl.NumberFormat();

  public readonly usage = input<number | null>(null);
  public readonly limit = input<number | null>(null);
  public readonly pending = input(0);

  protected readonly isLoading = computed(() => this.usage() === null);
  protected readonly hasKnownLimit = computed(() => {
    const limit = this.limit();
    return typeof limit === 'number' && limit > 0;
  });
  protected readonly usageValue = computed(() => this.usage() ?? 0);
  protected readonly pendingValue = computed(() => Math.max(0, Math.round(this.pending())));
  protected readonly totalUsageValue = computed(() => this.usageValue() + this.pendingValue());
  protected readonly limitValue = computed(() => this.limit() ?? 0);
  protected readonly showProgressBar = computed(() => !this.isLoading() && this.hasKnownLimit());

  protected readonly percentage = computed(() => {
    const limit = this.limitValue();
    if (limit <= 0) {
      return 0;
    }
    return Math.min(100, (this.totalUsageValue() / limit) * 100);
  });

  protected readonly isWarning = computed(() => {
    if (!this.hasKnownLimit() || this.isLoading()) {
      return false;
    }
    const p = this.percentage();
    return p > 80 && p <= 100;
  });

  protected readonly isError = computed(
    () => this.hasKnownLimit() && !this.isLoading() && this.percentage() >= 100
  );

  protected readonly displayText = computed(() => {
    if (this.isLoading()) {
      return 'Loading context...';
    }
    if (this.pendingValue() > 0) {
      if (!this.hasKnownLimit()) {
        return `${this.formatNumber(this.usageValue())} + ${this.formatNumber(this.pendingValue())} tokens`;
      }
      return `${this.formatNumber(this.usageValue())} + ${this.formatNumber(this.pendingValue())} / ${this.formatNumber(this.limitValue())} tokens`;
    }
    if (!this.hasKnownLimit()) {
      return `${this.formatNumber(this.usageValue())} tokens in context`;
    }
    return `${this.formatNumber(this.usageValue())} / ${this.formatNumber(this.limitValue())} tokens`;
  });

  protected readonly tooltip = computed(() => {
    if (this.isLoading()) {
      return 'Loading the conversation context for this chat.';
    }
    if (!this.hasKnownLimit()) {
      if (this.pendingValue() > 0) {
        return (
          `Conversation: ${this.formatNumber(this.usageValue())} tokens. ` +
          `Draft: ${this.formatNumber(this.pendingValue())} tokens.`
        );
      }
      return 'The selected model does not currently expose a context limit.';
    }

    const remaining = this.limitValue() - this.totalUsageValue();
    const breakdown =
      this.pendingValue() > 0
        ? ` Conversation: ${this.formatNumber(this.usageValue())} tokens. Draft: ${this.formatNumber(this.pendingValue())} tokens.`
        : '';
    if (remaining > 0) {
      return `${this.formatNumber(remaining)} tokens remaining${breakdown}`;
    }

    if (remaining === 0) {
      return `This chat is at the selected model context limit.${breakdown}`;
    }

    return `${this.formatNumber(Math.abs(remaining))} tokens over the selected model limit.${breakdown}`;
  });

  private formatNumber(value: number): string {
    return this.numberFormatter.format(Math.max(0, Math.round(value)));
  }
}
