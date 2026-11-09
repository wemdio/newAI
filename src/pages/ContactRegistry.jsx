import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { contactsApi } from '../services/api';
import './ContactRegistry.css';

const groups = [
  ['all', 'Все'],
  ['leaders', 'Руководители'],
  ['staff', 'Специалисты'],
];
const sources = {
  bio: 'Био',
  historical_bio: 'Архивное био',
  message: 'Сообщение',
  both: 'Био и сообщение',
};
const formatDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });
const formatTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const number = value => typeof value === 'number' ? value.toLocaleString('ru-RU') : '—';

export default function ContactRegistry({ onLegacy }) {
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [freshness, setFreshness] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const { data } = await contactsApi.getRegistry({ search, group, freshness, page }, request.signal);
        if (request.signal.aborted) return;
        if (page > data.pagination.totalPages) setPage(data.pagination.totalPages);
        else setResult(data);
      } catch (err) {
        if (!request.signal.aborted) setError(err.response?.data?.error || 'Не удалось загрузить контакты.');
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); request.abort(); };
  }, [search, group, freshness, page, revision]);

  async function exportCsv() {
    setExporting(true);
    setExportError('');
    try {
      const { data } = await contactsApi.exportRegistry({ search, group, freshness });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'contact-registry.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError('Не удалось выгрузить контакты.');
    } finally {
      setExporting(false);
    }
  }

  const { contacts = [], stats, pagination } = result || {};
  return (
    <section className="contacts-page contact-registry">
      <div className="contacts-header">
        <h1>База контактов</h1>
        <div className="header-actions">
          <button className="btn" onClick={onLegacy}>Старая база</button>
          <button className="btn" onClick={exportCsv} disabled={exporting || loading || !pagination?.total || !!error}>
            <Download size={15} aria-hidden="true" />{exporting ? 'Выгружаем…' : 'Экспорт CSV'}
          </button>
          <button className="btn" onClick={() => setRevision(r => r + 1)} disabled={loading}
            title="Обновить реестр" aria-label="Обновить реестр">
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <dl className="registry-stats">
        <div><dt>Подтверждённые контакты</dt><dd>{number(stats?.total)}</dd></div>
        <div><dt>Руководители</dt><dd>{number(stats?.leaders)}</dd></div>
        <div><dt>Свежие подтверждения</dt><dd>{number(stats?.recent)}</dd></div>
        <div><dt>Последняя обработка</dt><dd className="registry-sync">
          {stats?.last_checked_at ? formatTime.format(new Date(stats.last_checked_at)) : '—'}
        </dd></div>
      </dl>
      <div className="registry-controls">
        <div className="registry-groups" role="group" aria-label="Группа контактов">
          {groups.map(([value, label]) => <button key={value} className="btn" aria-pressed={group === value}
            onClick={() => { setPage(1); setGroup(value); }}>{label}</button>)}
        </div>
        <label className="registry-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Поиск по профилю, компании или должности"
            placeholder="Профиль, компания, должность" maxLength={120} value={search}
            onChange={e => { setPage(1); setSearch(e.target.value); }} />
        </label>
        <select aria-label="Давность подтверждения" value={freshness}
          onChange={e => { setPage(1); setFreshness(e.target.value); }}>
          <option value="">Любая давность</option>
          <option value="recent">Подтверждение до 90 дней</option>
          <option value="review">Нужно перепроверить</option>
        </select>
      </div>
      {(error || exportError) && <p className="registry-error" role="alert">{error || exportError}</p>}
      <div className="contacts-table-container registry-table" aria-busy={loading}>
        <table className="contacts-table">
          <thead><tr><th>Telegram</th><th>Компания и должность</th><th>Подтверждение</th><th>Дата</th></tr></thead>
          <tbody>
            {loading || error || !contacts.length
              ? <tr><td colSpan={4} className="registry-empty" role="status">
                  {loading ? 'Загрузка…' : error ? 'Реестр недоступен' : 'Нет контактов по этим фильтрам'}
                </td></tr>
              : contacts.map(contact => (
                  <tr key={contact.telegram_user_id}>
                    <td>
                      <a className="registry-profile" href={`https://t.me/${contact.username}`} target="_blank" rel="noopener noreferrer">
                        @{contact.username}<ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </td>
                    <td><strong>{contact.company}</strong><span className="registry-muted">{contact.position_title}</span></td>
                    <td><details>
                      <summary>{sources[contact.evidence_kind] || 'Источник'}{contact.manually_reviewed && ' · Вручную'}</summary>
                      <p>{contact.excerpt}</p>
                    </details></td>
                    <td><time dateTime={contact.source_observed_at}>{formatDate.format(new Date(contact.source_observed_at))}</time>
                      {contact.requires_refresh && <span className="registry-review">Перепроверить</span>}
                    </td>
                  </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!!pagination && !error && (
        <div className="registry-footer">
          <span>Найдено: {number(pagination.total)}</span>
          <div className="registry-pager">
            <button className="btn" onClick={() => setPage(n => Math.max(1, n - 1))} disabled={page <= 1 || loading}
              title="Предыдущая страница" aria-label="Предыдущая страница"><ChevronLeft size={16} /></button>
            <span>{page} / {pagination.totalPages}</span>
            <button className="btn" onClick={() => setPage(n => n + 1)} disabled={page >= pagination.totalPages || loading}
              title="Следующая страница" aria-label="Следующая страница"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
