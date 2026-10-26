import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { initializeOpenRouter } from './openrouter.js';

test('traced completions forward SDK request options without changing the response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const response = { choices: [{ message: { content: '{"verified":true}' } }] };
  const sdkCall = t.mock.method(OpenAI.Chat.Completions.prototype, 'create', async () => response);
  const client = initializeOpenRouter('test-only-key');
  if (client.chat.completions.create.name !== 'tracedCreate') {
    t.skip('Optional tracing dependency is not installed');
    return;
  }
  const params = { model: 'test-model', messages: [] };
  const options = { maxRetries: 0, timeout: 5000, signal: new AbortController().signal };
  assert.equal(await client.chat.completions.create(params, options), response);
  assert.equal(sdkCall.mock.calls[0].arguments[0], params);
  assert.equal(sdkCall.mock.calls[0].arguments[1], options);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('tracing preserves the original quota error and retry headers', async (t) => {
  const error = Object.assign(new Error('Quota exhausted'), {
    status: 429, headers: new Headers({ 'retry-after': '120' })
  });
  const sdkCall = t.mock.method(OpenAI.Chat.Completions.prototype, 'create', async () => { throw error; });
  const client = initializeOpenRouter('test-only-key');
  await assert.rejects(client.chat.completions.create({ model: 'test-model', messages: [] }, { maxRetries: 0 }),
    actual => actual === error);
  assert.equal(sdkCall.mock.callCount(), 1);
  assert.equal(sdkCall.mock.calls[0].arguments[1].maxRetries, 0);
});
