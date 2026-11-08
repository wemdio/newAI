import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createContactsAdminGuard } from './contactsAccess.js';
import contactsRouter from '../routes/contacts.js';

const ADMIN_ID = 'f2aceadb-9997-409f-97c4-465f6258ff14';
const ADMIN_EMAIL = 'egorkanigin@polzaagency.ru';

const check = async (headers, getUser) => {
  const result = { status: null, calledNext: false };
  const req = { get: name => headers[name] };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await createContactsAdminGuard(getUser)(req, res, () => { result.calledNext = true; });
  return result;
};

test('contacts refuse anonymous callers and spoofed admin headers', async () => {
  for (const headers of [{}, { 'x-user-email': ADMIN_EMAIL, 'x-user-id': ADMIN_ID }]) {
    const result = await check(headers, () => assert.fail('Missing token reached auth service'));
    assert.equal(result.status, 401);
    assert.equal(result.calledNext, false);
  }
});

test('contacts require a valid session for an authorized account ID', async () => {
  const headers = { authorization: 'Bearer mock-token', 'x-user-email': ADMIN_EMAIL };
  const invalid = await check(headers, async () => ({ error: { status: 401 } }));
  assert.equal(invalid.status, 401);

  const nonAdmin = await check(headers, async () => ({
    data: { user: { id: 'other-user', email: ADMIN_EMAIL } }
  }));
  assert.equal(nonAdmin.status, 403);
  assert.equal(nonAdmin.calledNext, false);

  const admin = await check(headers, async token => {
    assert.equal(token, 'mock-token');
    return { data: { user: { id: ADMIN_ID } } };
  });
  assert.equal(admin.calledNext, true);
});

test('contacts fail closed during an authentication outage', async () => {
  const result = await check({ authorization: 'Bearer mock-token' }, async () => {
    throw Error('network failure');
  });
  assert.equal(result.status, 503);
  assert.equal(result.calledNext, false);
});

test('all contact read and mutation routes reject requests with only forged headers', async t => {
  const app = express();
  app.use('/api/contacts', contactsRouter);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/contacts`;
  for (const [method, path] of [
    ['HEAD', '/'],
    ['GET', '/stats'],
    ['GET', '/admin/check'],
    ['GET', '/example-contact'],
    ['GET', '/export/csv'],
    ['POST', '/aggregate'],
    ['POST', '/enrich'],
    ['POST', '/reset-enrichment'],
    ['DELETE', '/example-contact']
  ]) {
    const response = await fetch(base + path, {
      method, headers: { 'x-user-email': ADMIN_EMAIL, 'x-user-id': ADMIN_ID }
    });
    assert.equal(response.status, 401, `${method} ${path}`);
    await response.body?.cancel();
  }
});
