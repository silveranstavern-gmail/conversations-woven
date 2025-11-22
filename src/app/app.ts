import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  private readonly keychain = inject(KeychainService);
  private readonly dialogService = inject(DialogService);
  private readonly preferences = inject(UserPreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  protected readonly isUnlocked = this.keychain.isUnlocked;

  constructor() {
    // Ensure preferences are applied on app initialization
    // This provides a reactive layer in addition to the service's direct application
    effect(() => {
      const theme = this.preferences.theme();
      const root = this.document?.documentElement;
      if (root) {
        if (theme === 'system') {
          // Detect system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
          root.setAttribute('data-theme', theme);
        }
      }
    });

    effect(() => {
      const fontScale = this.preferences.fontScale();
      const root = this.document?.documentElement;
      if (root) {
        root.style.setProperty('--font-scale', fontScale.toString());
      }
    });
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
