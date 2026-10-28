import { z } from 'zod';
import type { ToolDefinition, ToolOutputDefinition } from '@deepseek-ai/dsh-tools';
import {
  DEFAULT_LIMIT,
  DEFAULT_MODE,
  MAX_QUERY_LENGTH,
  MAX_RESULTS,
  SEARCH_MODES,
} from './constants.js';
import { DESCRIPTIONS } from './messages.js';

export const searchInputSchema = z
  .object({
    query: z
      .string()
      .max(MAX_QUERY_LENGTH)
      .transform((query) => query.trim()),
    limit: z.number().int().min(1).max(MAX_RESULTS).default(DEFAULT_LIMIT),
    mode: z.enum(SEARCH_MODES).default(DEFAULT_MODE),
  })
  .strict();
export const unloadInputSchema = z.object({ names: z.array(z.string()).optional() }).strict();
export const SEARCH_PARAMETERS: ToolDefinition['parameters'] = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: {
    query: { type: 'string', description: DESCRIPTIONS.query },
    limit: { type: 'integer', description: DESCRIPTIONS.limit },
    mode: { type: 'string', enum: [...SEARCH_MODES], description: DESCRIPTIONS.mode },
  },
};
export const UNLOAD_PARAMETERS: ToolDefinition['parameters'] = {
  type: 'object',
  additionalProperties: false,
  properties: {
    names: { type: 'array', items: { type: 'string' }, description: DESCRIPTIONS.names },
  },
};
export const JSON_OUTPUT: ToolOutputDefinition = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
};
