import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { MetadataGeneratorService, GeneratedMetadata } from '@core/services/metadata-generator.service';
import { ChatMessage } from '@models/chat';

export interface MetadataDialogResult {
  title: string;
  tags: string[];
  summary?: string;
}

@Component({
  selector: 'app-metadata-dialog',
  standalone: true,
  templateUrl: './metadata-dialog.component.html',
  styleUrl: './metadata-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MetadataDialogComponent {
  private readonly metadataGenerator = inject(MetadataGeneratorService);

  title = 'Edit Metadata';
  initialTitle = '';
  initialTags: string[] = [];
  initialSummary = '';
  threadId = '';
  messages: ChatMessage[] = [];

  readonly titleValue = signal('');
  readonly tagsValue = signal<string[]>([]);
  readonly summaryValue = signal('');
  readonly tagInput = signal('');
  readonly isGenerating = signal(false);

  readonly result$ = new Subject<MetadataDialogResult | null>();

  protected handleTitleChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.titleValue.set(value);
  }

  protected handleSummaryChange(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.summaryValue.set(value);
    // Auto-resize textarea
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  protected handleTagInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.tagInput.set(value);
  }

  protected handleTagInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTag();
    } else if (event.key === 'Backspace' && this.tagInput().trim() === '') {
      // Remove last tag if input is empty
      const tags = this.tagsValue();
      if (tags.length > 0) {
        this.tagsValue.set(tags.slice(0, -1));
      }
    }
  }

  protected addTag(): void {
    const tag = this.tagInput().trim().toLowerCase();
    if (tag && !this.tagsValue().includes(tag)) {
      this.tagsValue.update(tags => [...tags, tag]);
      this.tagInput.set('');
    }
  }

  protected removeTag(tag: string): void {
    this.tagsValue.update(tags => tags.filter(t => t !== tag));
  }

  protected async handleGenerate(): Promise<void> {
    if (this.isGenerating() || !this.threadId || this.messages.length === 0) {
      return;
    }

    this.isGenerating.set(true);
    try {
      const generated = await this.metadataGenerator.generateMetadata(this.threadId, this.messages);
      if (generated) {
        this.titleValue.set(generated.title);
        this.tagsValue.set(generated.tags);
        this.summaryValue.set(generated.summary);
      }
    } catch (error) {
      console.error('Error generating metadata:', error);
    } finally {
      this.isGenerating.set(false);
    }
  }

  protected handleConfirm(): void {
    const result: MetadataDialogResult = {
      title: this.titleValue().trim() || 'Untitled Conversation',
      tags: this.tagsValue(),
      summary: this.summaryValue().trim() || undefined
    };
    this.result$.next(result);
    this.result$.complete();
  }

  protected handleCancel(): void {
    this.result$.next(null);
    this.result$.complete();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleCancel();
    }
    // Allow Ctrl/Cmd+Enter to submit
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.handleConfirm();
    }
  }
}

