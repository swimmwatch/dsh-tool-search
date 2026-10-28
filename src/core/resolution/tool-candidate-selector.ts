import { queryRequiresCodeCallPath } from '../retrieval/structured-candidate-reranker.js';
import type { Candidate, InspectionResult, SchemaField, SearchResult } from '../shared/types.js';

const MAX_INTERNAL_INSPECTIONS = 5;
export const MAX_MODEL_CHOICE_CANDIDATES = 3;
const MAX_PREREQUISITE_SCORE_GAP = 0.4;
const MODEL_CHOICE_SCORE_MARGIN = 0.08;
const AUTOMATIC_SELECTION_REASONS = new Set(['exact_name', 'structured_intent_match']);
const READ_ONLY_QUERY_PATTERN =
  /\bread[- ]only\b|\bonly\s+(?:inspect|list|read|view)\b|\bwithout\s+(?:changes|modification)\b|(?:ничего|файл\p{L}*|состояни\p{L}*)\s+не\s+(?:измен|меня)\p{L}*|только\s+(?:прочитать|читать|посмотреть|показать|перечислить)/iu;
const PREREQUISITE_ACTION_TOKENS = new Set(['find', 'list', 'lookup', 'resolve', 'search']);
const TOOL_ENTITY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  pr: ['pull', 'request'],
  prs: ['pr', 'pull', 'request'],
};
const IDENTIFIER_FIELD_TOKENS = new Set([
  'id',
  'identifier',
  'number',
  'path',
  'reference',
  'selector',
  'sha',
  'url',
]);

export interface CandidateSelection {
  readonly mode: 'automatic' | 'model_choice';
  readonly inspections: readonly InspectionResult[];
  readonly reason: string;
}

export interface ToolDeclarationReader {
  inspect(toolName: string, expectedCatalogDigest: string): InspectionResult;
}

interface InspectedCandidate {
  readonly candidate: Candidate;
  readonly inspection: InspectionResult;
  readonly missingIdentifiers: readonly SchemaField[];
}

