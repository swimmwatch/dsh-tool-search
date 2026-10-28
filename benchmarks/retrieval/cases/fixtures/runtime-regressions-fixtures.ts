import type { QualityFixture } from '../../../shared/quality-types.js';

import { tool } from '../fixture-tool-builder.js';

import { QUALITY_TOOL_NAMES } from '../quality-tool-names.js';

const runtimeRegressionTools = [
  tool(
    QUALITY_TOOL_NAMES.cloakBrowserNavigate,
    'Navigate the managed CloakBrowser page to an absolute URL.',
    [{ name: 'url', type: 'string', description: 'Absolute destination URL.' }],
  ),
  tool(QUALITY_TOOL_NAMES.nodeReplJs, 'Evaluate JavaScript in a persistent Node.js REPL session.', [
    { name: 'code', type: 'string', description: 'JavaScript source to evaluate.' },
  ]),
  tool(
    QUALITY_TOOL_NAMES.headroomStats,
    'Return current Headroom compression, retrieval, and token-saving statistics.',
  ),
  tool(
    QUALITY_TOOL_NAMES.headroomRetrieve,
    'Retrieve content represented by an existing Headroom CCR reference.',
    [{ name: 'reference', type: 'string', description: 'Existing CCR reference.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.headroomCompress,
    'Compress supplied content into a bounded Headroom reference.',
    [{ name: 'content', type: 'string', description: 'Content to compress.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.tokenSaveContext,
    'Read compact source-code context for a repository symbol.',
    [{ name: 'symbol', type: 'string', description: 'Source-code symbol.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.imageGenerate,
    'Generate a new bitmap image from a natural-language prompt or edit a referenced image.',
    [
      {
        name: 'prompt',
        type: 'string',
        description: 'Image generation or editing prompt.',
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.imageView,
    'View and inspect an existing local image file without editing it.',
    [{ name: 'path', type: 'string', description: 'Local image file path.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.context7ResolveLibrary,
    'Resolve a package or library name to its canonical Context7 library identifier.',
    [{ name: 'libraryName', type: 'string', description: 'Package or library name.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.context7QueryDocs,
    'Query current technical documentation for a resolved Context7 library identifier.',
    [
      { name: 'libraryId', type: 'string', description: 'Resolved Context7 identifier.' },
      { name: 'query', type: 'string', description: 'Documentation question.' },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeDriveSearch,
    'Search files and folders in connected Google Drive.',
    [{ name: 'query', type: 'string', description: 'Drive search query.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.githubCommitWorkflowRuns,
    'Fetch GitHub Actions workflow runs associated with one exact commit SHA.',
    [
      { name: 'repository', type: 'string', description: 'GitHub repository.' },
      { name: 'commit_sha', type: 'string', description: 'Exact source commit SHA.' },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.githubGenericFetch,
    'Fetch a generic GitHub resource by URL when no specialized operation applies.',
    [{ name: 'url', type: 'string', description: 'GitHub resource URL.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphCallers,
    'Find every direct and transitive caller of a code symbol in the indexed repository.',
    [{ name: 'symbol', type: 'string', description: 'Called code symbol.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphExplore,
    'Explore a code question and return relevant symbols with connecting call paths.',
    [{ name: 'query', type: 'string', description: 'Code architecture question.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphNode,
    'Read one indexed code symbol or file together with immediate relationships.',
    [{ name: 'name', type: 'string', description: 'Symbol or file name.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphSearch,
    'Search indexed source symbols and files by text pattern.',
    [{ name: 'pattern', type: 'string', description: 'Source search pattern.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeDriveTextRange,
    'Find a text range inside one already identified Google Drive document.',
    [
      { name: 'documentId', type: 'string', description: 'Exact document identifier.' },
      { name: 'text', type: 'string', description: 'Text within that document.' },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeGithubSearchPrs,
    'Search pull requests across one GitHub repository.',
    [
      { name: 'repository', type: 'string', description: 'GitHub repository.' },
      { name: 'query', type: 'string', description: 'Pull-request search query.' },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeGithubRecentUserPrs,
    'Get recent pull requests authored by one GitHub user in a repository.',
    [
      { name: 'repository', type: 'string', description: 'GitHub repository.' },
      { name: 'username', type: 'string', description: 'GitHub user name.' },
    ],
  ),
  tool(QUALITY_TOOL_NAMES.runtimeGithubCreatePr, 'Open a pull request in the repository.', [
    {
      name: 'repository_full_name',
      type: 'string',
      description: 'Repository in owner/name form.',
    },
    {
      name: 'title',
      type: 'string',
      description: 'Pull request title.',
      optional: true,
    },
  ]),
  tool(
    QUALITY_TOOL_NAMES.runtimeGithubGetPrInfo,
    'Get information for one pull request in a repository.',
    [
      {
        name: 'repository_full_name',
        type: 'string',
        description: 'Repository in owner/name form.',
      },
      { name: 'pull_number', type: 'number', description: 'Exact pull request number.' },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeGithubListPrReviews,
    'List review submissions on a pull request.',
    [
      { name: 'pr_number', type: 'number', description: 'Pull request number.' },
      {
        name: 'repo_full_name',
        type: 'string',
        description: 'Repository in owner/name form.',
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeGithubSearchInstalledRepositories,
    'Search for a repository by name or description.',
    [{ name: 'query', type: 'string', description: 'Repository search query.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireProjectList,
    'List projects accessible to the current Logfire account.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireExceptionsInFile,
    'Query Logfire exceptions observed in one source file.',
    [{ name: 'file', type: 'string', description: 'Source file path.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTickTickProjects,
    'List TickTick task-list projects for the current user.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTickTickCountdowns,
    'List TickTick countdown reminders for the current user.',
  ),
  tool(QUALITY_TOOL_NAMES.runtimeTickTickCreateTask, 'Create a task in one TickTick task list.', [
    { name: 'title', type: 'string', description: 'Task title.' },
    { name: 'project_id', type: 'string', description: 'Target task-list identifier.' },
  ]),
  tool(
    QUALITY_TOOL_NAMES.runtimeWebRun,
    'Search and open current information from the public internet with source links.',
    [{ name: 'search_query', type: 'string', description: 'Public web search query.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveNode,
    'Read compact local source context for one named code node.',
    [{ name: 'name', type: 'string', description: 'Local source node name.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeMcpResources,
    'List static resources published by configured MCP servers.',
    [
      {
        name: 'server',
        type: 'string',
        description: 'Optional MCP server name.',
        optional: true,
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeOpenAiDocsSearch,
    'Search the official OpenAI developer documentation catalog.',
    [{ name: 'query', type: 'string', description: 'OpenAI documentation query.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeOpenAiDocsFetch,
    'Fetch one known official OpenAI documentation page by URL.',
    [{ name: 'url', type: 'string', description: 'Known OpenAI documentation URL.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeBrowserTabs,
    'List, create, select, or close managed browser tabs; a new tab may open one URL.',
    [
      { name: 'action', type: 'string', description: 'Tab action.' },
      { name: 'url', type: 'string', description: 'URL for a new tab.', optional: true },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeBrowserSnapshot,
    'Read the visible accessibility snapshot of the active managed browser tab.',
  ),
];

const runtimeLogfireLiveTools = [
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireProjectList,
    'List all readable projects for the authenticated user in their organization.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireQueryRun,
    'Run a read-only query against Logfire telemetry.',
    [{ name: 'query', type: 'string', description: 'Telemetry query.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireFeatureFlagsSetup,
    'Return the AI-agent prompt to set up runtime feature flags with Logfire managed variables.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireInstrumentationSetup,
    'Return the AI-agent prompt to instrument an application with the Logfire SDK.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeLogfireExceptionsInFile,
    'Query Logfire exceptions observed in one source file.',
    [{ name: 'file', type: 'string', description: 'Source file path.' }],
  ),
];

const runtimeCodegraphLiveTools = [
  tool(
    QUALITY_TOOL_NAMES.codegraphExplore,
    'Codegraph is an indexed knowledge graph for repository symbols, edges, and files.\n\nPRIMARY TOOL for code questions: return verbatim source for relevant symbols plus the call path among them. The query can be a natural-language question or symbol names.',
    [
      {
        name: 'query',
        type: 'string',
        description: 'Code architecture question or symbol names.',
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphCallers,
    'Codegraph is an indexed knowledge graph for repository symbols.\n\nList functions that call one symbol. For a full flow, use codegraph_explore.',
    [{ name: 'symbol', type: 'string', description: 'Called code symbol.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphNode,
    'Codegraph is an indexed knowledge graph for repository symbols.\n\nRead one symbol or file with immediate callers and callees. Use codegraph_explore for a full flow.',
    [{ name: 'symbol', type: 'string', description: 'Code symbol.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.codegraphSearch,
    'Codegraph is an indexed knowledge graph for repository symbols.\n\nSearch symbol locations only without source code. Use codegraph_explore for call paths.',
    [{ name: 'query', type: 'string', description: 'Symbol name pattern.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveBranchDiff,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nCompare code graphs between two branches and show added, removed, or changed symbols.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveCallChain,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nFind call paths between two known node IDs.',
    [
      { name: 'from_id', type: 'number', description: 'Resolved source node ID.' },
      { name: 'to_id', type: 'number', description: 'Resolved target node ID.' },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveContext,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nBuild task context from a natural-language description.',
    [{ name: 'task', type: 'string', description: 'Code exploration task.' }],
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveDistribution,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nShow node kind distribution per file or directory.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveDependencyDepth,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nShow the longest file-level dependency chains.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveInheritanceDepth,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nFind the deepest class or interface inheritance hierarchies.',
  ),
  tool(
    QUALITY_TOOL_NAMES.runtimeTokenSaveSearch,
    'TokenSave is a code-graph service for symbols, relationships, and code snippets.\n\nSearch for symbols by name or keyword.',
    [{ name: 'query', type: 'string', description: 'Symbol name or keyword.' }],
  ),
];

export const RUNTIME_REGRESSIONS_FIXTURES: readonly QualityFixture[] = [
  {
    id: 'runtime-regressions',
    description: 'Close candidates observed in Codex E2E tool routing.',
    tools: runtimeRegressionTools,
  },

  {
    id: 'runtime-logfire-live',
    description: 'Live Logfire project-list distractors.',
    tools: runtimeLogfireLiveTools,
  },

  {
    id: 'runtime-codegraph-live',
    description: 'Live CodeGraph call-path distractors.',
    tools: runtimeCodegraphLiveTools,
  },
];
