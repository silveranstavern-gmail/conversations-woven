import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingOverlayService } from '@core/services/loading-overlay.service';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingOverlayComponent {
  protected readonly overlayService = inject(LoadingOverlayService);
  protected readonly isVisible = this.overlayService.isVisible;
  protected readonly message = this.overlayService.message;
}

