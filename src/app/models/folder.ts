import { z } from 'zod';
import type { Id } from './chat';
import { idSchema } from './validators';

// Using an ISO date string validator would be ideal if shared
const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Must be a valid ISO date string'
});

export interface Folder {
  id: Id;
  name: string;
  createdAt: string; // ISO Date String
}

export const folderSchema: z.ZodType<Folder> = z.object({
  id: idSchema,
  name: z.string().min(1),
  createdAt: isoDateString,
});

export const foldersSchema: z.ZodType<Folder[]> = z.array(folderSchema);

