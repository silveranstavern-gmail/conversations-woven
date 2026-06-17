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
      content: `${existing.content}${detail.content}`
    };
  }

  return normalized.sort((a, b) => a.index - b.index);
}

export function mergeReasoningDetail(
  details: readonly ReasoningDetail[],
  nextDetail: ReasoningDetail
): ReasoningDetail[] {
  return normalizeReasoningDetails([...details, nextDetail]);
}

function isSameReasoningBlock(first: ReasoningDetail, second: ReasoningDetail): boolean {
  if (first.id || second.id) {
    return first.id === second.id;
  }

  return first.type === second.type && first.index === second.index;
}
