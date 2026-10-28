import type { CatalogEntry, ParsedToolDefinition, PolicyProfile, Risk } from '../shared/types.js';

const PROFILE_RISKS: Readonly<Record<PolicyProfile, ReadonlySet<Risk>>> = {
  'read-only': new Set(['read']),
  mutation: new Set(['read', 'write']),
  execution: new Set(['read', 'write', 'execution']),
  all: new Set(['read', 'write', 'execution', 'destructive', 'unknown']),
};
const DESTRUCTIVE_ACTIONS = new Set([
  'cancel',
  'close',
  'delete',
  'destroy',
  'drop',
  'force',
  'purge',
  'remove',
  'reset',
  'revoke',
  'uninstall',
]);
const EXECUTION_ACTIONS = new Set([
  'command',
  'dispatch',
  'exec',
  'execute',
  'evaluate',
  'rerun',
  'shell',
]);
const EXECUTION_TOOL_NAMES = new Set(['mcp__node_repl__js']);
const READ_TOOL_NAMES = new Set(['web__run']);
const READ_ACTIONS = new Set([
  'analyze',
  'browse',
  'callers',
  'compress',
  'console',
  'convert',
  'describe',
  'diagnose',
  'diff',
  'download',
  'explore',
  'fetch',
  'find',
  'get',
  'inspect',
  'list',
  'load',
  'lookup',
  'messages',
  'network',
  'open',
  'query',
  'read',
  'render',
  'rephrase',
  'resolve',
  'retrieve',
  'search',
  'screenshot',
  'show',
  'snapshot',
  'summarize',
  'translate',
  'validate',
  'verify',
  'view',
  'wait',
]);
const WRITE_ACTIONS = new Set([
  'add',
  'apply',
  'approve',
  'archive',
  'assign',
  'change',
  'click',
  'commit',
  'complete',
  'create',
  'deploy',
  'edit',
  'fill',
  'drag',
  'generate',
  'handle',
  'hover',
  'imagegen',
  'import',
  'install',
  'merge',
  'move',
  'navigate',
  'press',
  'publish',
  'reply',
  'request',
  'resize',
  'send',
  'select',
  'set',
  'start',
  'tabs',
  'type',
  'update',
  'upload',
  'write',
]);

function actionTokens(value: unknown): readonly string[] {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export class ToolRiskClassifier {
  public classify(tool: Pick<ParsedToolDefinition, 'name'>): Risk {
    const tokens = actionTokens(tool.name);
    const writeActionTokens = tokens.filter(
      (token) => token !== 'request' || !tokens.includes('pull'),
    );
    if (tokens.some((token) => DESTRUCTIVE_ACTIONS.has(token))) {
      return 'destructive';
    }
    if (
      EXECUTION_TOOL_NAMES.has(tool.name) ||
      tokens.some((token) => EXECUTION_ACTIONS.has(token)) ||
      (tokens.includes('run') && (tokens.includes('code') || tokens.includes('unsafe')))
    ) {
      return 'execution';
    }
    if (writeActionTokens.some((token) => WRITE_ACTIONS.has(token))) {
      return 'write';
    }
    if (READ_TOOL_NAMES.has(tool.name) || tokens.some((token) => READ_ACTIONS.has(token))) {
      return 'read';
    }
    return 'unknown';
  }
}

export class ToolPolicy {
  public readonly allowedRisks: ReadonlySet<Risk>;

  public constructor(public readonly profile: PolicyProfile = 'read-only') {
    this.allowedRisks = PROFILE_RISKS[profile];
  }

  public allows(tool: Pick<CatalogEntry, 'risk'>): boolean {
    return this.allowedRisks.has(tool.risk);
  }
}
