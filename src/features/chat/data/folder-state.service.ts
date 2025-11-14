import { inject, Injectable, signal } from '@angular/core';
import type { Folder } from '@models/folder';
import type { Id } from '@models/chat';
import { IdbService } from '@core/services/persistence/idb.service';

@Injectable({ providedIn: 'root' })
export class FolderStateService {
  private readonly idb = inject(IdbService);

  private readonly foldersSignal = signal<Folder[]>([]);
  private readonly expandedFoldersSignal = signal<Set<Id>>(new Set()); // UI state, in-memory

  readonly folders = this.foldersSignal.asReadonly();
  readonly expandedFolderIds = this.expandedFoldersSignal.asReadonly();

  constructor() {
    void this.loadInitialFolders();
  }

  private async loadInitialFolders(): Promise<void> {
    const folders = await this.idb.listFolders();
    this.foldersSignal.set(folders.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async createFolder(name: string): Promise<Folder> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Folder name cannot be empty');
    }

    const now = new Date().toISOString();
    const folder: Folder = {
      id: this.generateId(),
      name: trimmedName,
      createdAt: now
    };

    await this.idb.putFolder(folder);
    this.foldersSignal.update((current) => {
      const next = [...current, folder];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });

    return folder;
  }

  async renameFolder(id: Id, newName: string): Promise<void> {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      throw new Error('Folder name cannot be empty');
    }

    const folder = await this.idb.getFolder(id);
    if (!folder) {
      throw new Error('Folder not found');
    }

    const updated: Folder = {
      ...folder,
      name: trimmedName
    };

    await this.idb.putFolder(updated);
    this.foldersSignal.update((current) => {
      const next = current.map((f) => (f.id === id ? updated : f));
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async deleteFolder(id: Id): Promise<void> {
    const folder = await this.idb.getFolder(id);
    if (!folder) {
      return;
    }

    await this.idb.deleteFolder(id);
    this.foldersSignal.update((current) => current.filter((f) => f.id !== id));
    this.expandedFoldersSignal.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  toggleFolderExpansion(id: Id): void {
    this.expandedFoldersSignal.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  private generateId(): Id {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef?.randomUUID) {
      return cryptoRef.randomUUID();
    }
    return `folder-${Math.random().toString(36).slice(2, 10)}`;
  }
}

