import { DecimalPipe, DOCUMENT, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { UserPreferencesService } from '@core/services/preference/user-preferences.service';

type ThemePreference = 'system' | 'light' | 'dark';

@Component({
  selector: 'app-theme-font',
  imports: [TitleCasePipe, DecimalPipe],
  templateUrl: './theme-font.component.html',
  styleUrl: './theme-font.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemeFontComponent {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UserPreferencesService);

  protected readonly themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
  protected readonly themePreference = this.preferences.theme;
  protected readonly fontScale = this.preferences.fontScale;
  protected readonly previewLabel = computed(
    () => `Preview text · ${(this.fontScale() * 100).toFixed(0)}%`
  );

  constructor() {
    effect(() => {
      this.applyTheme(this.themePreference());
    });
    effect(() => {
      this.applyFontScale(this.fontScale());
    });
  }

  protected onThemeChange(preference: ThemePreference): void {
    this.preferences.setTheme(preference);
  }

  protected onScaleChange(event: Event): void {
    const nextValue = Number((event.target as HTMLInputElement).value);
    this.preferences.setFontScale(nextValue);
  }

  private applyTheme(preference: ThemePreference): void {
    const root = this.document?.documentElement;
    if (!root) {
      return;
    }

    if (preference === 'system') {
      root.removeAttribute('data-theme');
      return;
    }

    root.setAttribute('data-theme', preference);
  }

  private applyFontScale(value: number): void {
    this.document?.documentElement.style.setProperty('--font-scale', value.toString());
  }
}
