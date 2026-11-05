import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBatchResponseFormat } from './batchResponseFormat.js';

test('only the tested Luna model opts into a strict batch schema', () => {
  for (const model of ['policy/lead-analysis', 'deepseek/deepseek-chat', undefined]) {
    assert.equal(buildBatchResponseFormat(model), undefined);
  }
  const format = buildBatchResponseFormat('openai/gpt-6-luna');
  assert.equal(format.type, 'json_schema');
  assert.equal(format.json_schema.strict, true);
  assert.deepEqual(format.json_schema.schema.required, ['results']);
  assert.equal(format.json_schema.schema.additionalProperties, false);
  const row = format.json_schema.schema.properties.results.items;
  assert.equal(row.additionalProperties, false);
  assert.deepEqual(row.required, Object.keys(row.properties));
  assert.deepEqual(row.properties.confidence_score, { type: 'integer', minimum: 0, maximum: 100 });
});
