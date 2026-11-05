import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnalysisModel } from './analysisModel.js';

const primary = 'policy/lead-analysis';
const luna = 'openai/gpt-6-luna';

test('only an explicitly selected config receives a model override', () => {
  const overrides = JSON.stringify({ 2: luna });
  assert.equal(resolveAnalysisModel(2, primary, overrides), luna);
  assert.equal(resolveAnalysisModel('2', primary, overrides), luna);
  for (const id of [54, 57, 58, undefined, null, 'constructor', '__proto__', '2\n', ' 2', '02']) {
    assert.equal(resolveAnalysisModel(id, primary, overrides), primary);
  }
  assert.equal(resolveAnalysisModel(2, primary, '{}'), primary);
  assert.equal(resolveAnalysisModel(58, 'legacy-provider:model', overrides), 'legacy-provider:model');
});

test('malformed settings and invalid model IDs preserve the existing route', () => {
  for (const raw of ['broken', 'null', '[]', 'true', '2', '{"2":null}',
    '{"2":false}', '{"2":{}}', '{"2":""}', '{"2":"openai/gpt 6"}',
    '{"2":"https://example.com/model"}', '{"2":"openai/gpt-6-luna\\n"}']) {
    assert.equal(resolveAnalysisModel(2, primary, raw), primary, raw);
  }
});

test('configuration is evaluated per call without mutating other settings', t => {
  const oldModel = process.env.AI_MODEL;
  const oldOverrides = process.env.AI_MODEL_OVERRIDES;
  t.after(() => {
    if (oldModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = oldModel;
    if (oldOverrides === undefined) delete process.env.AI_MODEL_OVERRIDES;
    else process.env.AI_MODEL_OVERRIDES = oldOverrides;
  });
  process.env.AI_MODEL = primary;
  process.env.AI_MODEL_OVERRIDES = JSON.stringify({ 2: luna });
  assert.equal(resolveAnalysisModel(2), luna);
  assert.equal(resolveAnalysisModel(58), primary);
  assert.equal(process.env.AI_MODEL, primary);
  delete process.env.AI_MODEL_OVERRIDES;
  assert.equal(resolveAnalysisModel(2), primary);
});
