import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppUpdateService } from '@core/services/app-update.service';
import { KeychainService } from '@core/services/keychain.service';
import { DialogService } from '@core/services/dialog.service';
import { UserPreferencesService } from '@core/services/preference/user-preferences.service';
import { LoadingOverlayComponent } from '@shared/ui/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LoadingOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  private readonly appUpdateService = inject(AppUpdateService);
  private readonly keychain = inject(KeychainService);
  private readonly dialogService = inject(DialogService);
  private readonly preferences = inject(UserPreferencesService);
  private readonly router = inject(Router);

  protected readonly isUnlocked = this.keychain.isUnlocked;

  constructor() {
    void this.appUpdateService;
    void this.preferences;
  }

  protected async handleKeychainAction(): Promise<void> {
    if (this.isUnlocked()) {
      this.keychain.lock();
    } else {
      // Check if user has set a keychain passphrase
      const hasStoredKeys = this.keychain.storedProviders().length > 0;
      
      if (!hasStoredKeys) {
        // Redirect to settings page to set up keychain
        await this.router.navigate(['/settings/api-keys']);
      } else {
        // User has keys, show unlock prompt
        const result = await this.dialogService.prompt({
          title: 'Unlock Keychain',
          inputType: 'password',
          placeholder: 'Enter passphrase'
        });
        if (result !== null) {
          const success = await this.keychain.unlock(result);
          if (!success) {
            await this.dialogService.alert({
              title: 'Error',
              message: 'Invalid passphrase'
            });
          }
        }
      }
    }
  }
}
