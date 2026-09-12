import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { DialogService } from './dialog.service';

@Injectable({
  providedIn: 'root'
})
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly dialog = inject(DialogService);
  private readonly document = inject(DOCUMENT);

  private updatePromptOpen = false;
  private unrecoverablePromptOpen = false;

  constructor() {
    if (!this.updates.isEnabled) {
      return;
    }

    this.updates.versionUpdates
      .pipe(filter((event: VersionEvent) => event.type === 'VERSION_READY'))
      .subscribe(() => {
        void this.promptForReload();
      });

    this.updates.unrecoverable.subscribe((event) => {
      void this.handleUnrecoverableState(event.reason);
    });
  }

  private async promptForReload(): Promise<void> {
    if (this.updatePromptOpen) {
      return;
    }

    this.updatePromptOpen = true;

    try {
      const shouldReload = await this.dialog.confirm({
        title: 'Update available',
        message: 'A newer version of the app is ready. Reload now to use the latest version?',
        confirmLabel: 'Reload',
        cancelLabel: 'Later'
      });

      if (shouldReload) {
        this.document.location.reload();
      }
    } finally {
      this.updatePromptOpen = false;
    }
  }

  private async handleUnrecoverableState(reason: string): Promise<void> {
    if (this.unrecoverablePromptOpen) {
      return;
    }

    this.unrecoverablePromptOpen = true;

    try {
      await this.dialog.alert({
        title: 'Refresh required',
        message: `The cached app version can no longer be used safely. Reload to continue. ${reason}`,
        confirmLabel: 'Reload'
      });

      this.document.location.reload();
    } finally {
      this.unrecoverablePromptOpen = false;
    }
  }
}
