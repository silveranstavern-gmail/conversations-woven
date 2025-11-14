import { Injectable } from '@angular/core';
import type { ChatMessage } from '@models/chat';

@Injectable({
  providedIn: 'root'
})
export class SummarizerService {
  async summarize(messages: ChatMessage[]): Promise<string> {
    if (!messages.length) {
      return 'Compacted summary unavailable.';
    }

    const parts = messages.map((message, index) => {
      const roleLabel =
        message.role === 'assistant'
          ? 'Assistant'
          : message.role === 'user'
            ? 'User'
            : message.role;
      const content = (message.rawMd ?? '').replace(/\s+/g, ' ').trim();
      const snippet = content.length > 220 ? `${content.slice(0, 217)}…` : content;
      return `${index + 1}. ${roleLabel}: ${snippet || '[no content]'}`;
    });

    return ['Compacted conversation summary:', ...parts].join('\n');
  }
}

