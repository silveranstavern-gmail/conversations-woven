import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat'
  },
  {
    path: 'chat',
    loadChildren: () => import('../features/chat/chat.routes').then((m) => m.CHAT_ROUTES)
  },
  {
    path: 'settings',
    loadChildren: () => import('../features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES)
  },
  {
    path: '**',
    redirectTo: 'chat'
  }
];