function fieldTokens(field: SchemaField): readonly string[] {
  return field.name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_:/.-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function toolNameTokens(name: string): readonly string[] {
  const tokens = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_:/.-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return [
    ...new Set(
      tokens.flatMap((token) => [
        token,
        ...(token.endsWith('s') && !token.endsWith('ss') ? [token.slice(0, -1)] : []),
        ...(TOOL_ENTITY_ALIASES[token] ?? []),
      ]),
    ),
  ];
}

function canSupplyPrerequisite(
  inspection: InspectionResult,
  missingIdentifiers: readonly SchemaField[],
): boolean {
  const candidateTokens = toolNameTokens(inspection.name);
  const supportsDiscovery = candidateTokens.some((token) => PREREQUISITE_ACTION_TOKENS.has(token));
  if (!supportsDiscovery) return false;
  const missingIdentifierTokens = new Set(
    missingIdentifiers.flatMap((field) => fieldTokens(field)),
  );
  return candidateTokens.some((token) => missingIdentifierTokens.has(token));
}

function isIdentifierField(field: SchemaField): boolean {
  return fieldTokens(field).some((token) => IDENTIFIER_FIELD_TOKENS.has(token));
}

function queryContainsIdentifier(query: string, field: SchemaField): boolean {
  const tokens = fieldTokens(field);
  if (tokens.includes('url')) return /https?:\/\/\S+/i.test(query);
  if (tokens.includes('path')) return /(?:^|\s)[./~]\S+/.test(query);
  if (tokens.includes('number')) return /(?:#|\b)\d+\b/.test(query);
  if (tokens.includes('sha')) return /\b[0-9a-f]{7,64}\b/i.test(query);
  if (tokens.includes('selector')) {
    return /\[[^\]]+\]|#[A-Z][\w-]*|\.[A-Z][\w-]*/i.test(query);
  }
  if (tokens.some((token) => token === 'id' || token === 'identifier')) {
    return (
      /\b(?:id|identifier)\s*(?:[:=]\s*|\s\/)[\w./-]+/i.test(query) ||
      /\/[\w.-]+\/[\w.-]+/.test(query)
    );
  }
  if (tokens.includes('reference')) {
    return /\b(?:reference|ref)\s*[:=]\s*[\w./-]+/i.test(query);
  }
  return false;
}

function missingIdentifierFields(
  query: string,
  inspection: InspectionResult,
): readonly SchemaField[] {
  return inspection.schemaFields.filter(
    (field) =>
      !field.optional && isIdentifierField(field) && !queryContainsIdentifier(query, field),
  );
}

function requiresModelChoice(
  result: SearchResult,
  first: InspectedCandidate,
  eligibleCount: number,
): boolean {
  if (!result.matched || !result.requiresRerank || eligibleCount < 2) return false;
  if (first.candidate.exactNameScore === 1) return false;
  if (AUTOMATIC_SELECTION_REASONS.has(result.reason)) return false;
  return (result.scoreMargin ?? 0) < MODEL_CHOICE_SCORE_MARGIN;
}

function providerNamespace(name: string): string {
  const parts = name.split('__');
  return parts[0] === 'mcp' ? (parts[1] ?? 'mcp') : (parts[0] ?? 'core');
}

function preferredCallPathExplorer(
  query: string,
  eligible: readonly InspectedCandidate[],
): InspectedCandidate | undefined {
  if (!queryRequiresCodeCallPath(query)) return undefined;
  if (eligible.some(({ candidate }) => candidate.exactNameScore === 1)) {
    return undefined;
  }
  const first = eligible[0];
  if (!first) return undefined;
  const firstProvider = providerNamespace(first.candidate.name);
  const explorers = eligible.filter(
    ({ candidate, missingIdentifiers }) =>
      candidate.risk === 'read' &&
      missingIdentifiers.length === 0 &&
      toolNameTokens(candidate.name).includes('explore'),
  );
  return (
    explorers.find(({ candidate }) => providerNamespace(candidate.name) === firstProvider) ??
    explorers[0]
  );
}

export class ToolCandidateSelector {
  public select(
    query: string,
    result: SearchResult,
    declarationReader: ToolDeclarationReader,
    catalogDigest: string,
  ): CandidateSelection | undefined {
    if (result.candidates.length === 0) return undefined;
    const inspected = result.candidates
      .slice(0, MAX_INTERNAL_INSPECTIONS)
      .map((candidate): InspectedCandidate => {
        const inspection = declarationReader.inspect(candidate.name, catalogDigest);
        return {
          candidate,
          inspection,
          missingIdentifiers: missingIdentifierFields(query, inspection),
        };
      });
    const eligible = READ_ONLY_QUERY_PATTERN.test(query)
      ? inspected.filter(({ candidate }) => candidate.risk === 'read')
      : inspected;
    const first = eligible[0];
    if (!first) return undefined;
    const callPathExplorer = preferredCallPathExplorer(query, eligible);
    if (callPathExplorer) {
      return {
        mode: 'automatic',
        inspections: [callPathExplorer.inspection],
        reason: 'structured_capability_selected',
      };
    }
    if (first.missingIdentifiers.length === 0) {
      if (!result.matched && first.candidate.exactNameScore !== 1) return undefined;
      const callable = eligible.filter(({ missingIdentifiers }) => missingIdentifiers.length === 0);
      if (requiresModelChoice(result, first, callable.length)) {
        return {
          mode: 'model_choice',
          inspections: callable
            .slice(0, MAX_MODEL_CHOICE_CANDIDATES)
            .map(({ inspection }) => inspection),
          reason: 'model_choice_required',
        };
      }
      return {
        mode: 'automatic',
        inspections: [first.inspection],
        reason: result.reason,
      };
    }
    const prerequisite = eligible.find(
      ({ candidate, inspection, missingIdentifiers }) =>
        missingIdentifiers.length === 0 &&
        candidate.risk === 'read' &&
        canSupplyPrerequisite(inspection, first.missingIdentifiers) &&
        (first.candidate.providerScore !== 1 ||
          candidate.providerScore === first.candidate.providerScore) &&
        first.candidate.score - candidate.score <= MAX_PREREQUISITE_SCORE_GAP,
    );
    if (prerequisite) {
      return {
        mode: 'automatic',
        inspections: [prerequisite.inspection],
        reason: 'prerequisite_selected',
      };
    }
    if (!result.matched) return undefined;
    const callableAlternatives = eligible.filter(
      ({ candidate, missingIdentifiers }) =>
        candidate.risk === 'read' && missingIdentifiers.length === 0,
    );
    if (callableAlternatives.length === 0) {
      return first.candidate.risk === 'read'
        ? {
            mode: 'automatic',
            inspections: [first.inspection],
            reason: result.reason,
          }
        : undefined;
    }
    if (callableAlternatives.length === 1) {
      const alternative = callableAlternatives[0];
      if (!alternative) return undefined;
      return {
        mode: 'automatic',
        inspections: [alternative.inspection],
        reason: 'callable_alternative_selected',
      };
    }
    return {
      mode: 'model_choice',
      inspections: callableAlternatives
        .slice(0, MAX_MODEL_CHOICE_CANDIDATES)
        .map(({ inspection }) => inspection),
      reason: 'model_choice_required',
    };
  }
}
