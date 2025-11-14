import { Injectable } from '@angular/core';

export interface EncryptedPayload {
  version: number;
  ciphertext: string;
  iv: string;
  salt: string;
}

const PBKDF2_ITERATIONS = 250_000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits per NIST recommendation for AES-GCM
const SALT_LENGTH = 16;

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  private readonly subtle = globalThis.crypto?.subtle;
  private readonly textEncoder = new TextEncoder();
  private readonly textDecoder = new TextDecoder();

  async encrypt(plaintext: string, passphrase: string): Promise<EncryptedPayload> {
    const cryptoRef = this.requireCrypto();
    const ivBytes = cryptoRef.getRandomValues(new Uint8Array(IV_LENGTH));
    const saltBytes = cryptoRef.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await this.deriveKey(passphrase, saltBytes);
    const encoded = this.textEncoder.encode(plaintext);
    const ciphertextBuffer = await this.requireSubtle().encrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      encoded
    );

    return {
      version: 1,
      ciphertext: this.toBase64(ciphertextBuffer),
      iv: this.toBase64(ivBytes),
      salt: this.toBase64(saltBytes)
    };
  }

  async decrypt(payload: EncryptedPayload, passphrase: string): Promise<string> {
    if (payload.version !== 1) {
      throw new Error(`Unsupported payload version: ${payload.version}`);
    }

    const saltBytes = this.fromBase64(payload.salt);
    const ivBytes = this.fromBase64(payload.iv);
    const ciphertextBytes = this.fromBase64(payload.ciphertext);
    const key = await this.deriveKey(passphrase, saltBytes);
    const decryptedBuffer = await this.requireSubtle().decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      ciphertextBytes.buffer as ArrayBuffer
    );

    return this.textDecoder.decode(decryptedBuffer);
  }

  async encryptJson<T>(value: T, passphrase: string): Promise<EncryptedPayload> {
    return this.encrypt(JSON.stringify(value), passphrase);
  }

  async decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T> {
    const plaintext = await this.decrypt(payload, passphrase);
    return JSON.parse(plaintext) as T;
  }

  private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await this.requireSubtle().importKey(
      'raw',
      this.textEncoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return this.requireSubtle().deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: AES_KEY_LENGTH
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private requireSubtle(): SubtleCrypto {
    if (!this.subtle) {
      throw new Error('WebCrypto SubtleCrypto is not available in this environment');
    }
    return this.subtle;
  }

  private toBase64(buffer: ArrayBuffer | Uint8Array): string {
    const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const nodeBuffer = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } })
      .Buffer;
    if (nodeBuffer) {
      return nodeBuffer.from(view).toString('base64');
    }
    let binary = '';
    view.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array {
    const nodeBuffer = (globalThis as { Buffer?: { from(data: string, encoding: string): Uint8Array } }).Buffer;
    if (nodeBuffer) {
      return nodeBuffer.from(value, 'base64');
    }
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  private requireCrypto(): Crypto {
    const cryptoRef = globalThis.crypto;
    if (!cryptoRef) {
      throw new Error('WebCrypto API is not available in this environment');
    }
    return cryptoRef;
  }
}
