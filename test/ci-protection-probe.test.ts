import assert from 'node:assert/strict';
import test from 'node:test';

await test('intentional branch protection probe', () => {
  assert.fail('This disposable PR must never be merged.');
});
