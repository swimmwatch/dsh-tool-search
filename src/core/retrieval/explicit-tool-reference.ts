import type { ToolDocument } from './contracts.js';
import { possibleExplicitProviders } from './query-intent.js';
import { compactIdentifier } from './text-normalization.js';

const CALL_MARKERS = [
  'call',
  'invoke',
  'use',
  'execute',
  'run',
  'вызови',
  'вызвать',
  'вызывай',
  'запусти',
  'запустить',
  'используй',
  'использовать',
  'выполни',
  'выполнить',
];
const CALL_REFERENCE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_-])(?:${CALL_MARKERS.join('|')})\s+` +
    String.raw`(?:(?:the\s+)?tool\s+|инструмент\s+)?[\x60"'«]?([\w-]+)(?![\p{L}\p{N}_-])`,
  'giu',
);
const QUOTED_REFERENCE = /([`"'])([\w-]+)\1|«([\w-]+)»/gu;
const COORDINATED_REFERENCE =
  /(?:(?<![\p{L}\p{N}_-])(?:and|or|и|или)|,)\s+[`"'«]?([\w-]+)(?![\p{L}\p{N}_-])/giu;
const NEGATION =
  /(?<![\p{L}\p{N}_-])(?:do\s+not|don't|never|not|without|avoid|except|excluding|не|нельзя|без|кроме|избегай|исключи)(?![\p{L}\p{N}_-])/iu;
const CLAUSE_BOUNDARY = /[;.!?\n]/u;
const PROVIDER_PHRASE = String.raw`([\p{L}\p{N}_-]+(?:[ \t]+[\p{L}\p{N}_-]+){0,2})`;
const PROVIDER_QUALIFIER = new RegExp(
  String.raw`(?<![\p{L}\p{N}_-])(?:in|on|from|via|through|using|в|из|через)\s+${PROVIDER_PHRASE}`,
  'giu',
);
const PROVIDER_PREFIX = new RegExp(String.raw`^\s*${PROVIDER_PHRASE}:`, 'u');

function hasProviderConflict(
  clauses: readonly string[],
  target: ToolDocument,
  documents: readonly ToolDocument[],
): boolean {
  for (const clause of clauses) {
    if (possibleExplicitProviders(clause).some((provider) => provider !== target.providerSignature))
      return true;
    const qualifiers = [...clause.matchAll(PROVIDER_QUALIFIER)].map((match) => match[1] ?? '');
    const prefix = clause.match(PROVIDER_PREFIX)?.[1];
    if (prefix) qualifiers.push(prefix);
    for (const qualifier of qualifiers) {
      const words = qualifier.split(/\s+/u);
      const prefixes = words.map((_word, index) =>
        compactIdentifier(words.slice(0, index + 1).join(' ')),
      );
      const providers = documents.filter(({ providerSignature }) =>
        prefixes.includes(providerSignature),
      );
      if (providers.length === 0 && /^[A-Z]/u.test(qualifier)) return true;
      const longest = Math.max(
        0,
        ...providers.map(({ providerSignature }) => providerSignature.length),
      );
      if (
        providers.length > 0 &&
        !providers.some(
          (provider) =>
            provider.providerSignature.length === longest &&
            provider.providerSignature === target.providerSignature,
        )
      )
        return true;
    }
  }
  return false;
}

/** Conservative syntactic hint, not natural-language intent classification. */
export function explicitToolReference(
  query: string,
  documents: readonly ToolDocument[],
): string | undefined {
  const registeredNames = new Set(documents.map(({ name }) => name));
  // An ambiguous negative clause cannot force a winner. Keep its ordinary BM25 evidence.
  const positiveClauses = query.split(CLAUSE_BOUNDARY).filter((clause) => !NEGATION.test(clause));
  const references = new Set<string>();
  for (const clause of positiveClauses) {
    for (const match of clause.matchAll(CALL_REFERENCE)) {
      if (match[1]) references.add(match[1]);
    }
    for (const match of clause.matchAll(QUOTED_REFERENCE)) {
      const name = match[2] ?? match[3];
      if (name && registeredNames.has(name)) references.add(name);
    }
  }
  if (references.size > 0) {
    for (const clause of positiveClauses) {
      for (const match of clause.matchAll(COORDINATED_REFERENCE)) {
        if (match[1] && registeredNames.has(match[1])) references.add(match[1]);
      }
    }
  }
  if (references.size !== 1) return undefined;
  const [name] = references;
  const target = documents.find((document) => document.name === name);
  if (!target || hasProviderConflict(positiveClauses, target, documents)) return undefined;
  return target.name;
}
