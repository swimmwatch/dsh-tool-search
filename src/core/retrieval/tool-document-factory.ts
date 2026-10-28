import { stableDigest, ToolDefinitionParser } from '../catalog/declaration-parser.js';
import { ToolRiskClassifier } from '../catalog/risk-policy.js';
import type { ToolMetadata } from '../shared/types.js';
import type { RetrievalFieldName as FieldName, ToolDocument } from './contracts.js';
import {
  ACTION_TOKENS,
  compactIdentifier,
  expandEnglishMorphology,
  GENERIC_PROVIDER_TOKENS,
  isStopWord,
  meaningfulTokens,
  tokenize,
  uniqueTokens,
} from './text-normalization.js';

const DESCRIPTION_SUMMARY_LIMIT = 400;
const DESCRIPTION_EMBEDDING_LIMIT = 800;
const RELEVANT_PARAGRAPH_LIMIT = 2;

export function digest(value: unknown): string {
  return stableDigest(value);
}

export function summarize(value: unknown): string {
  return String(value ?? '')
    .replace(/\nexec tool declaration:[\s\S]*$/i, ' ')
    .replace(/This tool is part of plugin `[^`]+`\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DESCRIPTION_SUMMARY_LIMIT);
}

function selectRelevantDescription(value: unknown, nameTokens: readonly string[]): string {
  const paragraphs = String(value ?? '')
    .replace(/\nexec tool declaration:[\s\S]*$/i, '')
    .replace(/This tool is part of plugin `[^`]+`\.?/gi, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/https?:\/\/\S+/g, ' '))
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '';
  const nameTokenSet = new Set(nameTokens);
  return paragraphs
    .map((text, index) => ({
      index,
      text,
      score: [...new Set(meaningfulTokens(text))].filter((token) => nameTokenSet.has(token)).length,
    }))
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, RELEVANT_PARAGRAPH_LIMIT)
    .map(({ text }) => text)
    .join(' ')
    .slice(0, DESCRIPTION_EMBEDDING_LIMIT);
}

function extractProvider(tool: ToolMetadata): string {
  const match = String(tool.description ?? '').match(/part of plugin `([^`]+)`/i);
  if (match?.[1]) return match[1];
  const parts = String(tool.name).split('__');
  if (parts[0] === 'mcp') return parts[1] ?? 'mcp';
  if (parts.length > 1) return parts[0] ?? 'core';
  return 'core';
}

function stripTransportPrefix(name: string): string {
  const parts = String(name).split('__');
  if (parts[0] === 'mcp' && parts[1] === 'codex_apps') return parts.slice(2).join(' ');
  if (parts[0] === 'mcp') return parts.slice(1).join(' ');
  return parts.join(' ');
}

export class ToolDocumentFactory {
  public constructor(
    private readonly parser = new ToolDefinitionParser(),
    private readonly riskClassifier = new ToolRiskClassifier(),
  ) {}

  public create(tool: ToolMetadata): ToolDocument {
    const parsed = this.parser.parse(tool);
    const provider = extractProvider(tool);
    const providerTokenSequence = meaningfulTokens(provider);
    const providerTokens = uniqueTokens(providerTokenSequence);
    const nameText = stripTransportPrefix(tool.name);
    const callableNameText = String(tool.name).split('__').at(-1) ?? nameText;
    const callableNameTokens = tokenize(callableNameText).filter((token) => !isStopWord(token));
    const exactProviderTokens = tokenize(provider).filter(
      (token) => !isStopWord(token) && !GENERIC_PROVIDER_TOKENS.has(token),
    );
    const callableSignature = callableNameTokens.join('');
    const callableContainsProvider = callableSignature.includes(compactIdentifier(provider));
    const exactNameTokens =
      exactProviderTokens.length > 0 && callableNameTokens.length <= 2 && !callableContainsProvider
        ? [...exactProviderTokens, ...callableNameTokens]
        : callableNameTokens;
    const nameTokens = meaningfulTokens(nameText);
    const description = selectRelevantDescription(parsed.description, nameTokens);
    const lexicalDescription = summarize(parsed.description);
    const summary = summarize(description);
    const schemaTokens = meaningfulTokens(parsed.schemaSearchText);
    const capabilityTokens = meaningfulTokens(description);
    const providerSet = new Set(providerTokens);
    const actionTokens = uniqueTokens(
      [...nameTokens, ...capabilityTokens].filter((token) => ACTION_TOKENS.has(token)),
    );
    const actionSet = new Set(actionTokens);
    const entityTokens = uniqueTokens(
      expandEnglishMorphology(callableNameTokens).filter(
        (token) =>
          !providerSet.has(token) && !actionSet.has(token) && !GENERIC_PROVIDER_TOKENS.has(token),
      ),
    );
    const fields: Readonly<Record<FieldName, readonly string[]>> = {
      provider: providerTokens,
      name: nameTokens,
      schema: schemaTokens,
      purpose: meaningfulTokens(description),
      description: meaningfulTokens(lexicalDescription),
    };
    return {
      name: tool.name,
      description: tool.description ?? '',
      summary,
      provider,
      providerSignature: compactIdentifier(provider),
      providerTokenSequence,
      providerTokens,
      actionTokens,
      entityTokens,
      callableNameTokens,
      exactNameTokens,
      nameTokens,
      schemaTokens,
      normalizedName: uniqueTokens(nameTokens).join(' '),
      deprecated: /\bdeprecated\b|\bdo not use\b/i.test(parsed.description),
      risk: this.riskClassifier.classify(parsed),
      toolDigest: parsed.toolDigest,
      declarationAvailable: parsed.declarationAvailable,
      fields,
      embeddingText: [
        'Callable software tool',
        `Provider: ${provider}`,
        `Tool: ${[...actionTokens, ...entityTokens].join(' ') || nameText}`,
        actionTokens.length > 0 ? `Actions: ${actionTokens.join(' ')}` : '',
        entityTokens.length > 0 ? `Entities: ${entityTokens.join(' ')}` : '',
        description ? `Purpose: ${description}` : '',
        parsed.schemaSearchText ? `Arguments: ${parsed.schemaSearchText.slice(0, 500)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 1_400),
    };
  }
}
