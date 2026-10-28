import type { QualityFixture } from '../../../shared/quality-types.js';

import { tool } from '../fixture-tool-builder.js';

import { QUALITY_TOOL_NAMES } from '../quality-tool-names.js';

const catalogV1Tools = [
  tool(QUALITY_TOOL_NAMES.deploymentRead, 'Read one deployment by deployment identifier.', [
    { name: 'deployment_id', type: 'string', description: 'Deployment identifier.' },
  ]),
];

const catalogV2Tools = [
  ...catalogV1Tools,
  tool(
    QUALITY_TOOL_NAMES.deploymentAuditRead,
    'Read the compliance audit record for one deployment.',
    [{ name: 'deployment_id', type: 'string', description: 'Deployment identifier.' }],
  ),
];

const scaleTools = [
  tool(
    QUALITY_TOOL_NAMES.scaleTarget,
    'Find an approved security exception in the knowledge base by control identifier.',
    [{ name: 'control_id', type: 'string', description: 'Security control identifier.' }],
  ),
  ...Array.from({ length: 240 }, (_, index) =>
    tool(
      `mcp__fixture_${String(index % 12).padStart(2, '0')}__read_record_${String(index).padStart(3, '0')}`,
      `Read synthetic fixture record ${index} for benchmark catalog scale testing.`,
      [
        {
          name: 'record_id',
          type: 'string',
          description: 'Synthetic record identifier.',
        },
      ],
    ),
  ),
];

export const SCALE_LIFECYCLE_FIXTURES: readonly QualityFixture[] = [
  {
    id: 'catalog-01-before',
    description: 'Catalog before a deployment audit tool is added.',
    tools: catalogV1Tools,
  },

  {
    id: 'catalog-02-after',
    description: 'Catalog after a deployment audit tool is added.',
    tools: catalogV2Tools,
  },

  {
    id: 'catalog-scale',
    description: 'One target among 240 synthetic distractors.',
    tools: scaleTools,
  },
];
