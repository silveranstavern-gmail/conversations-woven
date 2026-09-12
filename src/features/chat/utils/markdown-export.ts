import type { ChatMessage, ChatThread, ReasoningConfig } from '@models/chat';
import { normalizeReasoningDetails } from './reasoning-details';

export function formatMessagesMarkdown(
  messages: ChatMessage[],
  reasoningConfig: ReasoningConfig | null,
): string {
  if (!messages.length) {
    return '';
  }
  return messages
    .map((message) => {
      const author =
        message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'You' : message.role;
      const timestamp = message.createdAt;
      const body = (message.rawMd ?? '').trim();
      const includeReasoning =
        (reasoningConfig?.captureInHistory ?? true) && (message.reasoning?.visible ?? false);
      let reasoning = '';
      if (includeReasoning && message.reasoning) {
        const summaryLines = message.reasoning.summary
          ? message.reasoning.summary.split(/\r?\n/).map((line) => (line ? `> ${line}` : '>'))
          : [];
        const detailLines = normalizeReasoningDetails(message.reasoning.details ?? [])
          .filter(
            (detail) => detail.type === 'reasoning.text' || detail.type === 'reasoning.summary',
          )
          .flatMap((detail) =>
            detail.content.split(/\r?\n/).map((line) => (line ? `> ${line}` : '>')),
          );
        const lines = [...summaryLines, ...detailLines];
        if (lines.length) {
          reasoning = `\n\n**Thinking Process:**\n${lines.join('\n')}`;
        }
      }
      const metadata = [
        message.model ? `Model: ${message.model}` : '',
        message.state !== 'complete' ? `Status: ${message.state}` : '',
        message.finishReason === 'length' ? 'Output limit reached' : '',
      ]
        .filter(Boolean)
        .join(' / ');
      return `### ${author} / ${timestamp}\n\n${metadata ? metadata + '\n\n' : ''}${body}${reasoning}`;
    })
    .join('\n\n---\n\n');
}

export function buildThreadDocument(thread: ChatThread, messages: ChatMessage[]): string {
  const header =
    `# ${thread.title.replace(/[\r\n]/g, ' ')}\n\nExported ${new Date().toISOString()}\n` +
    (thread.preferredModelId ? `\nModel: ${thread.preferredModelId}\n` : '') +
    (thread.systemPrompt ? `\n## System instructions\n\n${thread.systemPrompt}\n` : '');
  const body = formatMessagesMarkdown(messages, thread.reasoningConfig ?? null);
  return body ? `${header}\n${body}` : header;
}
