import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { UserPreferencesService, SendHotkeyMode } from '@core/services/preference/user-preferences.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';

type ThemePreference = 'system' | 'light' | 'dark';

@Component({
  selector: 'app-theme-font',
  imports: [TitleCasePipe, DecimalPipe, ButtonDirective],
  templateUrl: './theme-font.component.html',
  styleUrl: './theme-font.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemeFontComponent {
  private readonly preferences = inject(UserPreferencesService);

  protected readonly themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
  protected readonly hotkeyOptions: SendHotkeyMode[] = ['enter', 'ctrl-enter'];
  protected readonly themePreference = this.preferences.theme;
  protected readonly fontScale = this.preferences.fontScale;
  protected readonly sendHotkey = this.preferences.sendHotkey;
  
  // Local signal for slider visual value (updates immediately without committing)
  protected readonly sliderValue = signal<number>(this.fontScale());
  
  protected readonly previewLabel = computed(
    () => `Preview text · ${(this.sliderValue() * 100).toFixed(0)}%`
  );

  constructor() {
    // Sync slider value when preference changes externally
    effect(() => {
      this.sliderValue.set(this.fontScale());
    });
  }

  protected onThemeChange(preference: ThemePreference): void {
    this.preferences.setTheme(preference);
  }

  protected onScaleInput(event: Event): void {
    // Update visual value immediately without committing
    const nextValue = Number((event.target as HTMLInputElement).value);
    this.sliderValue.set(nextValue);
    // Apply visual change immediately
    this.preferences.applyFontScaleToDOM(nextValue);
  }

  protected onScaleCommit(event: Event): void {
    // Commit the value to preferences on mouseup/touchend
    const nextValue = Number((event.target as HTMLInputElement).value);
    this.preferences.setFontScale(nextValue);
  }

  protected onHotkeyChange(mode: SendHotkeyMode): void {
    this.preferences.setSendHotkey(mode);
  }

}
