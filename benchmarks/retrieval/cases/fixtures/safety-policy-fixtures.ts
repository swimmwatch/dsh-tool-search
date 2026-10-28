import type { QualityFixture } from '../../../shared/quality-types.js';

import { tool } from '../fixture-tool-builder.js';

import { QUALITY_TOOL_NAMES } from '../quality-tool-names.js';
import { GITHUB_TOOLS } from './capability-fixtures.js';

const packageAndPolicyTools = [
  tool(
    QUALITY_TOOL_NAMES.packageRead,
    'Read package metadata and published versions from a package registry.',
  ),
  tool(QUALITY_TOOL_NAMES.packagePublish, 'Publish a new package version to a package registry.'),
  tool(QUALITY_TOOL_NAMES.packageDelete, 'Delete a package version from a package registry.'),
  tool(QUALITY_TOOL_NAMES.commandRun, 'Run a local command without shell interpolation.'),
  tool(QUALITY_TOOL_NAMES.githubDeleteIssue, 'Delete one GitHub issue.'),
  ...GITHUB_TOOLS.slice(0, 3),
];

export const SAFETY_POLICY_FIXTURES: readonly QualityFixture[] = [
  {
    id: 'policy',
    description: 'Read, write, execution, and destructive risk classes.',
    tools: packageAndPolicyTools,
  },
];
