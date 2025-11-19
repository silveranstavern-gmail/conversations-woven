import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { KeychainService } from '@core/services/keychain.service';
import { DialogService } from '@core/services/dialog.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly keychain = inject(KeychainService);
  private readonly dialogService = inject(DialogService);

  protected readonly isUnlocked = this.keychain.isUnlocked;

  protected async handleKeychainAction(): Promise<void> {
    if (this.isUnlocked()) {
      this.keychain.lock();
    } else {
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
