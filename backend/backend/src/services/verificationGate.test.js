import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationGate } from './verificationGate.js';
import { processScanPage } from './scanProgress.js';

test('outage backs off per user and never invents a verified result', async () => {
  let time = 1000;
  let calls = 0;
  const gate = createVerificationGate(async () => {
    calls++;
    return { verified: false, retryable: true, retryAfterMs: 120000 };
  }, () => time);
  const check = user => gate.check({}, {}, '', null, user);
  assert.equal((await check('a')).retryable, true);
  assert.equal(gate.retryAt.get('a'), 121000);
  time += 5000;
  assert.equal((await check('a')).verified, false);
  assert.equal(calls, 1);
  await check('b');
  assert.equal(calls, 2);
  time = 121000;
  await check('a');
  assert.equal(calls, 3);
});

test('provider errors and malformed verdicts are retryable, explicit rejects are final', async () => {
  for (const response of [null, {}, { verified: 'false' }]) {
    const gate = createVerificationGate(async () => response, () => 0);
    assert.equal((await gate.check({}, {}, '', null, 'a')).retryable, true);
  }
  const failure = createVerificationGate(async () => { throw Error('Timeout'); }, () => 0);
  assert.equal((await failure.check({}, {}, '', null, 'a')).retryable, true);
  for (const verified of [false, true]) {
    const gate = createVerificationGate(async () => ({ verified, retryable: false }), () => 0);
    assert.deepEqual(await gate.check({}, {}, '', null, 'a'), { verified, retryable: false });
    assert.equal(gate.retryAt.size, 0);
  }
});

test('retryable responses cannot grant approval and invalid delay uses bounded cooldown', async () => {
  for (const delay of [undefined, NaN, Infinity, -1000, 0]) {
    const gate = createVerificationGate(async () => ({
      verified: true, retryable: true, retryAfterMs: delay
    }), () => 1000);
    const result = await gate.check({}, {}, '', null, 'a');
    assert.equal(result.verified, false);
    assert.equal(result.retryAfterMs, 60000);
    assert.equal(gate.retryAt.get('a'), 61000);
  }
});

test('unverified messages retain their cursor and are delivered only after recovery', async () => {
  let time = 0;
  let available = false;
  const done = new Set();
  const saved = [];
  const gate = createVerificationGate(async message => {
    if (!available) return { verified: false, retryable: true };
    return { verified: message.id === 10, retryable: false };
  }, () => time);
  const messages = [{ id: 10 }, { id: 20 }];
  const process = async pending => {
    const failed = [];
    for (const message of pending) {
      const result = await gate.check(message, {}, '', null, 'a');
      if (result.retryable) failed.push(message.id);
      else if (result.verified) saved.push(message.id);
    }
    return failed;
  };
  const first = await processScanPage(messages, 0, done, process);
  assert.equal(first.lastProcessedId, 0);
  assert.deepEqual(first.failedIds, ['10', '20']);
  assert.deepEqual(saved, []);
  available = true;
  time = 60000;
  const second = await processScanPage(messages, 0, done, process);
  assert.equal(second.lastProcessedId, 20);
  assert.deepEqual(second.failedIds, []);
  assert.deepEqual(saved, [10]);
  assert.equal(gate.retryAt.size, 0);
});
