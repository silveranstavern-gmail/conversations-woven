import { TestBed } from '@angular/core/testing';
import { MessageItemComponent } from './message-item.component';
import { ChatActionsService } from '../../data/chat-actions.service';
import { KeychainService } from '@core/services/keychain.service';
import { signal } from '@angular/core';

describe('message editor', () => {
  it('keeps the draft open when saving fails and allows a successful retry', async () => {
    const save = jasmine.createSpy('save').and.rejectWith(new Error('quota exceeded'));
    TestBed.configureTestingModule({
      providers: [
        { provide: ChatActionsService, useValue: { editMessageContent: save } },
        {
          provide: KeychainService,
          useValue: { isUnlocked: signal(false), storedProviders: signal([]) },
        },
      ],
    });
    const fixture = TestBed.createComponent(MessageItemComponent);
    fixture.componentRef.setInput('message', {
      id: 'm',
      threadId: 't',
      role: 'user',
      state: 'complete',
      rawMd: 'Original',
      revision: 1,
      createdAt: '2026-01-01',
    });
    fixture.detectChanges();
    const button = (text: string): HTMLButtonElement =>
      Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((item) => item.textContent?.trim() === text)!;
    button('Edit').click();
    fixture.detectChanges();
    const editor: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    editor.value = 'Updated text';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Save changes').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('Updated text');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Could not save',
    );
    save.and.resolveTo(true);
    button('Save changes').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });
});
