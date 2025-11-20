import { Injectable, signal } from '@angular/core';

type ThemePreference = 'system' | 'light' | 'dark';

export type SendHotkeyMode = 'enter' | 'ctrl-enter';
export type SystemPromptUseCase = 'compactor' | 'metadata';

interface PreferencesSnapshot {
  theme: ThemePreference;
  fontScale: number;
  sendHotkey: SendHotkeyMode;
  systemPromptsUseCase: SystemPromptUseCase;
}

const STORAGE_KEY = 'app-preferences';
const DEFAULT_PREFERENCES: PreferencesSnapshot = {
  theme: 'system',
  fontScale: 1,
  sendHotkey: 'enter',
  systemPromptsUseCase: 'compactor'
};

@Injectable({
  providedIn: 'root'
})
export class UserPreferencesService {
  private readonly themeSignal = signal<ThemePreference>(DEFAULT_PREFERENCES.theme);
  private readonly fontScaleSignal = signal(DEFAULT_PREFERENCES.fontScale);
  private readonly sendHotkeySignal = signal<SendHotkeyMode>(DEFAULT_PREFERENCES.sendHotkey);
  private readonly systemPromptsUseCaseSignal = signal<SystemPromptUseCase>(DEFAULT_PREFERENCES.systemPromptsUseCase);

  readonly theme = this.themeSignal.asReadonly();
  readonly fontScale = this.fontScaleSignal.asReadonly();
  readonly sendHotkey = this.sendHotkeySignal.asReadonly();
  readonly systemPromptsUseCase = this.systemPromptsUseCaseSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
  }

  setTheme(theme: ThemePreference): void {
    this.themeSignal.set(theme);
    this.applyThemeToDOM(theme);
    this.persist();
  }

  setFontScale(scale: number): void {
    const clamped = Math.min(1.5, Math.max(0.8, Number.isFinite(scale) ? scale : 1));
    this.fontScaleSignal.set(clamped);
    this.applyFontScaleToDOM(clamped);
    this.persist();
  }

  setSendHotkey(mode: SendHotkeyMode): void {
    this.sendHotkeySignal.set(mode);
    this.persist();
  }

  setSystemPromptsUseCase(useCase: SystemPromptUseCase): void {
    this.systemPromptsUseCaseSignal.set(useCase);
    this.persist();
  }

  private hydrateFromStorage(): void {
    const entry = this.getStorage()?.getItem(STORAGE_KEY);
    if (!entry) {
      // Apply defaults immediately
      this.applyThemeToDOM(DEFAULT_PREFERENCES.theme);
      this.applyFontScaleToDOM(DEFAULT_PREFERENCES.fontScale);
      return;
    }
    try {
      const parsed = JSON.parse(entry) as Partial<PreferencesSnapshot>;
      if (parsed.theme === 'system' || parsed.theme === 'light' || parsed.theme === 'dark') {
        this.themeSignal.set(parsed.theme);
        this.applyThemeToDOM(parsed.theme);
      } else {
        this.applyThemeToDOM(DEFAULT_PREFERENCES.theme);
      }
      if (typeof parsed.fontScale === 'number') {
        this.fontScaleSignal.set(parsed.fontScale);
        this.applyFontScaleToDOM(parsed.fontScale);
      } else {
        this.applyFontScaleToDOM(DEFAULT_PREFERENCES.fontScale);
      }
      if (parsed.sendHotkey === 'enter' || parsed.sendHotkey === 'ctrl-enter') {
        this.sendHotkeySignal.set(parsed.sendHotkey);
      }
      if (parsed.systemPromptsUseCase === 'compactor' || parsed.systemPromptsUseCase === 'metadata') {
        this.systemPromptsUseCaseSignal.set(parsed.systemPromptsUseCase);
      }
    } catch {
      // ignore corrupt data, apply defaults
      this.applyThemeToDOM(DEFAULT_PREFERENCES.theme);
      this.applyFontScaleToDOM(DEFAULT_PREFERENCES.fontScale);
    }
  }

  private applyThemeToDOM(preference: ThemePreference): void {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    if (!root) {
      return;
    }

    if (preference === 'system') {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }

  private applyFontScaleToDOM(value: number): void {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.style.setProperty('--font-scale', value.toString());
  }

  private persist(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    const payload: PreferencesSnapshot = {
      theme: this.themeSignal(),
      fontScale: this.fontScaleSignal(),
      sendHotkey: this.sendHotkeySignal(),
      systemPromptsUseCase: this.systemPromptsUseCaseSignal()
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
