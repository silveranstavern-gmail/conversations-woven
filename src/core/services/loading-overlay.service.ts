import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingOverlayService {
  private readonly _isVisible = signal(false);
  private readonly _message = signal<string>('');

  readonly isVisible = this._isVisible.asReadonly();
  readonly message = this._message.asReadonly();

  show(message: string): void {
    this._message.set(message);
    this._isVisible.set(true);
  }

  hide(): void {
    this._isVisible.set(false);
  }
}

