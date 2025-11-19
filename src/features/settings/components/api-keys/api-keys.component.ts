import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SettingsSectionComponent } from '../ui/settings-section/settings-section.component';
import { KeychainService } from '@core/services/keychain.service';

interface ProviderDefinition {
  id: string;
  label: string;
  scopes: string[];
  docUrl: string;
}

@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [SettingsSectionComponent],
  templateUrl: './api-keys.component.html',
  styleUrl: './api-keys.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApiKeysComponent {
  private readonly keychain = inject(KeychainService);

  protected readonly providers = signal<ProviderDefinition[]>([
    {
      id: 'openrouter',
      label: 'OpenRouter',
      scopes: ['chat', 'models:read'],
      docUrl: 'https://openrouter.ai/keys'
    },
    {
      id: 'openai',
      label: 'OpenAI',
      scopes: ['chat.completions', 'responses'],
      docUrl: 'https://platform.openai.com/account/api-keys'
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      scopes: ['messages', 'beta prompt cache'],
      docUrl: 'https://console.anthropic.com/account/keys'
    },
    {
      id: 'azure-openai',
      label: 'Azure OpenAI',
      scopes: ['chat', 'embeddings'],
      docUrl: 'https://portal.azure.com/'
    }
  ]);

  protected readonly passphrase = signal('');
  protected readonly unlockError = signal('');
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly providerMessages = signal<Record<string, string>>({});

  protected readonly isUnlocked = this.keychain.isUnlocked;
  protected readonly configuredProviders = computed(() =>
    new Set(this.keychain.storedProviders())
  );

  protected statusFor(providerId: string): 'locked' | 'configured' | 'missing' {
    if (!this.isUnlocked()) {
      return 'locked';
    }
    return this.keychain.hasStoredKey(providerId) ? 'configured' : 'missing';
  }

  protected readonly draftValue = (providerId: string): string => this.drafts()[providerId] ?? '';

  protected handleDraftInput(providerId: string, event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    this.drafts.update((current) => ({ ...current, [providerId]: textarea?.value ?? '' }));
  }

  protected handlePassphraseInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
    this.passphrase.set(nextValue);
    this.unlockError.set('');
  }

  protected async handleUnlock(): Promise<void> {
    const input = this.passphrase().trim();
    if (!input) {
      this.unlockError.set('Enter a passphrase to continue.');
      return;
    }
    const success = await this.keychain.unlock(input);
    if (!success) {
      this.unlockError.set('Passphrase did not match the stored keychain.');
      return;
    }
    this.passphrase.set('');
  }

  protected handleLock(): void {
    this.keychain.lock();
    this.drafts.set({});
  }

  protected async handleSave(providerId: string): Promise<void> {
    const key = this.drafts()[providerId]?.trim();
    if (!key) {
      this.setProviderMessage(providerId, 'Enter an API key before saving.');
      return;
    }
    try {
      await this.keychain.saveKey(providerId, key);
      this.setProviderMessage(providerId, 'API key stored locally.');
      this.drafts.update((current) => ({ ...current, [providerId]: '' }));
    } catch (error) {
      this.setProviderMessage(providerId, 'Failed to save the API key.');
    }
  }

  protected async handleRemove(providerId: string): Promise<void> {
    await this.keychain.deleteKey(providerId);
    this.setProviderMessage(providerId, 'API key removed.');
  }

  protected async handleValidate(providerId: string): Promise<void> {
    const draft = this.drafts()[providerId]?.trim();
    if (draft) {
      const isDraftValid = await this.keychain.testKeyFormat(providerId, draft);
      this.setProviderMessage(
        providerId,
        isDraftValid ? 'Draft key looks valid.' : 'Draft key format is invalid.'
      );
      return;
    }
    if (!this.keychain.hasStoredKey(providerId)) {
      this.setProviderMessage(providerId, 'Enter or save a key before validating.');
      return;
    }
    try {
      const isStoredValid = await this.keychain.validateKey(providerId);
      this.setProviderMessage(
        providerId,
        isStoredValid ? 'Stored key looks valid.' : 'Stored key failed validation.'
      );
    } catch {
      this.setProviderMessage(providerId, 'Unlock the keychain to validate stored keys.');
    }
  }

  protected messageFor(providerId: string): string | undefined {
    return this.providerMessages()[providerId];
  }

  private setProviderMessage(providerId: string, message: string): void {
    this.providerMessages.update((current) => ({ ...current, [providerId]: message }));
  }
}
