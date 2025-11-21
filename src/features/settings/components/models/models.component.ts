import { DecimalPipe, SlicePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ChatAdaptersService,
  ChatModelVisibilityOption,
  ModelPreset
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
  protected readonly showNewOnly = signal(false);
  protected readonly selectedProviders = signal<Set<string>>(new Set());
  protected readonly dateFilterType = signal<'none' | 'after' | 'before' | 'range'>('none');
  protected readonly dateStart = signal('');
  protected readonly dateEnd = signal('');

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
  protected readonly filteredFreeCount = computed(() =>
    this.filteredCatalog().filter((model) => model.label.toLowerCase().includes('(free)')).length
  );
  protected readonly enabledFilteredFreeCount = computed(() =>
    this.filteredCatalog().filter((model) => model.enabled && model.label.toLowerCase().includes('(free)')).length
  );
  protected readonly enableFreeLabel = computed(() =>
    this.hasActiveFilters() ? 'Enable free (filtered)' : 'Enable free'
  );
  protected readonly enableFreeDisabled = computed(() => {
    if (this.hasActiveFilters()) {
      return this.filteredFreeCount() === 0 || this.enabledFilteredFreeCount() === this.filteredFreeCount();
    }
    return this.freeModelsCount() === 0 || this.enabledFreeCount() === this.freeModelsCount();
  });
  protected readonly enableFreeTooltip = computed(() => {
    if (!this.enableFreeDisabled()) {
      return '';
    }
    if (this.hasActiveFilters()) {
      return this.filteredFreeCount() === 0
        ? 'No free models match current filters'
        : 'All filtered free models are already enabled';
    }
    return this.freeModelsCount() === 0
      ? 'No free models available'
      : 'All free models are already enabled';
  });
  protected readonly clearFiltersDisabled = computed(() => !this.hasActiveFilters());
  protected readonly clearFiltersTooltip = computed(() =>
    this.clearFiltersDisabled() ? 'No filters to clear' : ''
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
    this.showNewOnly() ||
    this.selectedProviders().size > 0 ||
    this.dateFilterType() !== 'none' ||
    !!this.dateStart().trim() ||
    !!this.dateEnd().trim()
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
    const newOnly = this.showNewOnly();
    const activeProviders = this.selectedProviders();
    const sort = this.sortOption();
    const dateFilter = this.dateFilterType();
    const startDate = this.parseDate(this.dateStart());
    const endDate = this.parseDate(this.dateEnd());

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
    if (newOnly) {
      models = models.filter(m => this.isNew(m.created));
    }

    // Provider Filter
    if (activeProviders.size > 0) {
      models = models.filter(m => activeProviders.has(m.providerId));
    }

    // Date Filters
    if (dateFilter !== 'none' && (startDate || endDate)) {
      models = models.filter((model) => this.matchesDateFilter(model.created, dateFilter, startDate, endDate));
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
    if (this.hasActiveFilters()) {
      const modelsToEnable = this.filteredCatalog().filter(
        (model) => !model.enabled && model.label.toLowerCase().includes('(free)')
      );
      if (modelsToEnable.length === 0) {
        return;
      }
      modelsToEnable.forEach((model) => {
        this.adapters.setModelEnabled(model.id, true);
      });
    } else {
      if (this.enabledFreeCount() === this.freeModelsCount()) {
        return;
      }
      this.adapters.enableFreeModels();
    }
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

  protected toggleNewOnly(): void {
    this.showNewOnly.update(v => !v);
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

  protected onDateFilterTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'none' | 'after' | 'before' | 'range';
    this.dateFilterType.set(value);
    if (value === 'none') {
      this.dateStart.set('');
      this.dateEnd.set('');
    }
  }

  protected onDateStartChange(event: Event): void {
    this.dateStart.set((event.target as HTMLInputElement).value);
  }

  protected onDateEndChange(event: Event): void {
    this.dateEnd.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.showFreeOnly.set(false);
    this.showVisionOnly.set(false);
    this.showToolsOnly.set(false);
    this.showNewOnly.set(false);
    this.selectedProviders.set(new Set());
    this.dateFilterType.set('none');
    this.dateStart.set('');
    this.dateEnd.set('');
  }

  protected handleSavePreset(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const preset = this.adapters.createModelPreset();
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `model-preset-${preset.exportedAt.replace(/[:]/g, '-')}.json`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  protected handleImportClick(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  protected async handleImportPreset(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ModelPreset>;
      this.adapters.applyModelPreset(parsed);
    } catch (error) {
      console.error('Failed to import model preset', error);
    } finally {
      input.value = '';
    }
  }

  private matchesDateFilter(
    createdSeconds: number,
    filterType: 'after' | 'before' | 'range',
    start: number | null,
    end: number | null
  ): boolean {
    const createdMs = createdSeconds ? createdSeconds * 1000 : 0;
    if (!createdMs) {
      return false;
    }

    switch (filterType) {
      case 'after':
        return !!start && createdMs >= start;
      case 'before':
        return !!end && createdMs <= end;
      case 'range':
        return (!!start ? createdMs >= start : true) && (!!end ? createdMs <= end : true);
      default:
        return true;
    }
  }

  private parseDate(value: string): number | null {
    if (!value.trim()) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
}
