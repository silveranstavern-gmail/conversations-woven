import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ChatThread } from '@models/chat';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [ButtonDirective, TooltipDirective],
  template: `
    <header class="header">
      <div class="header__left">
        <ng-content select="[start]"></ng-content> <!-- For the sidebar toggle button -->
        <h1 class="header__title" (click)="titleClicked.emit()">{{ thread()?.title }}</h1>
      </div>
      
      <div class="header__actions">
        @if (subtitle()) {
          <span class="header__subtitle text-muted">{{ subtitle() }}</span>
        }
        <span 
          appTooltip 
          [disabled]="!canExport()" 
          message="No messages to export" 
          position="bottom" 
          align="center" 
          size="sm"
        >
          <button 
            type="button" 
            appButton 
            variant="ghost" 
            size="sm" 
            [disabled]="!canExport()"
            (click)="exportClicked.emit()"
          >
            Export
          </button>
        </span>
      </div>
    </header>
  `,
  styles: [`
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
      height: 60px;
      flex-shrink: 0;
    }
    .header__left { display: flex; align-items: center; gap: var(--space-2); overflow: hidden; }
    .header__title { 
      margin: 0; font-size: 1rem; font-weight: 600; cursor: pointer; 
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      padding: 0.25rem 0.5rem; border-radius: var(--radius-md);
    }
    .header__title:hover { background: var(--color-surface-hover); }
    .header__actions { display: flex; align-items: center; gap: var(--space-3); }
    .header__subtitle { font-size: 0.8rem; display: none; }
    @media(min-width: 768px) { .header__subtitle { display: block; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatHeaderComponent {
  public readonly thread = input<ChatThread>();
  public readonly subtitle = input<string | null>(null);
  public readonly messageCount = input<number>(0);
  public readonly titleClicked = output<void>();
  public readonly exportClicked = output<void>();

  protected readonly canExport = computed(() => this.messageCount() > 0);
}

