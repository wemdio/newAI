import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnalysisBatchSize } from './analysisBatchSize.js';

test('unconfigured clients retain the existing batch size', () => {
  assert.equal(resolveAnalysisBatchSize(52, 5, ''), 5);
  assert.equal(resolveAnalysisBatchSize(52, 10, '{}'), 10);
  assert.equal(resolveAnalysisBatchSize(52, 5, '{"58":1}'), 5);
  assert.equal(resolveAnalysisBatchSize(undefined, 5, '{"58":1}'), 5);
});

test('isolates only the selected config ID, including IDs read as strings', () => {
  assert.equal(resolveAnalysisBatchSize(58, 5, '{"58":1}'), 1);
  assert.equal(resolveAnalysisBatchSize('58', 5, '{"58":1}'), 1);
  assert.equal(resolveAnalysisBatchSize(52, 5, '{"58":1,"52":2}'), 2);
});

test('malformed or unsafe overrides cannot expand batches or stop analysis', () => {
  for (const raw of ['broken', 'null', '[]', '1', 'true',
    '{"58":0}', '{"58":-1}', '{"58":1.5}', '{"58":"1"}',
    '{"58":false}', '{"58":6}', '{"58":1e100}']) {
    assert.equal(resolveAnalysisBatchSize(58, 5, raw), 5, raw);
  }
});

test('invalid global batch sizes fall back to the existing default', () => {
  for (const size of [NaN, Infinity, 0, -1, 0.5]) {
    assert.equal(resolveAnalysisBatchSize(52, size, '{}'), 5);
  }
});

test('configuration is read per call and uses own keys only', t => {
  const old = process.env.AI_BATCH_SIZE_OVERRIDES;
  t.after(() => {
    if (old === undefined) delete process.env.AI_BATCH_SIZE_OVERRIDES;
    else process.env.AI_BATCH_SIZE_OVERRIDES = old;
  });
  process.env.AI_BATCH_SIZE_OVERRIDES = '{"58":1}';
  assert.equal(resolveAnalysisBatchSize(58), 1);
  delete process.env.AI_BATCH_SIZE_OVERRIDES;
  assert.equal(resolveAnalysisBatchSize(58), 5);
  assert.equal(resolveAnalysisBatchSize('toString', 5, '{}'), 5);
});
