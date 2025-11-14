import { Routes } from '@angular/router';
import { ApiKeysComponent } from './components/api-keys/api-keys.component';
import { BackupRestoreComponent } from './components/backup-restore/backup-restore.component';
import { SettingsLayoutComponent } from './components/settings-layout/settings-layout.component';
import { TelemetryComponent } from './components/telemetry/telemetry.component';
import { ThemeFontComponent } from './components/theme-font/theme-font.component';
import { ModelsComponent } from './components/models/models.component';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: SettingsLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'api-keys'
      },
      {
        path: 'api-keys',
        component: ApiKeysComponent,
        title: 'Settings · API Keys'
      },
      {
        path: 'models',
        component: ModelsComponent,
        title: 'Settings · Models'
      },
      {
        path: 'backup',
        component: BackupRestoreComponent,
        title: 'Settings · Backup & Restore'
      },
      {
        path: 'theme',
        component: ThemeFontComponent,
        title: 'Settings · Theme & Font'
      },
      {
        path: 'telemetry',
        component: TelemetryComponent,
        title: 'Settings · Telemetry'
      }
    ]
  }
];
