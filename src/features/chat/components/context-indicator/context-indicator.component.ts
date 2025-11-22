import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-context-indicator',
  imports: [DecimalPipe],
  templateUrl: './context-indicator.component.html',
  styleUrl: './context-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextIndicatorComponent {
  public readonly usage = input.required<number>();
  public readonly limit = input.required<number>();

  protected readonly percentage = computed(() => {
    const limit = this.limit();
    if (limit <= 0) return 0;
    return Math.min(100, (this.usage() / limit) * 100);
  });

  protected readonly isWarning = computed(() => {
    const p = this.percentage();
    return p > 80 && p <= 100;
  });

  protected readonly isError = computed(() => this.percentage() >= 100);

  protected readonly tooltip = computed(() => {
    const remaining = Math.max(0, this.limit() - this.usage());
    return `${remaining} tokens remaining`;
  });
}

