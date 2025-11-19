import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { APP_ROUTES } from './app.routes';
import { LLM_ADAPTER_TOKEN } from '@features/chat/adapters/llm-adapter';
import { OpenRouterAdapter } from '@features/chat/adapters/openrouter.adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    { provide: LLM_ADAPTER_TOKEN, useClass: OpenRouterAdapter, multi: true }
  ]
};
