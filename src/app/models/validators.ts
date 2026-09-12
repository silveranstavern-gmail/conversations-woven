import { z } from 'zod';
import type { ChatMessage, ChatThread, Id } from './chat';

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Must be a valid ISO date string'
  });

export const idSchema = z.string().min(1) as unknown as z.ZodType<Id>;

export const messageStateSchema = z.enum([
  'draft',
  'sending',
  'streaming',
  'complete',
  'failed',
  'stopped'
]);

const reasoningDetailSchema = z.object({
  type: z.enum(['reasoning.summary', 'reasoning.encrypted', 'reasoning.text']),
  content: z.string(),
  index: z.number().int().nonnegative(),
  id: z.string().optional(),
  format: z.string().optional(),
  signature: z.string().optional()
});

const reasoningDataSchema = z.object({
  details: z.array(reasoningDetailSchema).optional(),
  summary: z.string().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional()
});

const reasoningConfigSchema = z.object({
  enabled: z.boolean(),
  effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  maxTokens: z.number().int().positive().optional(),
  showInChat: z.boolean(),
  captureInHistory: z.boolean(),
  summaryVerbosity: z.enum(['auto', 'concise', 'detailed']).optional()
});

export const chatThreadSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  preferredModelId: z.string().min(1).optional(),
  rootMessageId: idSchema.optional(),
  activeMessageId: idSchema.optional(),
  messageCount: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1)).optional(),
  meta: z.record(z.any()).optional(),
  version: z.number().int().positive(),
  pinned: z.boolean().optional(),
  protected: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  folderId: idSchema.optional(),
  reasoningConfig: reasoningConfigSchema.optional()
});

export const chatMessageSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  parentId: idSchema.optional(),
  createdAt: isoDateString,
  model: z.string().min(1).optional(),
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
  rawMd: z.string().optional(),
  renderedMd: z.string().optional(),
  revision: z.number().int().nonnegative(),
  compactedFrom: z.array(idSchema).min(1).optional(),
  compactedSummary: z.string().optional(),
  state: messageStateSchema,
  finishReason: z.string().optional(),
  error: z.string().optional(),
  reasoning: reasoningDataSchema.optional()
});

export const chatThreadsSchema = z.array(chatThreadSchema);
export const chatMessagesSchema = z.array(chatMessageSchema);

export const parseChatThread = (value: unknown): ChatThread => chatThreadSchema.parse(value);
export const parseChatThreads = (value: unknown): ChatThread[] =>
  chatThreadsSchema.parse(value);

export const parseChatMessage = (value: unknown): ChatMessage => chatMessageSchema.parse(value);
export const parseChatMessages = (value: unknown): ChatMessage[] =>
  chatMessagesSchema.parse(value);
