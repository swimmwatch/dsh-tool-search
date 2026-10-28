import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_URL,
  EMBEDDING_TIMEOUT_MS,
} from './embedding-settings.js';

export {
  MAX_QUERY_LENGTH,
  RESULT_LIMIT as MAX_RESULTS,
  SEARCH_MODES,
} from './core/shared/types.js';

export const PACKAGE_NAME = '@swimmwatch/dsh-tool-search';
export const PLUGIN_NAME = 'dsh-tool-search';
export const TOOL_NAMES = Object.freeze({ search: 'tool_search', unload: 'tool_unload' });
export const DISCOVERY_TOOLS: ReadonlySet<string> = new Set(Object.values(TOOL_NAMES));
export const MAX_LOADED = 16;
export const DEFAULT_LIMIT = 3;
export const DEFAULT_MODE = 'hybrid';
export const DESCRIPTION_LIMIT = 240;
export const GUIDANCE_SECTION = 'local:tool-discovery';
export const MCP_SECTION_PREFIX = 'mcp:';
export const EMBEDDING = Object.freeze({
  model: DEFAULT_EMBEDDING_MODEL,
  url: DEFAULT_OLLAMA_URL,
  allowRemote: false,
  timeoutMs: EMBEDDING_TIMEOUT_MS,
});
export const BASE_TOOLS: readonly string[] = Object.freeze([
  'bash',
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'ask_user_question',
  'read_image',
  'working_directory',
  'skill',
  'job_list',
  'job_output',
  'job_kill',
  'workflow',
  'schedule_create',
  'schedule_list',
  'schedule_update',
  'schedule_delete',
  'subagent',
  'subagent_fork',
  'list_agents',
  'send_message',
  'interrupt_agent',
  'create_goal',
  'get_goal',
  'update_goal',
  'todo_write',
  'list_subagent_models',
  'ralph',
  'spawn_teammate',
  'team_task_create',
  'team_task_get',
  'team_task_list',
  'team_task_update',
  'wait_agent',
  'exit_plan_mode',
  'structured_output',
  TOOL_NAMES.search,
  TOOL_NAMES.unload,
]);
