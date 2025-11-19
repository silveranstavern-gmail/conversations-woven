import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-settings-section',
  standalone: true,
  template: `
    <header class="settings-section__header">
      <div>
        <p class="settings-section__eyebrow">{{ eyebrow }}</p>
        <h2>{{ heading }}</h2>
        <p class="text-muted">{{ description }}</p>
      </div>
      <div class="settings-section__actions">
        <ng-content select=".settings-section__actions-content"></ng-content>
      </div>
    </header>
    <section class="settings-section__body">
      <ng-content select=".settings-section__body-content"></ng-content>
    </section>
  `,
  styles: [`
    .settings-section__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-4);
      margin-bottom: var(--space-6);
    }

    .settings-section__eyebrow {
      margin: 0;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-muted);
    }

    .settings-section__header h2 {
      margin: var(--space-2) 0 var(--space-2) 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text);
    }

    .settings-section__actions {
      display: flex;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .settings-section__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsSectionComponent {
  @Input() eyebrow = '';
  @Input() heading = '';
  @Input() description = '';
}

