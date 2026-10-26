import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapBatchResults } from './batchResultMapping.js';

const messages = [{ id: 1 }, { id: 2 }];
test('reordered results map by ID', () => {
  const a = { id: '1', is_match: true }, b = { id: 2, is_match: false };
  assert.deepEqual(mapBatchResults(messages, [b, a]), [a, b]);
});
test('missing, unknown and absent IDs remain retryable nulls', () => {
  const a = { id: 1 };
  assert.deepEqual(mapBatchResults(messages, [a]), [a, null]);
  assert.deepEqual(mapBatchResults(messages, [{ id: 99 }, { is_match: false }]), [null, null]);
  assert.deepEqual(mapBatchResults(messages, [{ is_match: true }, { is_match: false }]), [null, null]);
});
test('duplicate ID verdicts are not trusted', () => {
  const b = { id: 2 };
  assert.deepEqual(mapBatchResults(messages, [{ id: 1 }, { id: '1' }, b]), [null, b]);
});
