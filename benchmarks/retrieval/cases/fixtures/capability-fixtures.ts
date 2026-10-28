import type { QualityFixture } from '../../../shared/quality-types.js';

import { tool } from '../fixture-tool-builder.js';

import { QUALITY_TOOL_NAMES } from '../quality-tool-names.js';

export const GITHUB_TOOLS = [
  tool(QUALITY_TOOL_NAMES.githubGetIssue, 'Get one GitHub issue by its numeric issue number.', [
    { name: 'owner', type: 'string', description: 'Repository owner.' },
    { name: 'repository', type: 'string', description: 'Repository name.' },
    { name: 'issue_number', type: 'number', description: 'Exact issue number.' },
  ]),
  tool(
    QUALITY_TOOL_NAMES.githubListIssues,
    'List GitHub issues from one repository with structured state and label filters.',
    [
      { name: 'owner', type: 'string', description: 'Repository owner.' },
      { name: 'repository', type: 'string', description: 'Repository name.' },
      {
        name: 'state',
        type: '"open" | "closed"',
        description: 'Issue state.',
        optional: true,
      },
      {
        name: 'labels',
        type: 'readonly string[]',
        description: 'Required labels.',
        optional: true,
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.githubSearchIssues,
    'Search GitHub issues across repositories with GitHub query syntax.',
    [
      {
        name: 'query',
        type: 'string',
        description: 'Free-form GitHub issue search query.',
      },
      {
        name: 'sort',
        type: '"created" | "updated"',
        description: 'Result ordering.',
        optional: true,
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.githubListPullRequests,
    'List pull requests from one GitHub repository.',
    [
      { name: 'owner', type: 'string', description: 'Repository owner.' },
      { name: 'repository', type: 'string', description: 'Repository name.' },
      {
        name: 'state',
        type: '"open" | "closed"',
        description: 'Pull request state.',
        optional: true,
      },
    ],
  ),
  tool(
    QUALITY_TOOL_NAMES.githubSearchPullRequests,
    'Search pull requests across GitHub with query syntax.',
    [{ name: 'query', type: 'string', description: 'GitHub pull-request search query.' }],
  ),
  tool(QUALITY_TOOL_NAMES.githubGetPullRequest, 'Get one GitHub pull request by number.', [
    { name: 'owner', type: 'string', description: 'Repository owner.' },
    { name: 'repository', type: 'string', description: 'Repository name.' },
    { name: 'pull_number', type: 'number', description: 'Exact pull-request number.' },
  ]),
  tool(
    QUALITY_TOOL_NAMES.githubUpdateIssue,
    'Update the title, body, labels, or state of one GitHub issue.',
    [
      { name: 'issue_number', type: 'number', description: 'Issue number.' },
      {
        name: 'title',
        type: 'string',
        description: 'Replacement title.',
        optional: true,
      },
      {
        name: 'state',
        type: '"open" | "closed"',
        description: 'Replacement state.',
        optional: true,
      },
    ],
  ),
  tool(QUALITY_TOOL_NAMES.githubAddIssueComment, 'Add a new comment to one GitHub issue.', [
    { name: 'issue_number', type: 'number', description: 'Issue number.' },
    { name: 'body', type: 'string', description: 'Comment text.' },
  ]),
  tool(QUALITY_TOOL_NAMES.githubGetRelease, 'Get one GitHub release by tag.', [
    { name: 'tag', type: 'string', description: 'Exact release tag.' },
  ]),
  tool(
    QUALITY_TOOL_NAMES.githubListReleases,
    'List published GitHub releases for one repository.',
    [
      { name: 'owner', type: 'string', description: 'Repository owner.' },
      { name: 'repository', type: 'string', description: 'Repository name.' },
    ],
  ),
];

const communicationTools = [
  tool(
    QUALITY_TOOL_NAMES.slackSearchMessages,
    'Search messages in Slack channels and direct messages.',
    [{ name: 'query', type: 'string', description: 'Slack message search expression.' }],
  ),
  tool(QUALITY_TOOL_NAMES.slackSendMessage, 'Send a message to a Slack channel.', [
    { name: 'channel_id', type: 'string', description: 'Slack channel identifier.' },
    { name: 'text', type: 'string', description: 'Message text.' },
  ]),
  tool(QUALITY_TOOL_NAMES.teamsSearchMessages, 'Search messages in Microsoft Teams.', [
    { name: 'query', type: 'string', description: 'Teams message search text.' },
  ]),
  tool(QUALITY_TOOL_NAMES.teamsSendMessage, 'Send a message to a Microsoft Teams channel.', [
    {
      name: 'team_id',
      type: 'string',
      description: 'Microsoft Teams team identifier.',
    },
    { name: 'channel_id', type: 'string', description: 'Teams channel identifier.' },
    { name: 'text', type: 'string', description: 'Message text.' },
  ]),
  tool(QUALITY_TOOL_NAMES.gmailSearchMessages, 'Search email messages in Gmail.', [
    { name: 'query', type: 'string', description: 'Gmail search expression.' },
  ]),
  tool(QUALITY_TOOL_NAMES.gmailSendMessage, 'Send an email message through Gmail.', [
    { name: 'to', type: 'readonly string[]', description: 'Email recipients.' },
    { name: 'subject', type: 'string', description: 'Email subject.' },
    { name: 'body', type: 'string', description: 'Email body.' },
  ]),
];

const storageTools = [
  tool(
    QUALITY_TOOL_NAMES.driveSearchFiles,
    'Search files stored in Google Drive by name or full-text content.',
    [{ name: 'query', type: 'string', description: 'Google Drive search expression.' }],
  ),
  tool(QUALITY_TOOL_NAMES.driveGetFile, 'Get one Google Drive file by file identifier.', [
    { name: 'file_id', type: 'string', description: 'Google Drive file identifier.' },
  ]),
  tool(QUALITY_TOOL_NAMES.driveListFolder, 'List the direct children of a Google Drive folder.', [
    {
      name: 'folder_id',
      type: 'string',
      description: 'Google Drive folder identifier.',
    },
  ]),
  tool(QUALITY_TOOL_NAMES.dropboxSearchFiles, 'Search Dropbox files by name or content.', [
    { name: 'query', type: 'string', description: 'Dropbox search expression.' },
  ]),
  tool(QUALITY_TOOL_NAMES.dropboxGetFile, 'Get one Dropbox file by its absolute Dropbox path.', [
    { name: 'path', type: 'string', description: 'Absolute Dropbox file path.' },
  ]),
  tool(QUALITY_TOOL_NAMES.dropboxListFolder, 'List direct entries under a Dropbox folder path.', [
    { name: 'path', type: 'string', description: 'Dropbox folder path.' },
  ]),
];

const mailAndCalendarTools = [
  tool(QUALITY_TOOL_NAMES.calendarGetEvent, 'Get one Google Calendar event by event identifier.', [
    {
      name: 'event_id',
      type: 'string',
      description: 'Exact calendar event identifier.',
    },
  ]),
  tool(QUALITY_TOOL_NAMES.calendarListEvents, 'List Google Calendar events within a time range.', [
    { name: 'time_min', type: 'string', description: 'Inclusive range start.' },
    { name: 'time_max', type: 'string', description: 'Exclusive range end.' },
  ]),
  tool(QUALITY_TOOL_NAMES.calendarDeleteEvent, 'Delete one Google Calendar event.', [
    { name: 'event_id', type: 'string', description: 'Exact calendar event identifier.' },
  ]),
  tool(QUALITY_TOOL_NAMES.gmailGetMessage, 'Get one Gmail message by message identifier.', [
    {
      name: 'message_id',
      type: 'string',
      description: 'Exact Gmail message identifier.',
    },
  ]),
  tool(
    QUALITY_TOOL_NAMES.gmailListMessages,
    'List Gmail messages matching mailbox and label filters.',
    [
      {
        name: 'label_ids',
        type: 'readonly string[]',
        description: 'Gmail labels.',
        optional: true,
      },
      {
        name: 'max_results',
        type: 'number',
        description: 'Maximum messages.',
        optional: true,
      },
    ],
  ),
  tool(QUALITY_TOOL_NAMES.gmailArchiveMessage, 'Archive one Gmail message.', [
    { name: 'message_id', type: 'string', description: 'One Gmail message identifier.' },
  ]),
  tool(
    QUALITY_TOOL_NAMES.gmailArchiveMessages,
    'Archive a batch of Gmail messages in one operation.',
    [
      {
        name: 'message_ids',
        type: 'readonly string[]',
        description: 'Multiple Gmail message identifiers.',
      },
    ],
  ),
];

const browserAndEquivalentTools = [
  tool(
    QUALITY_TOOL_NAMES.browserScreenshot,
    'Capture a screenshot of the current in-app browser page.',
  ),
  tool(
    QUALITY_TOOL_NAMES.chromeScreenshot,
    'Capture a screenshot of the current Google Chrome page.',
  ),
  tool(
    QUALITY_TOOL_NAMES.playwrightScreenshot,
    'Capture a screenshot of the current Playwright page.',
  ),
  tool(QUALITY_TOOL_NAMES.browserOpenPage, 'Open a URL in the in-app browser.', [
    { name: 'url', type: 'string', description: 'Absolute URL to open.' },
  ]),
  tool(QUALITY_TOOL_NAMES.browserClickSelector, 'Click an element using a CSS selector.', [
    { name: 'selector', type: 'string', description: 'CSS selector.' },
  ]),
  tool(QUALITY_TOOL_NAMES.browserClickElement, 'Click an element returned by browser inspection.', [
    {
      name: 'element_id',
      type: 'string',
      description: 'Inspected browser element identifier.',
    },
  ]),
  tool(QUALITY_TOOL_NAMES.asanaCreateTask, 'Create a task in an Asana project.'),
  tool(QUALITY_TOOL_NAMES.trelloCreateCard, 'Create a card representing a task on a Trello board.'),
  tool(
    QUALITY_TOOL_NAMES.webSearch,
    'Search the public internet with a general web search engine.',
  ),
  tool(QUALITY_TOOL_NAMES.browserWebSearch, 'Search the public web in a browser search provider.'),
];

export const CAPABILITY_FIXTURES: readonly QualityFixture[] = [
  {
    id: 'github',
    description: 'Similar GitHub issue, pull-request, and release tools.',
    tools: GITHUB_TOOLS,
  },

  {
    id: 'communications',
    description: 'Similar messaging actions across Slack, Teams, and Gmail.',
    tools: communicationTools,
  },

  {
    id: 'storage',
    description: 'Equivalent and provider-specific cloud file operations.',
    tools: storageTools,
  },

  {
    id: 'mail-calendar',
    description: 'Singular, batch, and time-range operations.',
    tools: mailAndCalendarTools,
  },

  {
    id: 'browser-equivalents',
    description: 'Equivalent browser tools and schema-specific browser actions.',
    tools: browserAndEquivalentTools,
  },

  {
    id: 'provider-unavailable',
    description: 'Capabilities without explicitly requested external providers.',
    tools: [
      ...communicationTools.filter(({ name }) => !name.includes('slack')),
      tool(QUALITY_TOOL_NAMES.promptDeleteInterview, 'Delete one stored Prompt MCP interview.'),
      tool(
        QUALITY_TOOL_NAMES.safetyUpdateParentalControl,
        'Update parental-control settings for the current account.',
      ),
    ],
  },

  {
    id: 'capability-unavailable',
    description: 'GitHub provider without release deletion.',
    tools: GITHUB_TOOLS,
  },
];
