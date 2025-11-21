import { Injectable, inject, ComponentRef, ViewContainerRef, ApplicationRef, createComponent, EnvironmentInjector } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { PromptDialogComponent } from '@shared/ui/prompt-dialog/prompt-dialog.component';
import { ConfirmDialogComponent } from '@shared/ui/confirm-dialog/confirm-dialog.component';
import { AlertDialogComponent } from '@shared/ui/alert-dialog/alert-dialog.component';
import { ThreadSettingsComponent, ThreadSettings } from '@features/chat/components/thread-settings/thread-settings.component';
import { MetadataDialogComponent, MetadataDialogResult } from '@features/chat/components/metadata-dialog/metadata-dialog.component';
import { ChatMessage } from '@models/chat';

export interface PromptConfig {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
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
    
    componentRef.setInput('title', config.title);
    componentRef.setInput('message', config.message ?? '');
    componentRef.setInput('initialValue', config.initialValue ?? '');
    componentRef.setInput('placeholder', config.placeholder ?? '');
    componentRef.setInput('inputType', config.inputType ?? 'text');
    componentRef.setInput('confirmLabel', config.confirmLabel ?? 'OK');
    componentRef.setInput('cancelLabel', config.cancelLabel ?? 'Cancel');
    // inputValue will be synced via effect from initialValue input

    const result = await firstValueFrom(dialog.result$);
    this.destroyDialog(componentRef);
    return result;
  }

  async confirm(config: ConfirmConfig): Promise<boolean> {
    const componentRef = this.createDialogComponent(ConfirmDialogComponent);
    const dialog = componentRef.instance;
    
    componentRef.setInput('title', config.title);
    componentRef.setInput('message', config.message);
    componentRef.setInput('confirmLabel', config.confirmLabel ?? 'Confirm');
    componentRef.setInput('cancelLabel', config.cancelLabel ?? 'Cancel');
    componentRef.setInput('danger', config.danger ?? false);

    const result = await firstValueFrom(dialog.result$);
    this.destroyDialog(componentRef);
    return result;
  }

  async alert(config: AlertConfig): Promise<void> {
    const componentRef = this.createDialogComponent(AlertDialogComponent);
    const dialog = componentRef.instance;
    
    componentRef.setInput('title', config.title);
    componentRef.setInput('message', config.message);
    componentRef.setInput('confirmLabel', config.confirmLabel ?? 'OK');

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

  async metadataDialog(config: {
    threadId: string;
    initialTitle?: string;
    initialTags?: string[];
    initialSummary?: string;
    messages: ChatMessage[];
  }): Promise<MetadataDialogResult | null> {
    const componentRef = this.createDialogComponent(MetadataDialogComponent);
    const dialog = componentRef.instance;
    
    dialog.threadId = config.threadId;
    dialog.initialTitle = config.initialTitle ?? '';
    dialog.initialTags = config.initialTags ?? [];
    dialog.initialSummary = config.initialSummary ?? '';
    dialog.messages = config.messages;
    
    dialog.titleValue.set(config.initialTitle ?? '');
    dialog.tagsValue.set(config.initialTags ?? []);
    dialog.summaryValue.set(config.initialSummary ?? '');

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

