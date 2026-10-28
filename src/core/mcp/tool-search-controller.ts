import { ToolResolutionService } from '../resolution/tool-resolution-service.js';
import { CatalogRegistry } from '../sessions/catalog-registry.js';
import { SearchReceiptRegistry } from '../sessions/search-receipt-registry.js';
import { normalizeError, ToolSearchError } from '../shared/errors.js';
import type { ToolMetadata } from '../shared/types.js';
import { assertDigest, assertHandle, validateSearchInput } from './protocol.js';
import { SafeDiagnosticLogger } from './safe-diagnostic-logger.js';
import { failure, success, type ToolCallResponse } from './tool-call-response.js';

const MAX_SELECTED_TOOL_NAME_LENGTH = 512;

export interface ToolSearchControllerDependencies {
  readonly catalogs?: CatalogRegistry;
  readonly receipts?: SearchReceiptRegistry;
  readonly logger?: SafeDiagnosticLogger;
}

export class ToolSearchController {
  private readonly catalogs: CatalogRegistry;
  private readonly receipts: SearchReceiptRegistry;
  private readonly resolver: ToolResolutionService;
  private readonly logger: SafeDiagnosticLogger;

  public constructor(dependencies: ToolSearchControllerDependencies = {}) {
    this.catalogs = dependencies.catalogs ?? new CatalogRegistry();
    this.receipts = dependencies.receipts ?? new SearchReceiptRegistry();
    this.resolver = new ToolResolutionService(this.catalogs);
    this.logger = dependencies.logger ?? new SafeDiagnosticLogger();
  }

  public syncCatalog(schemaVersion: number, tools: readonly ToolMetadata[]): ToolCallResponse {
    try {
      const result = this.catalogs.sync(schemaVersion, tools);
      this.logger.log('catalog_synced', { catalogSize: result.catalogSize });
      return success({
        catalogHandle: result.catalogHandle,
        catalogDigest: result.catalogDigest,
        catalogSize: result.catalogSize,
        expiresAt: result.expiresAt,
        schemaVersion: result.schemaVersion,
        authorityGranted: false,
      });
    } catch (error) {
      return this.reject(error);
    }
  }

  public async searchTools(
    catalogHandle: string,
    query: string,
    mode: string,
    policyProfile: string,
    signal?: AbortSignal,
  ): Promise<ToolCallResponse> {
    try {
      signal?.throwIfAborted();
      assertHandle(catalogHandle, 'catalogHandle');
      const validated = validateSearchInput(query, mode, policyProfile);
      const session = this.catalogs.get(catalogHandle);
      const result = await session
        .service(validated.policyProfile)
        .search(query, validated.mode, signal);
      signal?.throwIfAborted();
      const receipt = this.receipts.issue({
        catalogHandle,
        catalogDigest: session.digest,
        policyProfile: validated.policyProfile,
        candidateNames: result.candidates.map(({ name }) => name),
      });
      this.logger.log('search_completed', {
        candidateCount: result.candidates.length,
        degraded: result.degraded,
        mode: validated.mode,
      });
      return success({
        catalogDigest: session.digest,
        searchReceipt: receipt.receipt,
        searchReceiptExpiresAt: new Date(receipt.expiresAtMs).toISOString(),
        policyProfile,
        ...result,
        authorityGranted: false,
      });
    } catch (error) {
      signal?.throwIfAborted();
      return this.reject(error);
    }
  }

  public inspectTool(
    searchReceipt: string,
    selectedToolName: string,
    expectedCatalogDigest: string,
  ): ToolCallResponse {
    try {
      assertHandle(searchReceipt, 'searchReceipt');
      assertDigest(expectedCatalogDigest);
      if (
        selectedToolName.length === 0 ||
        selectedToolName.length > MAX_SELECTED_TOOL_NAME_LENGTH
      ) {
        throw new ToolSearchError(
          'invalid_input',
          `selectedToolName must contain between 1 and ${MAX_SELECTED_TOOL_NAME_LENGTH} characters.`,
        );
      }
      const receipt = this.receipts.get(searchReceipt);
      if (receipt.catalogDigest !== expectedCatalogDigest) {
        throw new ToolSearchError(
          'catalog_digest_mismatch',
          'Catalog digest does not match the search receipt.',
        );
      }
      if (!receipt.candidateNames.has(selectedToolName)) {
        throw new ToolSearchError(
          'tool_not_in_results',
          'Selected tool was not returned by this search.',
        );
      }
      const session = this.catalogs.get(receipt.catalogHandle);
      if (session.digest !== expectedCatalogDigest) {
        throw new ToolSearchError(
          'catalog_digest_mismatch',
          'Current catalog digest does not match the search receipt.',
        );
      }
      const inspection = session
        .service(receipt.policyProfile)
        .inspect(selectedToolName, expectedCatalogDigest);
      this.logger.log('inspection_completed');
      return success({ ...inspection, authorityGranted: false });
    } catch (error) {
      return this.reject(error);
    }
  }

