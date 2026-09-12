import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ChatMessage, Id } from '@models/chat';
import { MessageItemComponent } from '../message-item/message-item.component';

@Component({
  selector: 'app-message-list',
  imports: [MessageItemComponent],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageListComponent {
  public readonly busy = input(false);
  public readonly messages = input<ChatMessage[]>([]);
  public readonly activeMessageId = input<Id | null>(null);
  public readonly selectedIds = input<Id[]>([]);
  public readonly isContextSelectionActive = input(false);
  public readonly contextSelectedIds = input<Set<Id>>(new Set());

  public readonly deleteMessage = output<Id>();
  public readonly branchFrom = output<Id>();
  public readonly copyMessage = output<Id>();
  public readonly selectionChange = output<{ id: Id; selected: boolean; range: boolean }>();
  public readonly restoreCompaction = output<Id>();
  public readonly contextSelectionChange = output<{ messageId: Id; included: boolean }>();

  protected readonly selectedSet = computed(() => new Set(this.selectedIds()));

  protected readonly trackById = (_: number, item: ChatMessage): Id => item.id;

  protected onDelete(id: Id): void {
    this.deleteMessage.emit(id);
  }

  protected onBranch(id: Id): void {
    this.branchFrom.emit(id);
  }

  protected onCopy(id: Id): void {
    this.copyMessage.emit(id);
  }

  protected onSelectionChanged(event: { id: Id; selected: boolean; range: boolean }): void {
    this.selectionChange.emit(event);
  }

  protected onRestore(id: Id): void {
    this.restoreCompaction.emit(id);
  }

  protected onContextSelectionChange(event: { messageId: Id; included: boolean }): void {
    this.contextSelectionChange.emit(event);
  }
}
