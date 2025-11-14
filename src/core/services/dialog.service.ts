import { Injectable, inject, ComponentRef, ViewContainerRef, ApplicationRef, createComponent, EnvironmentInjector } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { PromptDialogComponent } from '@shared/ui/prompt-dialog/prompt-dialog.component';
import { ConfirmDialogComponent } from '@shared/ui/confirm-dialog/confirm-dialog.component';
import { AlertDialogComponent } from '@shared/ui/alert-dialog/alert-dialog.component';
import { ThreadSettingsComponent, ThreadSettings } from '@features/chat/components/thread-settings/thread-settings.component';

export interface PromptConfig {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AlertConfig {
  title: string;
  message: string;
  confirmLabel?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  async prompt(config: PromptConfig): Promise<string | null> {
    const componentRef = this.createDialogComponent(PromptDialogComponent);
    const dialog = componentRef.instance;
    
    dialog.title = config.title;
    dialog.message = config.message ?? '';
    dialog.initialValue = config.initialValue ?? '';
    dialog.placeholder = config.placeholder ?? '';
    dialog.confirmLabel = config.confirmLabel ?? 'OK';
    dialog.cancelLabel = config.cancelLabel ?? 'Cancel';
    dialog.inputValue.set(config.initialValue ?? '');

    const result = await firstValueFrom(dialog.result$);
    this.destroyDialog(componentRef);
    return result;
  }

  async confirm(config: ConfirmConfig): Promise<boolean> {
    const componentRef = this.createDialogComponent(ConfirmDialogComponent);
    const dialog = componentRef.instance;
    
    dialog.title = config.title;
    dialog.message = config.message;
    dialog.confirmLabel = config.confirmLabel ?? 'Confirm';
    dialog.cancelLabel = config.cancelLabel ?? 'Cancel';
    dialog.danger = config.danger ?? false;

    const result = await firstValueFrom(dialog.result$);
    this.destroyDialog(componentRef);
    return result;
  }

  async alert(config: AlertConfig): Promise<void> {
    const componentRef = this.createDialogComponent(AlertDialogComponent);
    const dialog = componentRef.instance;
    
    dialog.title = config.title;
    dialog.message = config.message;
    dialog.confirmLabel = config.confirmLabel ?? 'OK';

    await firstValueFrom(dialog.result$);
    this.destroyDialog(componentRef);
  }

  async threadSettings(config: { systemPrompt?: string; temperature?: number }): Promise<ThreadSettings | null> {
    const componentRef = this.createDialogComponent(ThreadSettingsComponent);
    const dialog = componentRef.instance;
    
    dialog.initialSystemPrompt = config.systemPrompt ?? '';
    dialog.initialTemperature = config.temperature;
    dialog.systemPrompt.set(config.systemPrompt ?? '');
    dialog.temperature.set(config.temperature);

    const result = await firstValueFrom(dialog.result$);
    this.destroyDialog(componentRef);
    return result;
  }

  private createDialogComponent<T>(component: new (...args: any[]) => T): ComponentRef<T> {
    const componentRef = createComponent(component, {
      environmentInjector: this.injector
    });
    
    document.body.appendChild(componentRef.location.nativeElement);
    this.appRef.attachView(componentRef.hostView);
    
    return componentRef;
  }

  private destroyDialog<T>(componentRef: ComponentRef<T>): void {
    this.appRef.detachView(componentRef.hostView);
    componentRef.destroy();
    if (componentRef.location.nativeElement.parentNode) {
      componentRef.location.nativeElement.parentNode.removeChild(componentRef.location.nativeElement);
    }
  }
}

