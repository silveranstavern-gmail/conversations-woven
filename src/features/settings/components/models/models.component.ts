import { DecimalPipe, SlicePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ChatAdaptersService,
  ChatModelVisibilityOption
} from '@features/chat/data/chat-adapters.service';
import { ButtonDirective } from '@shared/ui/button/button.directive';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

type SortOption = 'default' | 'newest' | 'price-asc' | 'price-desc' | 'context-desc';

@Component({
  selector: 'app-settings-models',
  imports: [DecimalPipe, SlicePipe, TitleCasePipe, ButtonDirective, TooltipDirective],
  templateUrl: './models.component.html',
  styleUrl: './models.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelsComponent {
  private readonly adapters = inject(ChatAdaptersService);

  // --- State Signals ---
  protected readonly searchTerm = signal('');
  protected readonly sortOption = signal<SortOption>('default');
  
  // Filters
  protected readonly showFreeOnly = signal(false);
  protected readonly showVisionOnly = signal(false);
  protected readonly showToolsOnly = signal(false);
  protected readonly selectedProviders = signal<Set<string>>(new Set());

  // --- Base Data ---
  protected readonly catalog = this.adapters.catalog;
  protected readonly totalCount = computed(() => this.catalog().length);
  protected readonly disabledCount = computed(
    () => this.catalog().filter((model) => !model.enabled).length
  );
  protected readonly enabledCount = computed(() => this.totalCount() - this.disabledCount());
  protected readonly freeModels = computed(() =>
    this.catalog().filter((model) => model.label.toLowerCase().includes('(free)'))
  );
  protected readonly freeModelsCount = computed(() => this.freeModels().length);
  protected readonly enabledFreeCount = computed(
    () => this.freeModels().filter((model) => model.enabled).length
  );
  
  // Computed counts for filtered catalog (when filters are active)
  protected readonly filteredEnabledCount = computed(() => 
    this.filteredCatalog().filter((model) => model.enabled).length
  );
  protected readonly filteredDisabledCount = computed(() => 
    this.filteredCatalog().filter((model) => !model.enabled).length
  );
  
  // Check if any filters are active
  protected readonly hasActiveFilters = computed(() => 
    !!this.searchTerm().trim() ||
    this.showFreeOnly() ||
    this.showVisionOnly() ||
    this.showToolsOnly() ||
    this.selectedProviders().size > 0
  );
  
  // Dynamic button labels based on active filters
  protected readonly enableAllLabel = computed(() => 
    this.hasActiveFilters() ? 'Enable Filtered' : 'Enable All'
  );
  protected readonly disableAllLabel = computed(() => 
    this.hasActiveFilters() ? 'Disable Filtered' : 'Disable All'
  );
  // --- Computed Options for UI ---
  // Extract unique providers for the filter dropdown
  protected readonly availableProviders = computed(() => {
    const models = this.catalog();
    const providers = new Set(models.map(m => m.providerId));
    return Array.from(providers).sort();
  });

  // --- The Master Filter Pipeline ---
  protected readonly filteredCatalog = computed(() => {
    let models = this.catalog();
    const term = this.searchTerm().toLowerCase().trim();
    
    // Filter State
    const freeOnly = this.showFreeOnly();
    const visionOnly = this.showVisionOnly();
    const toolsOnly = this.showToolsOnly();
    const activeProviders = this.selectedProviders();
    const sort = this.sortOption();

    // Status Lookups (Computed once for O(1) access inside the sort loop)
    const defaultId = this.adapters.defaultModel()?.id;
    const pinnedSet = new Set(this.adapters.pinnedModelIds());

    // --- 1. Filtering ---
    
    // Text Filter
    if (term) {
      models = models.filter(m =>
        m.label.toLowerCase().includes(term) ||
        m.id.toLowerCase().includes(term)
      );
    }

    // Capability Filters
    if (freeOnly) {
      models = models.filter(m => m.pricing.prompt === 0 && m.pricing.completion === 0);
    }
    if (visionOnly) {
      models = models.filter(m => m.filterCapabilities.image);
    }
    if (toolsOnly) {
      models = models.filter(m => m.filterCapabilities.tools);
    }

    // Provider Filter
    if (activeProviders.size > 0) {
      models = models.filter(m => activeProviders.has(m.providerId));
    }

    // --- 2. Tiered Sorting ---
    
    // Helper to determine Tier (0-3)
    const getTier = (model: ChatModelVisibilityOption): number => {
      if (model.id === defaultId) return 0; // Top priority
      if (pinnedSet.has(model.id)) return 1; // Pinned
      if (model.enabled) return 2;          // Active/Enabled
      return 3;                             // Inactive/Disabled
    };

    return models.sort((a, b) => {
      const tierA = getTier(a);
      const tierB = getTier(b);

      // Primary Sort: Respect the Hierarchy
      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Secondary Sort: Apply User Selection WITHIN the tier
      switch (sort) {
        case 'newest':
          return (b.created || 0) - (a.created || 0);
          
        case 'price-asc':
          // Sum of In+Out for approximation
          return (a.pricing.prompt + a.pricing.completion) - 
                 (b.pricing.prompt + b.pricing.completion);
          
        case 'price-desc':
          return (b.pricing.prompt + b.pricing.completion) - 
                 (a.pricing.prompt + a.pricing.completion);
          
        case 'context-desc':
          return (b.contextLength || 0) - (a.contextLength || 0);
          
        default: // 'default' or fallback
          // Alphabetical sort for standard view
          return a.label.localeCompare(b.label);
      }
    });
  });

  protected handleToggleModel(modelId: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    if (!checkbox) {
      return;
    }
    this.adapters.setModelEnabled(modelId, checkbox.checked);
  }

  protected handleEnableAll(): void {
    if (this.hasActiveFilters()) {
      // Scope to currently visible models in filteredCatalog
      const modelsToEnable = this.filteredCatalog().filter((model) => !model.enabled);
      modelsToEnable.forEach((model) => {
        this.adapters.setModelEnabled(model.id, true);
      });
    } else {
      // No filters: Global action
      if (this.disabledCount() === 0) {
        return;
      }
      this.adapters.enableAllModels();
    }
  }

  protected handleDisableAll(): void {
    if (this.hasActiveFilters()) {
      // Scope to currently visible models in filteredCatalog
      const modelsToDisable = this.filteredCatalog().filter((model) => model.enabled);
      modelsToDisable.forEach((model) => {
        this.adapters.setModelEnabled(model.id, false);
      });
    } else {
      // No filters: Global action
      if (this.enabledCount() === 0) {
        return;
      }
      this.adapters.disableAllModels();
    }
  }

  protected handleEnableFree(): void {
    if (this.enabledFreeCount() === this.freeModelsCount()) {
      return;
    }
    this.adapters.enableFreeModels();
  }

  protected trackByModelId(_: number, model: ChatModelVisibilityOption): string {
    return model.id;
  }

  protected handleSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  // --- Filter Actions ---
  protected toggleProvider(provider: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedProviders.update(set => {
      const next = new Set(set);
      checked ? next.add(provider) : next.delete(provider);
      return next;
    });
  }
  
  protected toggleFreeOnly(): void {
    this.showFreeOnly.update(v => !v);
  }

  protected toggleVisionOnly(): void {
    this.showVisionOnly.update(v => !v);
  }

  protected toggleToolsOnly(): void {
    this.showToolsOnly.update(v => !v);
  }

  protected onSortChange(event: Event): void {
    this.sortOption.set((event.target as HTMLSelectElement).value as SortOption);
  }

  protected handleSetDefault(modelId: string): void {
    const isDefault = this.adapters.isDefault(modelId);
    this.adapters.setDefaultModel(isDefault ? null : modelId);
  }

  protected handleTogglePin(modelId: string): void {
    this.adapters.togglePinModel(modelId);
  }

  protected isDefault(modelId: string): boolean {
    return this.adapters.isDefault(modelId);
  }

  protected isPinned(modelId: string): boolean {
    return this.adapters.isPinned(modelId);
  }

  protected isNew(created: number): boolean {
    // Check if model was created within the last 30 days
    const thirtyDaysAgo = Date.now() - 2592000000; // 30 days in milliseconds
    return (created * 1000) > thirtyDaysAgo;
  }
}
