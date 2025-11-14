import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ChatMessage, Id } from '@models/chat';
import { MessageItemComponent } from '../message-item/message-item.component';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [ScrollingModule, MessageItemComponent],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageListComponent {
  private static readonly ITEM_SIZE = 160;

  public readonly messages = input<ChatMessage[]>([]);
  public readonly activeMessageId = input<Id | null>(null);
  public readonly selectedIds = input<Id[]>([]);

  public readonly deleteMessage = output<Id>();
  public readonly branchFrom = output<Id>();
  public readonly copyMessage = output<Id>();
  public readonly selectionChange = output<{ id: Id; selected: boolean; range: boolean }>();
  public readonly restoreCompaction = output<Id>();
  public readonly updateMessage = output<{ id: Id; content: string }>();

  protected readonly itemSize = MessageListComponent.ITEM_SIZE;
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

  protected onUpdate(payload: { id: Id; content: string }): void {
    this.updateMessage.emit(payload);
  }
}
