import { ToolSearchError } from '../shared/errors.js';
import type {
  CatalogEntry,
  InspectionResult,
  PolicyProfile,
  ToolMetadata,
} from '../shared/types.js';
import { stableDigest, ToolDefinitionParser } from './declaration-parser.js';
import { ToolPolicy, ToolRiskClassifier } from './risk-policy.js';

const MAX_INSPECTION_DESCRIPTION_LENGTH = 1_200;

export class ToolCatalog {
  public readonly entries: readonly CatalogEntry[];
  public readonly byName: ReadonlyMap<string, CatalogEntry>;
  public readonly digest: string;
  public readonly policy: ToolPolicy;

  public constructor(
    metadata: readonly ToolMetadata[],
    { policyProfile = 'read-only' }: { readonly policyProfile?: PolicyProfile } = {},
  ) {
    if (!Array.isArray(metadata)) {
      throw new ToolSearchError('invalid_input', 'Tool metadata must be an array.');
    }
    const parser = new ToolDefinitionParser();
    const classifier = new ToolRiskClassifier();
    this.policy = new ToolPolicy(policyProfile);
    const normalized = (metadata as readonly ToolMetadata[])
      .map(({ name, description }) => ({
        name,
        description: String(description ?? ''),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const names = new Set<string>();
    this.entries = normalized.map((tool) => {
      if (names.has(tool.name)) {
        throw new ToolSearchError('duplicate_tool', `Duplicate tool name: ${tool.name}.`);
      }
      names.add(tool.name);
      const parsed = parser.parse(tool);
      return { ...parsed, risk: classifier.classify(parsed) };
    });
    this.byName = new Map(this.entries.map((entry) => [entry.name, entry]));
    this.digest = stableDigest(JSON.stringify(normalized));
  }

  public searchableEntries(): readonly CatalogEntry[] {
    return this.entries.filter((entry) => this.policy.allows(entry));
  }

  public inspect(name: string, expectedCatalogDigest: string): InspectionResult {
    if (expectedCatalogDigest !== this.digest) {
      throw new ToolSearchError(
        'catalog_digest_mismatch',
        'Catalog digest mismatch; run tool search again.',
      );
    }
    const entry = this.byName.get(name);
    if (!entry) {
      throw new ToolSearchError(
        'tool_not_in_results',
        'Selected tool is not present in current catalog.',
      );
    }
    if (!this.policy.allows(entry)) {
      throw new ToolSearchError(
        'tool_not_in_results',
        `Selected tool is excluded by ${this.policy.profile} policy.`,
      );
    }
    if (!entry.declarationAvailable) {
      throw new ToolSearchError(
        'declaration_missing',
        'Selected tool has no callable declaration.',
      );
    }
    return {
      name: entry.name,
      catalogDigest: this.digest,
      toolDigest: entry.toolDigest,
      risk: entry.risk,
      description: entry.description.slice(0, MAX_INSPECTION_DESCRIPTION_LENGTH),
      schemaFormat: 'typescript-declaration',
      schemaFields: entry.schemaFields,
      declaration: entry.declaration,
      executionRequiresNormalToolPermission: true,
    };
  }
}
