import { TestBed } from '@angular/core/testing';
import { ModelDetailsComponent } from './model-details.component';

describe('Model details overlay', () => {
  const description = 'A long description with readable paragraphs.\n\n'.repeat(100) + 'Final sentence.';

  function setup() {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const fixture = TestBed.createComponent(ModelDetailsComponent);
    fixture.componentRef.setInput('model', {
      id: 'provider/example', label: 'Example model', adapterLabel: 'OpenRouter',
      providerId: 'provider', enabled: true, contextLength: 128000, created: 0,
      pricing: { prompt: 0.000001, completion: 0.000002 },
      filterCapabilities: { image: true, video: false, tools: true, json: true },
      details: { description, pricing: { request: 0, image: 0 },
        architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } }
    });
    const dismissed = jasmine.createSpy('dismissed');
    fixture.componentInstance.dismiss.subscribe(dismissed);
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    return { fixture, dialog, dismissed, opener };
  }

  it('shows the complete description and restores focus when closed with the button', () => {
    const { fixture, dialog, dismissed, opener } = setup();
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelector('.description')?.textContent).toBe(description);
    expect(dialog.textContent).toContain('128,000 tokens');
    dialog.querySelector('button')!.click();
    expect(dialog.open).toBeFalse();
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    fixture.destroy();
    opener.remove();
  });

  it('keeps content clicks open and dismisses only gestures starting and ending on the backdrop', () => {
    const { fixture, dialog, dismissed, opener } = setup();
    const descriptionElement = dialog.querySelector('.description') as HTMLElement;
    descriptionElement.click();
    expect(dismissed).not.toHaveBeenCalled();
    descriptionElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1 }));
    expect(dismissed).not.toHaveBeenCalled();
    dialog.dispatchEvent(new PointerEvent('pointerdown', { clientX: -1, clientY: -1 }));
    dialog.dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1 }));
    expect(dialog.open).toBeFalse();
    expect(dismissed).toHaveBeenCalledTimes(1);
    fixture.destroy();
    opener.remove();
  });

  it('dismisses on the native Escape cancellation event', () => {
    const { fixture, dialog, dismissed, opener } = setup();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBeFalse();
    expect(dismissed).toHaveBeenCalledTimes(1);
    fixture.destroy();
    opener.remove();
  });

  it('provides a fallback when description and optional details are missing', () => {
    const { fixture, dialog, opener } = setup();
    fixture.componentRef.setInput('model', {
      ...fixture.componentInstance.model(), details: undefined
    });
    fixture.detectChanges();
    expect(dialog.textContent).toContain('No description is available');
    dialog.querySelector('button')!.click();
    fixture.destroy();
    opener.remove();
  });
});
