import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBatch, analyzeMessage, analyzeMessageBatch, doubleCheckLead, testAnalysis, buildLeadAnalysisCompletionParams } from './messageAnalyzer.js';
import { initializeOpenRouter } from '../config/openrouter.js';
import { buildBatchAnalysisPrompts, buildVerificationPrompts } from '../prompts/promptBuilder.js';
import { resolveAnalysisBatchSize } from './analysisBatchSize.js';

describe('buildLeadAnalysisCompletionParams', () => {
  test('does NOT send reasoning params (they break non-reasoning deepseek-chat and force fallback to the pricey reasoning model)', () => {
    const params = buildLeadAnalysisCompletionParams({
      model: 'policy/lead-analysis',
      messages: [
        { role: 'system', content: 'criteria' },
        { role: 'user', content: 'message' }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    // Neither reasoning shape may be present — deepseek-chat (the policy primary)
    // rejects them, which silently routed all analysis traffic to deepseek-v4-flash.
    assert.equal('reasoning' in params, false);
    assert.equal('reasoning_effort' in params, false);
    // Core params still pass through unchanged.
    assert.equal(params.model, 'policy/lead-analysis');
    assert.equal(params.temperature, 0.1);
    assert.equal(params.max_tokens, 4000);
  });
});

test('batch pipeline retains valid verdicts and exposes incomplete responses as failures', async (t) => {
  // No real provider calls or usage writes are allowed in this test.
  const oldUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
  });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  const verdict = id => ({ id, is_match: false, confidence_score: 90, reasoning: '', matched_criteria: [] });
  let payload;
  const completion = t.mock.method(client.chat.completions, 'create', async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
  }));
  const messages = [10, 20, 30].map(id => ({ id, message: 'Ordinary discussion without a purchase request' }));
  for (const [response, failed] of [
    [[verdict(30), verdict(10)], [20]],
    [[verdict(10), verdict(20), verdict(20), verdict(30)], [20]],
    [[{ ...verdict(10), is_match: 'broken' }, verdict(20), verdict(30)], [10]],
    [[{ ...verdict(10), id: undefined }], [10, 20, 30]]
  ]) {
    payload = response;
    const result = await analyzeBatch(messages, 'Find business requests', null, { maxConcurrent: 1 });
    assert.deepEqual(result.failed.map(item => item.message.id), failed);
    assert.equal(result.stats.analyzed, messages.length - failed.length);
    assert.equal(result.stats.matches, 0);
  }
  assert.equal(completion.mock.callCount(), 4);
  for (const [response, expected] of [[{}, false], [{ verified: 'false' }, false], [{ verified: false }, false]]) {
    payload = response;
    const checked = await doubleCheckLead(messages[0], { confidence_score: 85 }, 'Find requests', null);
    assert.equal(checked.verified, expected);
    assert.equal(checked.retryable, !('verified' in response));
    if (!('verified' in response)) {
      assert.match(checked.reasoning, /unavailable/);
      assert.equal(checked.confidence, 0);
    }
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('production calls use shared prompts without changing confidence or verifier decisions', async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
  });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  let payload;
  const completion = t.mock.method(client.chat.completions, 'create', async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
    model: 'fallback-model',
    usage: { prompt_tokens: 10, completion_tokens: 10 }
  }));
  const message = { id: 1, message: `${'Business details. '.repeat(80)}Need a warehouse system.`, bio: 'Owner' };
  const criteria = 'Find warehouse software selection requests; reject advertisements.';
  for (const score of [69, 70, 75, 80, 85]) {
    const verdict = { id: '1', is_match: true, confidence_score: score, reasoning: 'Selecting a warehouse solution', matched_criteria: ['software selection'] };
    payload = verdict;
    const single = await analyzeMessage(message, criteria, null);
    assert.equal(single.aiResponse.confidence_score, score);
    assert.equal(single.isMatch, score >= 70);
    payload = [verdict];
    const batch = await analyzeMessageBatch([message], criteria, null);
    assert.equal(batch[0].aiResponse.confidence_score, score);
    assert.equal(batch[0].isMatch, score >= 70);
    const prompts = buildBatchAnalysisPrompts([message], criteria);
    assert.deepEqual(completion.mock.calls.at(-1).arguments[0].messages, [
      { role: 'system', content: prompts.systemPrompt }, { role: 'user', content: prompts.userPrompt }
    ]);
  }
  const initial = { confidence_score: 85, reasoning: 'Selection request' };
  for (const verified of [true, false]) {
    payload = { verified, reason: verified ? 'Fits criteria' : 'Explicit exclusion' };
    const result = await doubleCheckLead(message, initial, criteria, null);
    assert.equal(result.verified, verified);
    assert.equal(result.retryable, false);
    assert.equal(result.confidence, verified ? 85 : 0);
    assert.equal(result.model, 'fallback-model');
    const prompts = buildVerificationPrompts(message, initial, criteria);
    assert.deepEqual(completion.mock.calls.at(-1).arguments[0].messages, [
      { role: 'system', content: prompts.systemPrompt }, { role: 'user', content: prompts.userPrompt }
    ]);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('per-config model routing survives batch, single and batch-to-single fallback without changing scores', async t => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldModel = process.env.AI_MODEL;
  const oldOverrides = process.env.AI_MODEL_OVERRIDES;
  delete process.env.SUPABASE_URL;
  process.env.AI_MODEL = 'policy/lead-analysis';
  process.env.AI_MODEL_OVERRIDES = '{"2":"openai/gpt-6-luna"}';
  t.after(() => {
    for (const [name, value] of [['SUPABASE_URL', oldUrl], ['AI_MODEL', oldModel], ['AI_MODEL_OVERRIDES', oldOverrides]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  const verdict = { id: '42', is_match: true, confidence_score: 88, reasoning: 'Service request', matched_criteria: ['request'] };
  let brokenBatch = false;
  const completion = t.mock.method(client.chat.completions, 'create', async params => {
    const batch = params.messages[1].content.startsWith('ПРОАНАЛИЗИРУЙ СЛЕДУЮЩИЕ');
    const batchPayload = params.response_format?.type === 'json_schema' ? { results: [verdict] } : [verdict];
    const payload = batch ? (brokenBatch ? { unexpected: true } : batchPayload) : verdict;
    return { choices: [{ message: { content: JSON.stringify(payload) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } };
  });
  const message = { id: 42, message: 'A direct service request' };
  for (const configId of [2, 54, 57, 58, undefined]) {
    const expected = configId === 2 ? 'openai/gpt-6-luna' : 'policy/lead-analysis';
    const testResult = await testAnalysis('Find service requests', message, null, { configId });
    assert.equal(testResult.success, true);
    assert.equal(completion.mock.calls.at(-1).arguments[0].model, expected);
    assert.equal(testResult.result.aiResponse.confidence_score, 88);
    for (const useBatchApi of [true, false]) {
      const result = await analyzeBatch([message], 'Find service requests', null,
        { configId, useBatchApi, maxConcurrent: 1 });
      assert.equal(completion.mock.calls.at(-1).arguments[0].model, expected);
      assert.equal(completion.mock.calls.at(-1).arguments[0].response_format?.type,
        useBatchApi ? (configId === 2 ? 'json_schema' : undefined) : 'json_object');
      assert.equal(result.matches[0].analysis.aiResponse.confidence_score, 88);
    }
  }
  brokenBatch = true;
  const fallback = await analyzeBatch([message], 'Find service requests', null,
    { configId: 2, maxConcurrent: 1 });
  assert.equal(fallback.stats.analyzed, 1);
  assert.equal(fallback.matches[0].analysis.aiResponse.confidence_score, 88);
  for (const call of completion.mock.calls.slice(-2)) {
    assert.equal(call.arguments[0].model, 'openai/gpt-6-luna');
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('verifier quota failures do not become approvals or multiply SDK retries', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  const completion = t.mock.method(client.chat.completions, 'create', async (_params, options) => {
    assert.equal(options.maxRetries, 0);
    throw Object.assign(new Error('Provider quota exhausted'), {
      status: 429, headers: new Headers({ 'retry-after': '120' })
    });
  });
  const result = await doubleCheckLead({ id: 42, message: 'Target request' }, { confidence_score: 95 }, 'Criteria', null);
  assert.equal(result.verified, false);
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterMs, 120000);
  assert.equal(result.confidence, 0);
  assert.equal(completion.mock.callCount(), 1);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('extra verifier scores cannot raise confidence or override an explicit rejection', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  let payload;
  t.mock.method(client.chat.completions, 'create', async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }]
  }));
  for (const score of [70, 79, 80, 84, 85, 99]) {
    for (const verified of [true, false]) {
      payload = { verified, confidence_score: 100, reason: 'Verifier verdict' };
      const result = await doubleCheckLead({ id: 42, message: 'Request' },
        { confidence_score: score }, 'Criteria', null);
      assert.equal(result.verified, verified);
      assert.equal(result.retryable, false);
      assert.equal(result.confidence, verified ? score : 0);
    }
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('independent verifier uses its own score and rejects invalid verdicts', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  let payload;
  const completion = t.mock.method(client.chat.completions, 'create', async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }]
  }));
  const initial = { confidence_score: 75, reasoning: 'Distinct initial reasoning' };
  for (const [verdict, confidence, retryable] of [
    [{ verified: true, confidence_score: 91, reason: 'Clear request' }, 91, false],
    [{ verified: true, confidence_score: 83, reason: 'Borderline fit' }, 83, false],
    [{ verified: false, confidence_score: 99 }, 0, false],
    [{ verified: true, reason: 'Missing score' }, 0, true],
    [{ verified: true, confidence_score: '91', reason: 'Not an integer' }, 0, true],
    [{ verified: true, confidence_score: 101, reason: 'Out of range' }, 0, true],
    [{ verified: true, confidence_score: 90, reason: ' ' }, 0, true]
  ]) {
    payload = verdict;
    const result = await doubleCheckLead({ id: 42, message: 'Request' }, initial, 'Criteria',
      null, null, { rescore: true });
    assert.equal(result.confidence, confidence);
    assert.equal(result.retryable, retryable);
    const prompt = completion.mock.calls.at(-1).arguments[0].messages[1].content;
    assert.doesNotMatch(prompt, /Distinct initial reasoning|\b75\b/);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('verifier forbidden responses preserve status and do not get retried', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  const completion = t.mock.method(client.chat.completions, 'create', async () => {
    throw Object.assign(new Error('Forbidden model'), { status: 403 });
  });
  const result = await doubleCheckLead({ id: 42, message: 'Target request' }, { confidence_score: 95 }, 'Criteria', null);
  assert.equal(result.verified, false);
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterMs, 60000);
  assert.equal(completion.mock.callCount(), 1);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('per-client isolation sends one message per request without raising scores', async t => {
  const oldUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
  });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const client = initializeOpenRouter('test-only-key');
  const scores = new Map([['1', 69], ['2', 80], ['3', 90]]);
  const completion = t.mock.method(client.chat.completions, 'create', async params => {
    const text = params.messages[1].content;
    const messages = JSON.parse(text.slice(text.indexOf('\n') + 1));
    assert.equal(messages.length, 1);
    return { choices: [{ message: { content: JSON.stringify(messages.map(message => ({
      id: message.id, is_match: true, confidence_score: scores.get(message.id),
      reasoning: 'Target service request', matched_criteria: ['service request']
    }))) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
  const result = await analyzeBatch([1, 2, 3].map(id => ({ id, message: 'A service request' })),
    'Find requests', null, { maxConcurrent: 1, batchSize: resolveAnalysisBatchSize(58, 5, '{"58":1}') });
  assert.equal(completion.mock.callCount(), 3);
  assert.equal(result.stats.analyzed, 3);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(result.matches.map(row => row.analysis.aiResponse.confidence_score), [80, 90]);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
