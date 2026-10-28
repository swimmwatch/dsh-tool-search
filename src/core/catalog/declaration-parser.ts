import { createHash } from 'node:crypto';

import { ToolSearchError } from '../shared/errors.js';
import type { ParsedToolDefinition, SchemaField, ToolMetadata } from '../shared/types.js';

const DECLARATION_PATTERN =
  /\nexec tool declaration:\s*\n```(?:ts|typescript)?\s*\n([\s\S]*?)\n```\s*$/i;
const MAX_SCHEMA_FIELD_TYPE_LENGTH = 240;
const MAX_SCHEMA_FIELD_DESCRIPTION_LENGTH = 300;
const MAX_SCHEMA_SEARCH_TEXT_LENGTH = 4_000;

export function stableDigest(value: unknown): string {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function splitToolDescription(value: unknown): {
  readonly humanDescription: string;
  readonly declaration: string;
} {
  const description = String(value ?? '');
  const match = description.match(DECLARATION_PATTERN);
  if (!match) return { humanDescription: description.trim(), declaration: '' };
  return {
    humanDescription: description.slice(0, match.index).trim(),
    declaration: (match[1] ?? '').trim(),
  };
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArgumentObject(declaration: unknown): string {
  const source = String(declaration ?? '');
  const argumentStart = /\(\s*args\s*:\s*\{/.exec(source);
  if (!argumentStart) return '';
  const openingBrace = argumentStart.index + argumentStart[0].lastIndexOf('{');
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const nextCharacter = source[index + 1] ?? '';
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (['"', "'", '`'].includes(character)) quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }
  return '';
}

function structuralBraceDelta(value: unknown): number {
  let delta = 0;
  let quote = '';
  const source = String(value ?? '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const nextCharacter = source[index + 1] ?? '';
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && nextCharacter === '/') break;
    if (['"', "'", '`'].includes(character)) quote = character;
    else if (character === '{') delta += 1;
    else if (character === '}') delta -= 1;
  }
  return delta;
}

export function extractSchemaFields(declaration: unknown): readonly SchemaField[] {
  const argumentObject = extractArgumentObject(declaration);
  if (!argumentObject) return [];
  const fields: SchemaField[] = [];
  let pendingDescription: string[] = [];
  let nestedDepth = 0;
  for (const sourceLine of argumentObject.split(/\r?\n/)) {
    const line = sourceLine.trim();
    const comment = line.match(/^\/\/\s*(.+)$/);
    if (comment) {
      if (nestedDepth === 0) pendingDescription.push(comment[1] ?? '');
      continue;
    }
    if (nestedDepth === 0) {
      const property = line.match(/^([A-Z_$][\w$]*)(\?)?\s*:\s*(.+?)(?:;|,)?$/i);
      const name = property?.[1];
      if (property && name && !['declare', 'type'].includes(name)) {
        fields.push({
          name,
          optional: property[2] === '?',
          type: normalizeWhitespace(property[3]).slice(0, MAX_SCHEMA_FIELD_TYPE_LENGTH),
          description: normalizeWhitespace(pendingDescription.join(' ')).slice(
            0,
            MAX_SCHEMA_FIELD_DESCRIPTION_LENGTH,
          ),
        });
        pendingDescription = [];
      } else if (line.length > 0 && !/^[{}[\]();>,]+$/.test(line)) {
        pendingDescription = [];
      }
    }
    nestedDepth += structuralBraceDelta(sourceLine);
  }
  return fields;
}

function schemaSearchText(fields: readonly SchemaField[]): string {
  return fields
    .map(({ name, type, description }) => `${name} ${type} ${description}`)
    .join(' ')
    .slice(0, MAX_SCHEMA_SEARCH_TEXT_LENGTH);
}

export class ToolDefinitionParser {
  public parse(tool: ToolMetadata): ParsedToolDefinition {
    if (!tool || typeof tool.name !== 'string' || tool.name.length === 0) {
      throw new ToolSearchError('invalid_input', 'Tool metadata must contain a non-empty name.');
    }
    const rawDescription = String(tool.description ?? '');
    const { humanDescription, declaration } = splitToolDescription(rawDescription);
    const schemaFields = extractSchemaFields(declaration);
    return {
      name: tool.name,
      rawDescription,
      description: humanDescription,
      declaration,
      schemaFields,
      schemaSearchText: schemaSearchText(schemaFields),
      declarationAvailable: declaration.length > 0,
      toolDigest: stableDigest(JSON.stringify({ name: tool.name, description: rawDescription })),
    };
  }
}
