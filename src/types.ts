import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { SearchMode } from './core/shared/types.js';

export type CallingAgent = NonNullable<ToolRunContext['agent']>;
export type CallingContext = Pick<ToolRunContext, 'agent' | 'signal'>;
export type SearchTool = Pick<ToolDefinition, 'name' | 'description' | 'parameters'> & {
  readonly definition?: ToolDefinition;
};
export interface CatalogTool extends SearchTool {
  readonly definition: ToolDefinition;
  readonly signature: string;
}
export interface SearchInput {
  readonly query: string;
  readonly limit: number;
  readonly mode: SearchMode;
}
export interface DiscoveryResult<T extends SearchTool = CatalogTool> {
  readonly matches: readonly T[];
  readonly mode: SearchMode;
  readonly degraded: boolean;
  readonly reason?: string;
  readonly authorityGranted: false;
}
export interface Discovery {
  search(
    agent: object,
    tools: readonly CatalogTool[],
    input: SearchInput,
    signal?: AbortSignal,
  ): Promise<DiscoveryResult>;
}
export interface Inventory {
  readonly total: number;
  readonly harness: number;
  readonly mcp: number;
  readonly alwaysAvailable: string[];
}
export interface SearchResponse extends Omit<DiscoveryResult, 'matches'> {
  readonly matches: { name: string; description: string; loaded: boolean }[];
  readonly loadedTools: string[];
  readonly evictedTools: string[];
  readonly maxLoadedTools: number;
  readonly inventory?: Inventory;
}
export interface UnloadResponse {
  readonly unloadedTools: string[];
  readonly loadedTools: string[];
  readonly authorityGranted: false;
}
