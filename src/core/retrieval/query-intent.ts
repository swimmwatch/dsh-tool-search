import { compactIdentifier, uniqueTokens } from './text-normalization.js';

const EXPLICIT_PROVIDER_ACTION_SOURCE =
  'archive|assign|cancel|change|click|close|control|create|delete|download|' +
  'edit|execute|find|get|install|list|merge|open|publish|read|remove|reply|' +
  'resolve|run|schedule|search|send|set|start|uninstall|update|upload|view|' +
  'wait|write';
const TITLE_CASE_PROVIDER_SOURCE = String.raw`[A-Z][A-Z0-9-]{2,}(?:\s+[A-Z][A-Z0-9-]{2,}){0,2}`;
const NON_PROVIDER_CANDIDATES = new Set([
  'all',
  'css',
  'current',
  'exact',
  'inapp',
  'latest',
  'my',
  'one',
  'that',
  'the',
  'this',
]);

export function possibleExplicitProviders(value: string): readonly string[] {
  const candidates: string[] = [];
  const patterns = [
    new RegExp(
      String.raw`^[\s([{]*(?:${EXPLICIT_PROVIDER_ACTION_SOURCE})\s+` +
        String.raw`(?:(?:the|a|an)\s+)?(${TITLE_CASE_PROVIDER_SOURCE})\b`,
      'gi',
    ),
    new RegExp(
      String.raw`\b(?:in|on|through|via|using|from|to)\s+(?:the\s+)?` +
        String.raw`(${TITLE_CASE_PROVIDER_SOURCE})\b`,
      'gi',
    ),
    new RegExp(
      String.raw`(?:^|\s)(?:dans|en|в|из|через)\s+(?:the\s+)?` +
        String.raw`(${TITLE_CASE_PROVIDER_SOURCE})\b`,
      'giu',
    ),
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const candidate = match[1]?.match(
        /^[A-Z][A-Za-z0-9-]{2,}(?:\s+[A-Z][A-Za-z0-9-]{2,}){0,2}/,
      )?.[0];
      if (
        candidate &&
        /^[A-Z]/.test(candidate) &&
        !/[a-z][A-Z]/.test(candidate) &&
        !/^[A-Z0-9-]+(?:\s|$)/.test(candidate)
      ) {
        candidates.push(compactIdentifier(candidate));
      }
    }
  }
  const uppercasePatterns = [
    new RegExp(
      String.raw`^[\s([{]*(?:${EXPLICIT_PROVIDER_ACTION_SOURCE.toUpperCase()})\s+([A-Z][A-Z0-9-]{2,})\b`,
    ),
    /\b(?:IN|ON|THROUGH|VIA|USING|FROM|TO)\s+(?:THE\s+)?([A-Z][A-Z0-9-]{2,})\b(?!\/)/,
  ];
  for (const pattern of uppercasePatterns) {
    const candidate = value.match(pattern)?.[1];
    const normalized = compactIdentifier(candidate);
    if (candidate && !NON_PROVIDER_CANDIDATES.has(normalized)) {
      candidates.push(normalized);
    }
  }
  return uniqueTokens(candidates);
}

export function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current: number[] = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}
