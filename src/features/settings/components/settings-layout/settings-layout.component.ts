import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface SettingsSection {
  label: string;
  description: string;
  path: string;
}

@Component({
  selector: 'app-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './settings-layout.component.html',
  styleUrl: './settings-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsLayoutComponent {
  protected readonly sections: SettingsSection[] = [
    {
      label: 'API Keys',
      description: 'Bring your own provider credentials with passphrase encryption.',
      path: 'api-keys'
    },
    {
      label: 'Models',
      description: 'Choose which provider models appear in the composer dropdown.',
      path: 'models'
    },
    {
      label: 'System Prompts',
      description: 'Customize system prompts and model settings for different use cases.',
      path: 'system-prompts'
    },
    {
      label: 'Backup & Restore',
      description: 'Export portable bundles and preview imports safely.',
      path: 'backup'
    },
    {
      label: 'Theme & Font',
      description: 'Control theme, typography, and density preferences.',
      path: 'theme'
    }
  ];
}
