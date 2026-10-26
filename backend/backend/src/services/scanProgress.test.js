import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processScanPage } from './scanProgress.js';

test('partial failure retains cursor and retries only failed messages', async () => {
  const messages = [10, 20, 30].map(id => ({ id }));
  const done = new Set();
  const first = await processScanPage(messages, 0, done, async () => [20]);
  assert.equal(first.lastProcessedId, 10);
  assert.deepEqual([...done], ['30']);
  const second = await processScanPage(messages.slice(1), 10, done, async pending => {
    assert.deepEqual(pending.map(m => m.id), [20]);
    return [];
  });
  assert.equal(second.lastProcessedId, 30);
  assert.equal(done.size, 0);
});

test('all failures and thrown errors never advance progress', async () => {
  const messages = [{ id: 10 }, { id: 11 }];
  const done = new Set();
  assert.equal((await processScanPage(messages, 5, done, async () => [10, 11])).lastProcessedId, 5);
  await assert.rejects(processScanPage(messages, 5, done, async () => { throw Error('429'); }));
  assert.equal(done.size, 0);
});

test('later messages are processed once while an earlier failure remains', async () => {
  const done = new Set(['20']);
  const result = await processScanPage([10, 20, 30].map(id => ({ id })), 0, done, async pending => {
    assert.deepEqual(pending.map(m => m.id), [10, 30]);
    return [10];
  });
  assert.equal(result.lastProcessedId, 0);
  assert.deepEqual([...done], ['20', '30']);
});

test('unknown failure IDs cannot silently acknowledge a page', async () => {
  const done = new Set();
  await assert.rejects(processScanPage([{ id: 10 }], 0, done, async () => [99]));
  assert.equal(done.size, 0);
});
