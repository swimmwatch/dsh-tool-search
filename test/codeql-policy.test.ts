import assert from 'node:assert/strict';
import test from 'node:test';
import { highSecurityFindings } from '../scripts/codeql-policy.js';

await test('CodeQL high security alerts block releases even when analysis itself succeeded', () => {
  const rules = [
    { id: 'unsafe', properties: { 'security-severity': '9.8' } },
    { id: 'low', properties: { 'security-severity': '3.0' } },
  ];
  const run = { tool: { driver: { rules } }, results: [{ ruleId: 'unsafe' }, { ruleId: 'low' }] };
  assert.deepEqual(highSecurityFindings({ runs: [run] }), ['unsafe']);
  assert.deepEqual(highSecurityFindings({ runs: [{ ...run, results: [] }] }), []);
  assert.throws(() => highSecurityFindings({ invalid: true }));
});
