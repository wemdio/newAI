import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('./036_create_leadmagnet_reader.sql', import.meta.url);

function migrationSql() {
  return readFileSync(migrationUrl, 'utf8');
}

test('lead magnet view exposes delivered leads without subscriber identifiers', () => {
  const sql = migrationSql();
  const viewDefinition = sql.match(
    /CREATE OR REPLACE VIEW leadbot\.delivered_leads_export[\s\S]+?;\s*REVOKE/i
  )?.[0];

  assert.ok(viewDefinition, 'delivered lead view must be created');
  assert.match(viewDefinition, /JOIN leadbot\.sent_leads/i);
  assert.doesNotMatch(viewDefinition, /\b(?:user_id|telegram_id|username)\b/i);
});

test('lead magnet role can only select from the export view', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE ROLE leadmagnet_reader NOLOGIN NOINHERIT/i);
  assert.match(sql, /ALTER ROLE leadmagnet_reader SET default_transaction_read_only = on/i);
  assert.match(sql, /ALTER ROLE leadmagnet_reader SET statement_timeout = '30s'/i);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA leadbot FROM leadmagnet_reader/i);
  assert.match(
    sql,
    /GRANT SELECT ON leadbot\.delivered_leads_export TO leadmagnet_reader/i
  );
  assert.doesNotMatch(
    sql,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]+leadmagnet_reader/i
  );
});
