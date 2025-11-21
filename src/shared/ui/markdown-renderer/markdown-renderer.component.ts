import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const marked = new Marked({
  breaks: true,
  gfm: true,
  async: false
});

@Component({
  selector: 'app-markdown-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="markdown" [innerHTML]="sanitized()"></div>`,
  styleUrls: ['./markdown-renderer.component.css']
})
export class MarkdownRendererComponent {
  private readonly sanitizer = inject(DomSanitizer);

  public readonly content = input<string>('');

  protected readonly sanitized = computed<SafeHtml | string>(() => {
    const source = this.content();
    if (!source) {
      return '';
    }
    const rendered = marked.parse(source) as string;
    const clean = DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true }
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  });
}
