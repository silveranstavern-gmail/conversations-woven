import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {
  // Left sidebar state
  private readonly sidebarOpenSignal = signal(true);
  readonly isSidebarOpen = this.sidebarOpenSignal.asReadonly();

  // Right sidebar state
  private readonly rightSidebarOpenSignal = signal(true);
  readonly isRightSidebarOpen = this.rightSidebarOpenSignal.asReadonly();

  toggleSidebar(): void {
    this.sidebarOpenSignal.update((v) => !v);
  }

  setSidebarState(isOpen: boolean): void {
    this.sidebarOpenSignal.set(isOpen);
  }

  toggleRightSidebar(): void {
    this.rightSidebarOpenSignal.update((v) => !v);
  }

  setRightSidebarState(isOpen: boolean): void {
    this.rightSidebarOpenSignal.set(isOpen);
  }
}

