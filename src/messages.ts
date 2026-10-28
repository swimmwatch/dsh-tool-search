import {
  DEFAULT_LIMIT,
  MAX_LOADED,
  MAX_QUERY_LENGTH,
  MAX_RESULTS,
  TOOL_NAMES,
} from './constants.js';

export const CONFIG_DESCRIPTIONS = Object.freeze({
  embeddingEnabled:
    'Use the selected embedding provider for hybrid searches. When disabled, use BM25 without embedding requests.',
  embeddingProvider: 'Provider for semantic tool discovery. Changes apply to the next search.',
  openaiEmbeddingModel: 'Model name accepted by the OpenAI-compatible embeddings endpoint.',
  openaiBaseUrl:
    'API base URL including its API prefix. HTTPS is required except on loopback hosts.',
  openaiApiKeyRef:
    'DSH credential reference, not the key value. Required for OpenAI; optional for compatible servers.',

  embeddingModel:
    'Local Ollama embedding model name, including its tag. Changes apply to the next search without unloading tools. Missing or unsupported models fall back to BM25. Models are not downloaded automatically.',
  alwaysAvailableTools:
    'Tool names whose schemas are always available to each agent. Changes apply on the next step. Tool Search and Tool Unload always remain available. Registry scope and permissions still apply.',
});

export const DESCRIPTIONS = Object.freeze({
  search: `Find installed DSH, plugin and MCP tools and load their original native schemas for the next step. Search by exact name or task keywords. Empty query returns a compact inventory. Does not execute tools or grant permission.`,
  unload: `Unload schemas previously loaded with ${TOOL_NAMES.search} for this agent. Omit names to unload all additional tools. Basic and lifecycle tools remain available. Tools can be searched again; permissions do not change.`,
  query: `Task keywords or exact tool name, at most ${MAX_QUERY_LENGTH} characters; empty for a compact inventory.`,
  limit: `Maximum tools to load: 1–${MAX_RESULTS}; default ${DEFAULT_LIMIT}.`,
  mode: 'Default hybrid uses the configured embedding provider with BM25 fallback. When embeddings are disabled, hybrid uses BM25 without network requests. Exact names use pattern matching.',
  names: 'Exact names to unload; omit to unload all additional tools.',
});

export const DISCOVERY_GUIDANCE = [
  'Tool discovery: only tools whose schemas appear in the current request are immediately available. The always-available selection is configurable and registry scope still applies.',
  `Find any other DSH, plugin or MCP tool with ${TOOL_NAMES.search} (an exact name or focused English keywords; hybrid also supports other languages).`,
  'Tools configured as always available can also be searched without consuming a loading slot.',
  'Finish the search step before calling a newly discovered tool: its original native schema appears on the next step.',
  'Empty query returns a compact inventory, not the full catalog.',
  `At most ${MAX_LOADED} additional tools are loaded per agent; least recently used tools are unloaded automatically.`,
  `Use ${TOOL_NAMES.unload} when finished and search again after unloading, tool replacement, or a fresh agent.`,
  'Search never executes a discovered tool or grants permission; all normal DSH approval and sandbox rules still apply.',
].join(' ');

export const PTC_DISCOVERY_GUIDANCE = [
  'Tool discovery in PTC: call only run_code, using the tools SDK declared for this agent.',
  `Find an unavailable tool with await tools.${TOOL_NAMES.search}({query: "exact_tool_name", limit: 1}); return the search result and finish that run_code call.`,
  'The next model step receives SDK declarations for the selected tools. Call them through run_code only after that step; do not guess undeclared methods or arguments.',
  'Tool names are exact SDK keys. For names containing hyphens, including many MCP names, use bracket notation: await tools["exact-tool-name"](args). Dot notation would be parsed as subtraction.',
  `Use await tools.${TOOL_NAMES.unload}({}) to unload additional capabilities when finished.`,
  `Each agent and subagent has an independent discovery state with at most ${MAX_LOADED} additional tools; configured base tools do not use loading slots.`,
  'Discovery never invokes found tools or grants permission. Existing DSH policies still apply to every nested call.',
].join(' ');

export const ERRORS = Object.freeze({
  disposed: 'Tool Search plugin is disposed',
  agentRequired: 'Tool Search requires a calling agent',
  catalogChanged: 'Tool catalog changed; search again',
  catalogChangedDuringSearch: 'Tool catalog changed during discovery; search again',
  notLoaded: `Tool is not loaded for this agent. Use ${TOOL_NAMES.search} first.`,
});
export const conflictMessage = (tool: string): string =>
  `Tool Search conflict: "${tool}" is already registered; disable the conflicting plugin first`;
