import { Routes } from '@angular/router';
import { ChatPageComponent } from './components/chat-page/chat-page.component';

export const CHAT_ROUTES: Routes = [
  {
    path: ':threadId',
    component: ChatPageComponent,
    title: 'Chat'
  },
  {
    path: '',
    component: ChatPageComponent,
    title: 'Chat'
  }
];
