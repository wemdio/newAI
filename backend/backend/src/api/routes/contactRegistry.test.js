import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createContactsAdminGuard } from '../middleware/contactsAccess.js';
import { createContactRegistryRouter, registryCsvCell, registryFilters } from './contactRegistry.js';

test('registry search escapes SQL wildcard characters and ignores non-string input', () => {
  const filters = registryFilters({ search: '@A_B%\\', group: 'leaders', freshness: 'recent' });
  assert.equal(filters.search, 'A\\_B\\%\\\\');
  assert.equal(filters.leadership, true);
  assert.equal(registryFilters({ search: { eq: 'test' }, group: ['leaders'] }).search, '');
  assert.equal(registryFilters({ group: ['leaders'] }).leadership, null);
});

test('registry CSV quotes fields and neutralizes spreadsheet formulas', () => {
  assert.equal(registryCsvCell('A, "B"'), '"A, ""B"""');
  assert.equal(registryCsvCell(' =HYPERLINK("bad")'), '"\' =HYPERLINK(""bad"")"');
});

test('registry list and export deny clients before reading any contacts', async t => {
  const app = express();
  let databaseCalls = 0;
  const guard = createContactsAdminGuard(async () => ({ data: { user: { id: 'other-user' } } }));
  app.use('/registry', guard, createContactRegistryRouter(() => { databaseCalls++; }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/registry';
  for (const path of ['', '/export.csv']) {
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: { Authorization: 'Bearer other-session' } })).status, 403);
  }
  assert.equal(databaseCalls, 0);
});
