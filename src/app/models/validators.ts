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
  'failed'
]);

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
  folderId: idSchema.optional()
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
  error: z.string().optional()
});

export const chatThreadsSchema = z.array(chatThreadSchema);
export const chatMessagesSchema = z.array(chatMessageSchema);

export const parseChatThread = (value: unknown): ChatThread => chatThreadSchema.parse(value);
export const parseChatThreads = (value: unknown): ChatThread[] =>
  chatThreadsSchema.parse(value);

export const parseChatMessage = (value: unknown): ChatMessage => chatMessageSchema.parse(value);
export const parseChatMessages = (value: unknown): ChatMessage[] =>
  chatMessagesSchema.parse(value);
