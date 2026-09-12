import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {
  private readonly mobile = globalThis.matchMedia?.('(max-width: 768px)');
  // Left sidebar state
  private readonly sidebarOpenSignal = signal(!this.mobile?.matches);
  readonly isSidebarOpen = this.sidebarOpenSignal.asReadonly();

  // Right sidebar state
  private readonly rightSidebarOpenSignal = signal(!this.mobile?.matches);
  readonly isRightSidebarOpen = this.rightSidebarOpenSignal.asReadonly();

  constructor() {
    const onChange = () => this.closePanels();
    this.mobile?.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.mobile?.removeEventListener('change', onChange));
  }

  closePanels(): void {
    this.sidebarOpenSignal.set(false);
    this.rightSidebarOpenSignal.set(false);
  }

  toggleSidebar(): void {
    if (this.mobile?.matches) this.rightSidebarOpenSignal.set(false);
    this.sidebarOpenSignal.update((v) => !v);
  }

  setSidebarState(isOpen: boolean): void {
    this.sidebarOpenSignal.set(isOpen);
  }

  toggleRightSidebar(): void {
    if (this.mobile?.matches) this.sidebarOpenSignal.set(false);
    this.rightSidebarOpenSignal.update((v) => !v);
  }

  setRightSidebarState(isOpen: boolean): void {
    this.rightSidebarOpenSignal.set(isOpen);
  }
}
