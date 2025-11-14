import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-telemetry',
  templateUrl: './telemetry.component.html',
  styleUrl: './telemetry.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelemetryComponent {
  protected readonly telemetryEnabled = signal(false);
  protected readonly statusLabel = computed(() =>
    this.telemetryEnabled() ? 'Telemetry is enabled' : 'Telemetry is disabled'
  );

  protected toggleTelemetry(): void {
    this.telemetryEnabled.update((value) => !value);
  }
}
