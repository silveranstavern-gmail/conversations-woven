import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild
} from '@angular/core';
import { ChatModelVisibilityOption } from '@features/chat/data/chat-adapters.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';

@Component({
  selector: 'app-model-details',
  imports: [DatePipe, DecimalPipe, TitleCasePipe, ButtonDirective],
  templateUrl: './model-details.component.html',
  styleUrl: './model-details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelDetailsComponent implements AfterViewInit {
  readonly model = input.required<ChatModelVisibilityOption>();
  readonly dismiss = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private pointerStartedOutside = false;

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
    this.dismiss.emit();
  }

  protected onPointerDown(event: PointerEvent): void {
    this.pointerStartedOutside = this.isOutside(event);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (this.pointerStartedOutside && this.isOutside(event)) this.close();
    this.pointerStartedOutside = false;
  }

  private isOutside(event: MouseEvent): boolean {
    const dialog = this.dialog().nativeElement;
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog &&
      (event.clientX < rect.left || event.clientX > rect.right ||
       event.clientY < rect.top || event.clientY > rect.bottom);
  }
}
