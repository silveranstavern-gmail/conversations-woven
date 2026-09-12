import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatAdaptersService } from '@features/chat/data/chat-adapters.service';
import { ModelSelectorComponent } from './model-selector.component';

describe('ModelSelectorComponent', () => {
  for (const compact of [false, true]) {
    it(`keeps the saved model selected when the catalog loads (compact: ${compact})`, async () => {
      const models = signal<{ id: string; label: string }[]>([]);
      TestBed.configureTestingModule({
        imports: [ModelSelectorComponent],
        providers: [{ provide: ChatAdaptersService, useValue: {
          models, getModelById: () => null, isDefault: () => false
        } }]
      });
      const fixture = TestBed.createComponent(ModelSelectorComponent);
      fixture.componentRef.setInput('compact', compact);
      fixture.componentRef.setInput('selectedModelId', 'openrouter/free');
      fixture.detectChanges();
      await fixture.whenStable();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
      expect(select.value).toBe('openrouter/free');

      models.set([
        { id: 'paid/model', label: 'First paid model' },
        { id: 'openrouter/free', label: 'Free Models Router' }
      ]);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(select.value).toBe('openrouter/free');
      expect(select.selectedOptions[0].textContent).toContain('Free Models Router');
    });
  }
});
