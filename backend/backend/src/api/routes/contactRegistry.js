import express from 'express';
import { getSupabase } from '../../config/database.js';
import logger from '../../utils/logger.js';

const TABLE = 'internal_contact_registry';
const FIELDS = 'telegram_user_id,username,company,position_title,leadership,manually_reviewed,evidence_kind,source_observed_at,excerpt,profile_last_observed_at,requires_refresh';
const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_LIMIT = 25000;

export function registryFilters(query) {
  const search = typeof query.search === 'string' ? query.search.trim().replace(/^@/, '').slice(0, 120) : '';
  return {
    search: search.replace(/[\\%_]/g, '\\$&'),
    leadership: query.group === 'leaders' ? true : query.group === 'staff' ? false : null,
    freshness: typeof query.freshness === 'string' ? query.freshness : '',
    cutoff: new Date(Date.now() - 90 * 86400000).toISOString(),
  };
}

function filterRegistry(query, filters) {
  if (filters.search) query = query.ilike('search_text', `%${filters.search}%`);
  if (filters.leadership !== null) query = query.eq('leadership', filters.leadership);
  if (filters.freshness === 'recent') {
    query = query.eq('requires_refresh', false).gte('source_observed_at', filters.cutoff);
  } else if (filters.freshness === 'review') {
    query = query.or(`requires_refresh.eq.true,source_observed_at.lt.${filters.cutoff}`);
  }
  return query;
}

export const registryCsvCell = (value) => {
  const text = String(value ?? '');
  const safe = /^\s*[=+@-]|^[\t\r\n]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
};

const checked = (response) => {
  if (response.error) throw response.error;
  return response;
};

// Mounted only after requireContactsAdmin on the contacts router.
export function createContactRegistryRouter(getDb = getSupabase) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/', async (req, res) => {
    try {
      const requestedPage = typeof req.query.page === 'string' && /^\d{1,6}$/.test(req.query.page)
        ? Number(req.query.page) : 1;
      const page = Math.max(1, requestedPage);
      const offset = (page - 1) * PAGE_SIZE;
      const filters = registryFilters(req.query);
      const db = getDb();
      const count = () => db.from(TABLE).select('telegram_user_id', { count: 'exact', head: true });
      const [list, total, leaders, recent, status] = (await Promise.all([
        filterRegistry(db.from(TABLE).select(FIELDS, { count: 'exact' }), filters)
          .order('requires_refresh').order('source_observed_at', { ascending: false })
          .order('telegram_user_id').range(offset, offset + PAGE_SIZE - 1),
        count(),
        count().eq('leadership', true),
        count().eq('requires_refresh', false).gte('source_observed_at', filters.cutoff),
        db.from('internal_contact_registry_status').select('last_checked_at,processed_messages').single(),
      ])).map(checked);
      res.json({
        contacts: list.data.map(row => ({
          ...row,
          requires_refresh: row.requires_refresh || Date.parse(row.source_observed_at) < Date.parse(filters.cutoff),
        })),
        pagination: { page, total: list.count, totalPages: Math.max(1, Math.ceil(list.count / PAGE_SIZE)) },
        stats: { total: total.count, leaders: leaders.count, recent: recent.count, ...status.data },
      });
    } catch (error) {
      logger.error('Failed to load internal contact registry', { error: error.message });
      res.status(503).json({ error: 'Не удалось загрузить реестр контактов.' });
    }
  });

  router.get('/export.csv', async (req, res) => {
    try {
      const filters = registryFilters(req.query);
      const db = getDb();
      const rows = [];
      let lastId = 0;
      for (;;) {
        const { data } = checked(await filterRegistry(db.from(TABLE).select(FIELDS), filters)
          .gt('telegram_user_id', lastId).order('telegram_user_id').limit(EXPORT_PAGE_SIZE));
        rows.push(...data);
        if (rows.length > EXPORT_LIMIT) {
          return res.status(400).json({ error: 'Для экспорта сузьте выборку до 25 000 контактов.' });
        }
        if (data.length < EXPORT_PAGE_SIZE) break;
        lastId = data.at(-1).telegram_user_id;
      }
      const headings = ['Telegram', 'Компания', 'Должность', 'Руководитель', 'Источник', 'Дата источника', 'Подтверждение', 'Нужно перепроверить'];
      const csv = [headings, ...rows.map(row => [
        'https://t.me/' + row.username, row.company, row.position_title, row.leadership ? 'Да' : 'Нет',
        row.evidence_kind, row.source_observed_at, row.excerpt,
        row.requires_refresh || Date.parse(row.source_observed_at) < Date.parse(filters.cutoff) ? 'Да' : 'Нет',
      ])].map(row => row.map(registryCsvCell).join(',')).join('\r\n');
      res.attachment('contact-registry.csv').type('text/csv; charset=utf-8').send('\uFEFF' + csv);
    } catch (error) {
      logger.error('Failed to export internal contact registry', { error: error.message });
      res.status(503).json({ error: 'Не удалось выгрузить реестр контактов.' });
    }
  });
  return router;
}
