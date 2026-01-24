#!/usr/bin/env node
/**
 * Import chat "card" exports into messages table, then (optionally) aggregate to contacts.
 *
 * Usage:
 *   node scripts/import-contact-cards.js --file "C:\\path\\cards.xlsx" --chat "Cards export" --aggregate
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import xlsxPkg from 'xlsx';
const { readFile, utils } = xlsxPkg;
import { aggregateContactsForUsernames } from '../src/services/contactEnrichment.js';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}`;
  const direct = args.find((arg) => arg.startsWith(`${prefix}=`));
  if (direct) return direct.slice(prefix.length + 1);
  const idx = args.indexOf(prefix);
  if (idx !== -1) return args[idx + 1] || fallback;
  return fallback;
};

const filePathArg = getArg('file');
const chatNameArg = getArg('chat', 'Imported Cards');
const sheetNameArg = getArg('sheet', null);
const dryRun = args.includes('--dry-run');
const shouldAggregate = args.includes('--aggregate');

if (!filePathArg) {
  console.error('❌ Missing --file path');
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), filePathArg);
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '');

const HEADER_ALIASES = {
  username: [
    'username',
    'user',
    'login',
    'ник',
    'юзернейм',
    'логин',
    'telegramusername',
    'tgusername',
    '@',
    'id/username'
  ],
  first_name: ['firstname', 'first', 'имя', 'name'],
  last_name: ['lastname', 'last', 'фамилия', 'surname'],
  bio: ['bio', 'about', 'описание', 'о', 'aboutme', 'about_me', 'info', 'биография'],
  message: ['message', 'text', 'сообщение', 'сообщения', 'карточка', 'card', 'description'],
  message_time: [
    'message_time',
    'time',
    'date',
    'дата',
    'время',
    'timestamp',
    'датавремени',
    'последнийразвсети'
  ],
  chat_name: ['chat', 'chatname', 'чат', 'чатимя', 'source', 'источник', 'названиеисточника'],
  user_id: ['user_id', 'userid', 'telegramid', 'tgid', 'id', 'useridentifier'],
  profile_link: [
    'profile',
    'profilelink',
    'profile_url',
    'link',
    'ссылка',
    'tme',
    'телеграм',
    'личныйканал'
  ]
};

const mapHeader = (headers, aliases) => {
  const normalized = new Map();
  headers.forEach((h) => normalized.set(normalizeHeader(h), h));
  for (const alias of aliases) {
    const key = normalized.get(normalizeHeader(alias));
    if (key) return key;
  }
  return null;
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const str = String(value).trim();
  if (!str) return null;
  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = str.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3].length === 2 ? `20${match[3]}` : match[3], 10);
    const hour = parseInt(match[4] || '0', 10);
    const minute = parseInt(match[5] || '0', 10);
    const second = parseInt(match[6] || '0', 10);
    const parsed = new Date(Date.UTC(year, month, day, hour, minute, second));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
};

const extractUsername = (raw, profileLink) => {
  const direct = String(raw || '').trim();
  if (direct) return direct.replace(/^@/, '');
  const link = String(profileLink || '').trim();
  if (!link) return '';
  if (link.startsWith('@')) return link.replace(/^@/, '');
  const match = link.match(/t\.me\/([A-Za-z0-9_]+)/i);
  if (match) return match[1];
  if (/^[A-Za-z0-9_]+$/.test(link)) return link;
  return '';
};

const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const workbook = readFile(filePath, { cellDates: true });
const sheetName = sheetNameArg || workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
  console.error(`❌ Sheet not found: ${sheetName}`);
  process.exit(1);
}

const rows = utils.sheet_to_json(sheet, { defval: '', raw: true });
if (!rows.length) {
  console.error('❌ No rows found in sheet');
  process.exit(1);
}

const headers = Object.keys(rows[0] || {});
const headerMap = {
  username: mapHeader(headers, HEADER_ALIASES.username),
  first_name: mapHeader(headers, HEADER_ALIASES.first_name),
  last_name: mapHeader(headers, HEADER_ALIASES.last_name),
  bio: mapHeader(headers, HEADER_ALIASES.bio),
  message: mapHeader(headers, HEADER_ALIASES.message),
  message_time: mapHeader(headers, HEADER_ALIASES.message_time),
  chat_name: mapHeader(headers, HEADER_ALIASES.chat_name),
  user_id: mapHeader(headers, HEADER_ALIASES.user_id),
  profile_link: mapHeader(headers, HEADER_ALIASES.profile_link)
};

const processed = [];
const seen = new Set();

for (const row of rows) {
  const username = extractUsername(row[headerMap.username], row[headerMap.profile_link]);
  if (!username) continue;

  const messageTextRaw = normalizeText(row[headerMap.message]);
  const bio = normalizeText(row[headerMap.bio]);
  const fallbackMessage = [bio].filter(Boolean).join(' | ');
  const message = messageTextRaw || fallbackMessage || `Карточка пользователя @${username}`;

  const messageTime = parseDateValue(row[headerMap.message_time]) || new Date().toISOString();
  const chatName = normalizeText(row[headerMap.chat_name]) || chatNameArg;

  const firstName = normalizeText(row[headerMap.first_name]);
  const lastName = normalizeText(row[headerMap.last_name]);

  const profileLink = normalizeText(row[headerMap.profile_link]) || (username ? `https://t.me/${username}` : '');

  const userIdRaw = row[headerMap.user_id];
  const userId = userIdRaw === '' || userIdRaw === null || userIdRaw === undefined
    ? null
    : Number.isFinite(Number(userIdRaw))
      ? Number(userIdRaw)
      : null;

  const dedupeKey = `${username}|${messageTime}|${message}`.toLowerCase();
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);

  processed.push({
    message_time: messageTime,
    chat_name: chatName,
    first_name: firstName || null,
    last_name: lastName || null,
    username,
    bio: bio || null,
    message,
    user_id: userId,
    profile_link: profileLink || null
  });
}

console.log(`✅ Rows in file: ${rows.length}`);
console.log(`✅ Rows prepared: ${processed.length}`);
console.log(`✅ Headers mapping: ${JSON.stringify(headerMap, null, 2)}`);

if (dryRun) {
  console.log('ℹ️ Dry run mode enabled, no data inserted.');
  process.exit(0);
}

const BATCH_SIZE = 500;
let inserted = 0;

for (let i = 0; i < processed.length; i += BATCH_SIZE) {
  const batch = processed.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from('messages').insert(batch);
  if (error) {
    console.error('❌ Insert failed:', error.message);
    process.exit(1);
  }
  inserted += batch.length;
  console.log(`... inserted ${inserted}/${processed.length}`);
}

console.log(`✅ Inserted ${inserted} messages into Supabase`);

if (shouldAggregate) {
  const usernames = processed.map((row) => row.username);
  await aggregateContactsForUsernames(usernames, { batchSize: 200 });
  console.log('✅ Aggregation completed for imported usernames');
}
