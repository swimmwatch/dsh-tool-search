import type { QualityCase } from '../../../shared/quality-types.js';
import { negative, positive } from '../case-builders.js';
import { QUALITY_TOOL_NAMES as T } from '../quality-tool-names.js';

export const SCALE_LIFECYCLE_QUALITY_CASES: readonly QualityCase[] = [
  positive({
    id: 'scale.security-exception-natural',
    category: 'catalog_scale_distractors',
    query: 'Find the approved knowledge-base security exception for control SOC2-CC6.1.',
    fixtureId: 'catalog-scale',
    acceptableTools: [T.scaleTarget],
    source: 'toolret',
  }),
  positive({
    id: 'scale.security-exception-paraphrase',
    category: 'catalog_scale_distractors',
    query: 'Look up the waiver approved for security control SOC2-CC6.1 in our knowledge base.',
    fixtureId: 'catalog-scale',
    acceptableTools: [T.scaleTarget],
    source: 'toolret',
  }),
  negative({
    id: 'scale.unavailable-satellite',
    category: 'catalog_scale_distractors',
    query: 'Change the orbit of the communications satellite.',
    fixtureId: 'catalog-scale',
    source: 'toolret',
  }),
  negative({
    id: 'refresh.before-audit-tool',
    category: 'catalog_refresh',
    query: 'Read the compliance audit record for deployment dep-81.',
    fixtureId: 'catalog-01-before',
    forbiddenTools: [T.deploymentRead],
    source: 'project_specific',
  }),
  positive({
    id: 'refresh.after-audit-tool',
    category: 'catalog_refresh',
    query: 'Read the compliance audit record for deployment dep-81.',
    fixtureId: 'catalog-02-after',
    acceptableTools: [T.deploymentAuditRead],
    forbiddenTools: [T.deploymentRead],
    source: 'project_specific',
  }),
];
