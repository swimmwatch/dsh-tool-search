import { createHash } from 'node:crypto';
import type { SearchTool } from './types.js';

const MCP_PREFIX = 'mcp__';
const MAX_PUBLIC_NAME_LENGTH = 64;
const HASH_LENGTH = 12;
const MAX_SERVER_NAME_LENGTH = 32;
const IDENTIFIER_QUERY = /^\+?([\w-]+)$/;

/** Match the naming contract of the supported DSH 0.2.1-rc.2 MCP bridge. */
function publicMcpName(server: string, rawName: string): string {
  const joined = `${MCP_PREFIX}${server}__${rawName}`;
  const normalized = joined.replace(/[^\w-]/g, '_');
  if (joined === normalized && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return joined;
  const suffix = createHash('sha256')
    .update(`${server}\0${rawName}`)
    .digest('hex')
    .slice(0, HASH_LENGTH);
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${suffix}`;
}

/** Forward-map a supplied identity, then require its presence in the caller's catalog. */
export function exactToolNames(tools: readonly SearchTool[], query: string): string[] {
  const identifier = query.match(IDENTIFIER_QUERY)?.[1];
  if (!identifier) return [];
  if (tools.some((tool) => tool.name === identifier)) return [identifier];
  const available = new Set(tools.map((tool) => tool.name));
  const servers = new Set<string>();
  for (const tool of tools) {
    if (!tool.name.startsWith(MCP_PREFIX)) continue;
    // Server names may contain __; each candidate still needs a registered-name match below.
    for (
      let separator = tool.name.indexOf('__', MCP_PREFIX.length);
      separator >= 0 && separator - MCP_PREFIX.length <= MAX_SERVER_NAME_LENGTH;
      separator = tool.name.indexOf('__', separator + 1)
    ) {
      if (separator > MCP_PREFIX.length) servers.add(tool.name.slice(MCP_PREFIX.length, separator));
    }
  }
  const matches = new Set<string>();
  for (const server of servers) {
    const prefix = `${MCP_PREFIX}${server}__`;
    if (identifier.startsWith(MCP_PREFIX) && !identifier.startsWith(prefix)) continue;
    const rawName = identifier.startsWith(prefix) ? identifier.slice(prefix.length) : identifier;
    const name = publicMcpName(server, rawName);
    if (available.has(name)) matches.add(name);
  }
  return [...matches].sort((left, right) => left.localeCompare(right));
}
