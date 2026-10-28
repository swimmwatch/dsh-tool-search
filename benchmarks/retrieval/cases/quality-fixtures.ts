import { CAPABILITY_FIXTURES } from './fixtures/capability-fixtures.js';
import { SAFETY_POLICY_FIXTURES } from './fixtures/safety-policy-fixtures.js';
import { LANGUAGE_NOISE_FIXTURES } from './fixtures/language-noise-fixtures.js';
import { SCALE_LIFECYCLE_FIXTURES } from './fixtures/scale-lifecycle-fixtures.js';
import { RUNTIME_REGRESSIONS_FIXTURES } from './fixtures/runtime-regressions-fixtures.js';
import type { QualityFixture } from '../../shared/quality-types.js';
export { QUALITY_TOOL_NAMES } from './quality-tool-names.js';

export const QUALITY_FIXTURES: readonly QualityFixture[] = [
  ...CAPABILITY_FIXTURES,
  ...SAFETY_POLICY_FIXTURES,
  ...LANGUAGE_NOISE_FIXTURES,
  ...SCALE_LIFECYCLE_FIXTURES,
  ...RUNTIME_REGRESSIONS_FIXTURES,
];

export const QUALITY_FIXTURE_BY_ID: ReadonlyMap<string, QualityFixture> = new Map(
  QUALITY_FIXTURES.map((fixture) => [fixture.id, fixture]),
);
