import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ChatMessage, Id } from '@models/chat';
import { MarkdownRendererComponent } from '@shared/ui/markdown-renderer/markdown-renderer.component';

type ViewMode = 'rendered' | 'raw';
type MessageViewStatus = {
  kind: 'info' | 'error';
  title: string;
  detail?: string;
};

@Component({
  selector: 'app-message-item',
  standalone: true,
  imports: [DatePipe, MarkdownRendererComponent],
  templateUrl: './message-item.component.html',
  styleUrl: './message-item.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageItemComponent {
  public readonly message = input.required<ChatMessage>();
  public readonly isActive = input(false);
  public readonly isSelected = input(false);
  public readonly isContextSelectionActive = input(false);
  public readonly isContextSelected = input(false);

  public readonly deleteMessage = output<ChatMessage['id']>();
  public readonly branchFrom = output<ChatMessage['id']>();
  public readonly copyMessage = output<ChatMessage['id']>();
  public readonly restoreCompaction = output<ChatMessage['id']>();
  public readonly updateMessage = output<{ id: Id; content: string }>();
  public readonly selectionChange = output<{
    id: ChatMessage['id'];
    selected: boolean;
    range: boolean;
  }>();
  public readonly contextSelectionChange = output<{ messageId: Id; included: boolean }>();

  protected readonly mode = signal<ViewMode>('rendered');
  protected readonly isEditing = signal(false);
  protected readonly editDraft = signal('');

  protected readonly authorLabel = computed(() => {
    const value = this.message().role;
    return value === 'assistant' ? 'Assistant' : value === 'user' ? 'You' : value;
  });

  protected readonly timestamp = computed(() => new Date(this.message().createdAt));
  protected readonly compactedCount = computed(() => this.message().compactedFrom?.length ?? 0);
  protected readonly isCompacted = computed(() => this.compactedCount() > 0);
  protected readonly status = computed<MessageViewStatus | null>(() => {
    const message = this.message();
    switch (message.state) {
      case 'streaming':
        return {
          kind: 'info',
          title: 'Generating response...',
          detail: 'Waiting for the model to return tokens.'
        };
      case 'sending':
        return {
          kind: 'info',
          title: 'Sending message...',
          detail: 'Queued for delivery.'
        };
      case 'failed':
        return {
          kind: 'error',
          title: 'Response failed',
          detail: message.error ?? 'The model did not return any content.'
        };
      default:
        return null;
    }
  });
  protected readonly canEdit = computed(() => {
    const message = this.message();
    if (message.compactedFrom?.length) {
      return false;
    }
    if (message.state === 'streaming' || message.state === 'sending') {
      return false;
    }
    return message.role === 'user' || message.role === 'assistant';
  });
  protected readonly canCommitEdit = computed(() => this.editDraft().trim().length > 0);

  protected onSwitchMode(next: ViewMode): void {
    this.mode.set(next);
  }

  protected handleDelete(): void {
    this.deleteMessage.emit(this.message().id);
  }

  protected handleBranch(): void {
    this.branchFrom.emit(this.message().id);
  }

  protected handleCopy(): void {
    this.copyMessage.emit(this.message().id);
  }

  protected handleStartEdit(): void {
    if (!this.canEdit()) {
      return;
    }
    this.editDraft.set(this.message().rawMd ?? '');
    this.isEditing.set(true);
  }

  protected handleEditInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea) {
      return;
    }
    this.editDraft.set(textarea.value);
  }

  protected handleCancelEdit(): void {
    this.isEditing.set(false);
    this.editDraft.set('');
  }

  protected handleSaveEdit(): void {
    if (!this.canCommitEdit()) {
      return;
    }
    this.updateMessage.emit({
      id: this.message().id,
      content: this.editDraft().trim()
    });
    this.isEditing.set(false);
    this.editDraft.set('');
  }

  protected handleSelectionToggle(event: MouseEvent): void {
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.selectionChange.emit({
      id: this.message().id,
      selected: checkbox.checked,
      range: event.shiftKey
    });
  }

  protected handleUncompact(): void {
    this.restoreCompaction.emit(this.message().id);
  }

  protected handleContextSelectionToggle(event: Event): void {
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.contextSelectionChange.emit({
      messageId: this.message().id,
      included: checkbox.checked
    });
  }
}
