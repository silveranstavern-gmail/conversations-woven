import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { BackupService, ChatBackupBundle } from '@core/services/persistence/backup.service';
import { ChatThreadsService } from '@features/chat/data/chat-threads.service';
import { MessageStateService } from '@features/chat/data/message-state.service';
import { SettingsSectionComponent } from '../ui/settings-section/settings-section.component';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

@Component({
  selector: 'app-backup-restore',
  imports: [SettingsSectionComponent, ButtonDirective, TooltipDirective],
  templateUrl: './backup-restore.component.html',
  styleUrl: './backup-restore.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackupRestoreComponent {
  private readonly backup = inject(BackupService);
  private readonly threads = inject(ChatThreadsService);
  private readonly messageState = inject(MessageStateService);

  protected readonly isProcessing = signal(false);
  protected readonly statusMessage = signal('');
  protected readonly errorMessage = signal('');
  protected readonly steps = [
    {
      title: 'Export bundle',
      detail: 'Generates a JSON payload containing threads and messages.'
    },
    {
      title: 'Dry-run restore',
      detail:
        'Validates schema versions with zod before allowing imports, highlighting adds/updates/skips.'
    },
    {
      title: 'Commit changes',
      detail: 'Writes to IndexedDB within a transaction to keep the local store consistent.'
    }
  ];

  protected async handleExport(): Promise<void> {
    if (this.isProcessing()) {
      return;
    }
    this.resetMessages();
    this.isProcessing.set(true);
    try {
      const bundle = await this.backup.exportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json'
      });
      this.downloadBlob(
        blob,
        `chat-backup-${new Date().toISOString().replace(/[:]/g, '-')}.json`
      );
      this.statusMessage.set('Backup downloaded.');
    } catch {
      this.errorMessage.set('Unable to export backup.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  protected triggerImport(input: HTMLInputElement | null): void {
    if (this.isProcessing() || !input) {
      return;
    }
    input.click();
  }

  protected async handleImportSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files?.length) {
      return;
    }
    const file = input.files[0];
    input.value = '';
    this.resetMessages();
    this.isProcessing.set(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ChatBackupBundle;
      await this.backup.importBundle(data);
      await this.threads.reloadFromStore();
      await this.messageState.reloadActiveThread();
      this.statusMessage.set('Import complete.');
    } catch {
      this.errorMessage.set('Import failed. Ensure the file is a valid backup.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  private resetMessages(): void {
    this.statusMessage.set('');
    this.errorMessage.set('');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
