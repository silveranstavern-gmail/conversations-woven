import { Injectable, signal } from '@angular/core';

type ThemePreference = 'system' | 'light' | 'dark';

interface PreferencesSnapshot {
  theme: ThemePreference;
  fontScale: number;
}

const STORAGE_KEY = 'app-preferences';
const DEFAULT_PREFERENCES: PreferencesSnapshot = {
  theme: 'system',
  fontScale: 1
};

@Injectable({
  providedIn: 'root'
})
export class UserPreferencesService {
  private readonly themeSignal = signal<ThemePreference>(DEFAULT_PREFERENCES.theme);
  private readonly fontScaleSignal = signal(DEFAULT_PREFERENCES.fontScale);

  readonly theme = this.themeSignal.asReadonly();
  readonly fontScale = this.fontScaleSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  setTheme(theme: ThemePreference): void {
    this.themeSignal.set(theme);
    this.persist();
  }

  setFontScale(scale: number): void {
    const clamped = Math.min(1.5, Math.max(0.8, Number.isFinite(scale) ? scale : 1));
    this.fontScaleSignal.set(clamped);
    this.persist();
  }

  private hydrateFromStorage(): void {
    const entry = this.getStorage()?.getItem(STORAGE_KEY);
    if (!entry) {
      return;
    }
    try {
      const parsed = JSON.parse(entry) as Partial<PreferencesSnapshot>;
      if (parsed.theme === 'system' || parsed.theme === 'light' || parsed.theme === 'dark') {
        this.themeSignal.set(parsed.theme);
      }
      if (typeof parsed.fontScale === 'number') {
        this.fontScaleSignal.set(parsed.fontScale);
      }
    } catch {
      // ignore corrupt data
    }
  }

  private persist(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    const payload: PreferencesSnapshot = {
      theme: this.themeSignal(),
      fontScale: this.fontScaleSignal()
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  private getStorage(): Storage | null {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
      return null;
    }
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }
}
