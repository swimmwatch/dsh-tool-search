import { CAPABILITY_QUALITY_CASES } from './groups/capability-cases.js';
import { PROVIDER_ACTION_QUALITY_CASES } from './groups/provider-action-cases.js';
import { SCHEMAS_SCOPES_QUALITY_CASES } from './groups/schemas-scopes-cases.js';
import { LANGUAGE_NOISE_QUALITY_CASES } from './groups/language-noise-cases.js';
import { SAFETY_POLICY_QUALITY_CASES } from './groups/safety-policy-cases.js';
import { RUNTIME_REGRESSIONS_QUALITY_CASES } from './groups/runtime-regressions-cases.js';
import { SCALE_LIFECYCLE_QUALITY_CASES } from './groups/scale-lifecycle-cases.js';
import type { QualityCase } from '../../shared/quality-types.js';

export const QUALITY_CASES: readonly QualityCase[] = [
  ...CAPABILITY_QUALITY_CASES,
  ...PROVIDER_ACTION_QUALITY_CASES,
  ...SCHEMAS_SCOPES_QUALITY_CASES,
  ...LANGUAGE_NOISE_QUALITY_CASES,
  ...SAFETY_POLICY_QUALITY_CASES,
  ...RUNTIME_REGRESSIONS_QUALITY_CASES,
  ...SCALE_LIFECYCLE_QUALITY_CASES,
];
