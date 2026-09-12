import type { ReasoningDetail } from '@models/chat';

export function normalizeReasoningDetails(details: readonly ReasoningDetail[]): ReasoningDetail[] {
  const normalized: ReasoningDetail[] = [];

  for (const detail of details) {
    const existingIndex = normalized.findIndex((item) => isSameReasoningBlock(item, detail));
    if (existingIndex === -1) {
      normalized.push({ ...detail });
      continue;
    }

    const existing = normalized[existingIndex];
    normalized[existingIndex] = {
      ...existing,
      ...detail,
      signature: detail.signature ?? existing.signature,
      format: detail.format ?? existing.format,
      content: `${existing.content}${detail.content}`,
    };
  }

  return normalized.sort((a, b) => a.index - b.index);
}

export function mergeReasoningDetail(
  details: readonly ReasoningDetail[],
  nextDetail: ReasoningDetail,
): ReasoningDetail[] {
  return normalizeReasoningDetails([...details, nextDetail]);
}

function isSameReasoningBlock(first: ReasoningDetail, second: ReasoningDetail): boolean {
  if (first.type !== second.type) return false;
  if (first.id && second.id) {
    return first.id === second.id;
  }

  return first.type === second.type && first.index === second.index;
}

// OpenRouter uses different payload keys for each block type. Keep that wire format
// at the adapter boundary, while preserving signatures and formats in storage.
export interface OpenRouterReasoningDetail {
  type?: string;
  text?: string;
  summary?: string;
  data?: string;
  index?: number;
  id?: string | null;
  format?: string;
  signature?: string | null;
}

export function fromOpenRouterReasoning(detail: OpenRouterReasoningDetail): ReasoningDetail | null {
  if (
    detail.type !== 'reasoning.text' &&
    detail.type !== 'reasoning.summary' &&
    detail.type !== 'reasoning.encrypted'
  )
    return null;
  return {
    type: detail.type,
    content: detail.text ?? detail.summary ?? detail.data ?? '',
    index: detail.index ?? 0,
    ...(detail.id ? { id: detail.id } : {}),
    ...(detail.format ? { format: detail.format } : {}),
    ...(detail.signature ? { signature: detail.signature } : {}),
  };
}

export function toOpenRouterReasoning(detail: ReasoningDetail): OpenRouterReasoningDetail {
  const { content, ...metadata } = detail;
  const key =
    detail.type === 'reasoning.text'
      ? 'text'
      : detail.type === 'reasoning.summary'
        ? 'summary'
        : 'data';
  return { ...metadata, [key]: content };
}
