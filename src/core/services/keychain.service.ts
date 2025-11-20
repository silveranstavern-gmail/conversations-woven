import { Injectable, computed, inject, signal } from '@angular/core';
import { CryptoService, EncryptedPayload } from './crypto.service';
import { IdbService } from './persistence/idb.service';

const KEY_PREFIX = 'api-key:';

@Injectable({
  providedIn: 'root'
})
export class KeychainService {
  private readonly idb = inject(IdbService);
  private readonly crypto = inject(CryptoService);

  private passphrase: string | null = null;

  private readonly unlockedSignal = signal(false);
  private readonly storedMapSignal = signal<Record<string, EncryptedPayload>>({});
  private readonly providerValidators: Record<string, (key: string) => Promise<boolean> | boolean> = {
    openrouter: (key: string) => /^sk-or-v1-[a-zA-Z0-9]{64,}$/.test(key),
    openai: (key: string) => /^sk-[a-zA-Z0-9]{32,}$/.test(key),
    anthropic: (key: string) => /^sk-ant-[a-z0-9]{32,}$/i.test(key),
    'azure-openai': (key: string) => /^[a-z0-9]{32}$/i.test(key)
  };

  readonly isUnlocked = this.unlockedSignal.asReadonly();
  readonly storedProviders = computed(() => Object.keys(this.storedMapSignal()));

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const entries = await this.idb.listKvEntries(KEY_PREFIX);
    const map: Record<string, EncryptedPayload> = {};
    entries.forEach((entry) => {
      const providerId = entry.key.replace(KEY_PREFIX, '');
      map[providerId] = entry.value as EncryptedPayload;
    });
    this.storedMapSignal.set(map);
  }

  hasStoredKey(providerId: string): boolean {
    return Boolean(this.storedMapSignal()[providerId]);
  }

  async unlock(passphrase: string): Promise<boolean> {
    await this.refresh();
    const stored = this.storedMapSignal();
    const providerIds = Object.keys(stored);
    if (providerIds.length > 0) {
      const sample = stored[providerIds[0]];
      try {
        await this.crypto.decrypt(sample, passphrase);
      } catch {
        return false;
      }
    }
    this.passphrase = passphrase;
    this.unlockedSignal.set(true);
    return true;
  }

  lock(): void {
    this.passphrase = null;
    this.unlockedSignal.set(false);
  }

  async saveKey(providerId: string, key: string): Promise<void> {
    const passphrase = this.ensurePassphrase();
    const encrypted = await this.crypto.encrypt(key, passphrase);
    await this.idb.setKv(this.buildKey(providerId), encrypted);
    await this.refresh();
  }

  async deleteKey(providerId: string): Promise<void> {
    await this.idb.deleteKv(this.buildKey(providerId));
    await this.refresh();
    // Auto-lock if no keys remain
    if (this.storedProviders().length === 0) {
      this.lock();
    }
  }

  async readKey(providerId: string): Promise<string | null> {
    const passphrase = this.ensurePassphrase();
    const payload = await this.idb.getKv<EncryptedPayload>(this.buildKey(providerId));
    if (!payload) {
      return null;
    }
    return this.crypto.decrypt(payload, passphrase);
  }

  async validateKey(providerId: string): Promise<boolean> {
    const key = await this.readKey(providerId);
    return this.testKeyFormat(providerId, key ?? '');
  }

  async testKeyFormat(providerId: string, rawKey: string): Promise<boolean> {
    const key = rawKey.trim();
    if (!key) {
      return false;
    }
    const validator = this.providerValidators[providerId];
    if (!validator) {
      return key.length >= 12;
    }
    try {
      return await Promise.resolve(validator(key));
    } catch {
      return false;
    }
  }

  private ensurePassphrase(): string {
    if (!this.passphrase) {
      throw new Error('Keychain is locked');
    }
    return this.passphrase;
  }

  private buildKey(providerId: string): string {
    return `${KEY_PREFIX}${providerId}`;
  }
}