  public async resolveTool(input: {
    readonly schemaVersion: number;
    readonly tools: readonly ToolMetadata[];
    readonly query: string;
    readonly retryQuery?: string;
    readonly mode: string;
    readonly policyProfile: string;
  }): Promise<ToolCallResponse> {
    try {
      const validated = validateSearchInput(input.query, input.mode, input.policyProfile);
      if (input.retryQuery !== undefined) {
        validateSearchInput(input.retryQuery, input.mode, input.policyProfile);
      }
      const result = await this.resolver.resolve({
        schemaVersion: input.schemaVersion,
        tools: input.tools,
        query: input.query,
        ...(input.retryQuery === undefined ? {} : { retryQuery: input.retryQuery }),
        ...validated,
      });
      this.logger.log('resolution_completed', {
        attemptCount: result.attemptCount,
        candidateCount: result.selection?.inspections.length ?? 0,
        degraded: result.degraded,
        matched: result.matched,
        selectionMode: result.selection?.mode ?? 'none',
      });
      if (!result.selection) return this.noMatchResponse(result);
      if (result.selection.mode === 'model_choice') {
        return this.modelChoiceResponse(result);
      }
      return this.automaticSelectionResponse(result);
    } catch (error) {
      return this.reject(error);
    }
  }

  private noMatchResponse(result: {
    readonly reason: string;
    readonly degraded: boolean;
    readonly attemptCount: number;
    readonly retryUsed: boolean;
  }): ToolCallResponse {
    return success({
      matched: false,
      reason: result.reason,
      degraded: result.degraded,
      attemptCount: result.attemptCount,
      retryUsed: result.retryUsed,
      trace: {
        schemaVersion: 1,
        backend: 'mcp',
        searchPerformed: true,
        inspected: false,
        selectedToolName: null,
        outcome: 'no_match',
      },
      authorityGranted: false,
    });
  }

  private modelChoiceResponse(
    result: Awaited<ReturnType<ToolResolutionService['resolve']>>,
  ): ToolCallResponse {
    const selection = result.selection;
    if (selection?.mode !== 'model_choice') {
      throw new ToolSearchError('receipt_invalid', 'Model choice is unavailable.');
    }
    const receipt = this.receipts.issue({
      catalogHandle: result.catalogHandle,
      catalogDigest: result.catalogDigest,
      policyProfile: result.policyProfile,
      candidateNames: selection.inspections.map(({ name }) => name),
    });
    return success({
      matched: true,
      selectionRequired: true,
      selectionMode: 'model_choice',
      reason: result.reason,
      degraded: result.degraded,
      attemptCount: result.attemptCount,
      retryUsed: result.retryUsed,
      catalogDigest: result.catalogDigest,
      searchReceipt: receipt.receipt,
      searchReceiptExpiresAt: new Date(receipt.expiresAtMs).toISOString(),
      candidates: selection.inspections.map(
        ({
          name,
          risk,
          description,
          schemaFormat,
          schemaFields,
          executionRequiresNormalToolPermission,
        }) => ({
          name,
          risk,
          description,
          schemaFormat,
          schemaFields,
          executionRequiresNormalToolPermission,
        }),
      ),
      trace: {
        schemaVersion: 1,
        backend: 'mcp',
        searchPerformed: true,
        inspected: true,
        selectedToolName: null,
        outcome: 'selection_required',
      },
      authorityGranted: false,
    });
  }

  private automaticSelectionResponse(
    result: Awaited<ReturnType<ToolResolutionService['resolve']>>,
  ): ToolCallResponse {
    const inspection = result.selection?.inspections[0];
    if (!inspection) {
      throw new ToolSearchError(
        'declaration_missing',
        'Automatic selection does not contain an inspected declaration.',
      );
    }
    const {
      name,
      risk,
      description,
      schemaFormat,
      schemaFields,
      declaration,
      executionRequiresNormalToolPermission,
    } = inspection;
    return success({
      matched: true,
      selectionRequired: false,
      selectionMode: 'automatic',
      reason: result.reason,
      degraded: result.degraded,
      attemptCount: result.attemptCount,
      retryUsed: result.retryUsed,
      trace: {
        schemaVersion: 1,
        backend: 'mcp',
        searchPerformed: true,
        inspected: true,
        selectedToolName: name,
        outcome: 'matched',
      },
      selectedTool: {
        name,
        risk,
        description,
        schemaFormat,
        schemaFields,
        declaration,
        executionRequiresNormalToolPermission,
      },
      authorityGranted: false,
    });
  }

  private reject(error: unknown): ToolCallResponse {
    const normalized = normalizeError(error);
    this.logger.log('request_rejected', { errorCode: normalized.code });
    return failure(normalized);
  }
}
