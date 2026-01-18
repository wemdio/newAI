import React, { useState, useEffect, useCallback } from 'react';
import { contactsApi } from '../services/api';
import './Contacts.css';

// Position type labels
const POSITION_LABELS = {
  CEO: { label: 'CEO', class: 'badge-ceo' },
  DIRECTOR: { label: 'Директор', class: 'badge-director' },
  MANAGER: { label: 'Менеджер', class: 'badge-manager' },
  SPECIALIST: { label: 'Специалист', class: 'badge-specialist' },
  FREELANCER: { label: 'Фрилансер', class: 'badge-specialist' },
  OTHER: { label: 'Другое', class: 'badge-specialist' }
};

function Contacts() {
  // State
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactMessages, setContactMessages] = useState([]);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState({
    search: '',
    is_decision_maker: '',
    position_type: '',
    is_enriched: '',
    min_score: '',
    min_messages: '',
    sort_by: 'messages_count',
    sort_order: 'desc'
  });
  
  // Enrichment state
  const [enriching, setEnriching] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [updatingData, setUpdatingData] = useState(false);
  const [showEnrichModal, setShowEnrichModal] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [enrichCount, setEnrichCount] = useState(1000);

  // Load contacts
  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        page,
        limit: 50,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        )
      };
      
      const response = await contactsApi.getAll(params);
      setContacts(response.data.contacts || []);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка загрузки контактов');
      console.error('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // Load stats
  const loadStats = async () => {
    try {
      const response = await contactsApi.getStats();
      setStats(response.data.stats);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // Initial load
  useEffect(() => {
    loadStats();
  }, []);

  // Load contacts when filters/page change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadContacts();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadContacts]);

  // Aggregate contacts
  const handleAggregate = async () => {
    if (aggregating) return;
    
    try {
      setAggregating(true);
      await contactsApi.aggregate({ maxContacts: 10000 });
      alert('Агрегация запущена в фоне. Обновите страницу через минуту.');
      setTimeout(() => {
        loadStats();
        loadContacts();
      }, 5000);
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.error || err.message));
    } finally {
      setAggregating(false);
    }
  };

  // Update contact data (bio, names) from messages
  const handleUpdateData = async () => {
    if (updatingData) return;
    
    if (!confirm('Обновить данные контактов (bio, имена) из сообщений?\nЭто может занять несколько минут.')) {
      return;
    }
    
    try {
      setUpdatingData(true);
      await contactsApi.updateData({ batchSize: 500 });
      alert('Обновление данных запущено в фоне. Обновите страницу через пару минут.');
      setTimeout(() => {
        loadStats();
        loadContacts();
      }, 30000);
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.error || err.message));
    } finally {
      setUpdatingData(false);
    }
  };

  // Open enrich modal
  const handleEnrichClick = () => {
    const count = stats?.notEnriched || 0;
    if (count === 0) {
      alert('Все контакты уже обогащены!');
      return;
    }
    setShowEnrichModal(true);
  };

  // Enrich contacts with API key
  const handleEnrich = async () => {
    if (enriching) return;
    
    if (!apiKey.trim()) {
      alert('Введите OpenRouter API ключ');
      return;
    }
    
    const count = stats?.notEnriched || 0;
    const toEnrich = enrichCount === 0 ? count : Math.min(count, enrichCount);
    
    try {
      setEnriching(true);
      const response = await contactsApi.enrich({ 
        apiKey: apiKey.trim(),
        maxContacts: toEnrich,
        onlyWithBio: false,
        minMessages: 1
      });
      
      setShowEnrichModal(false);
      setApiKey(''); // Очищаем ключ из памяти
      
      alert(`Обогащение запущено!\nКонтактов: ${response.data.contactsToEnrich}\nОценка стоимости: $${response.data.estimatedCostUsd}`);
      
      setTimeout(() => {
        loadStats();
        loadContacts();
      }, 10000);
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.error || err.message));
    } finally {
      setEnriching(false);
    }
  };

  // Export CSV
  const handleExport = () => {
    const params = new URLSearchParams({
      is_enriched: 'true',
      ...(filters.is_decision_maker && { is_decision_maker: filters.is_decision_maker }),
      ...(filters.position_type && { position_type: filters.position_type }),
      ...(filters.min_score && { min_score: filters.min_score })
    });
    window.open(`/api/contacts/export/csv?${params}`, '_blank');
  };

  // View contact detail
  const handleViewContact = async (contact) => {
    try {
      const response = await contactsApi.getOne(contact.id);
      setSelectedContact(response.data.contact);
      setContactMessages(response.data.messages || []);
    } catch (err) {
      console.error('Error loading contact:', err);
    }
  };

  // Filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  // Render score bar
  const renderScore = (score) => {
    const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    return (
      <div className="score-cell">
        <div className="score-bar">
          <div 
            className={`score-fill ${level}`} 
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="score-value">{score}</span>
      </div>
    );
  };

  // Render position badge
  const renderPositionBadge = (type) => {
    const config = POSITION_LABELS[type] || POSITION_LABELS.OTHER;
    return <span className={`badge ${config.class}`}>{config.label}</span>;
  };

  if (loading && contacts.length === 0) {
    return (
      <div className="contacts-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <span className="loading-text">Загрузка контактов...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="contacts-page">
      {/* Header */}
      <div className="contacts-header">
        <h1>База контактов</h1>
        <div className="header-actions">
          <button 
            className="btn btn-secondary" 
            onClick={handleAggregate}
            disabled={aggregating}
          >
            {aggregating ? '⏳ Агрегация...' : '📥 Собрать контакты'}
          </button>
          <button 
            className="btn btn-warning" 
            onClick={handleUpdateData}
            disabled={updatingData}
            title="Подтянуть bio и имена из сообщений"
          >
            {updatingData ? '⏳ Обновление...' : '🔄 Обновить данные'}
          </button>
          <button 
            className="btn btn-success" 
            onClick={handleEnrichClick}
            disabled={enriching || !stats?.notEnriched}
          >
            {enriching ? '⏳ Обогащение...' : `🤖 Обогатить (${stats?.notEnriched || 0})`}
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            📊 Экспорт CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Всего контактов</span>
            <span className="stat-value">{stats.total?.toLocaleString()}</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-label">ЛПР (Decision Makers)</span>
            <span className="stat-value">{stats.lprs?.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Обогащено</span>
            <span className="stat-value">{stats.enriched?.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">С биографией</span>
            <span className="stat-value">{stats.withBio?.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Потрачено на AI</span>
            <span className="stat-value">${stats.enrichmentCost?.totalUsd || '0.00'}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-grid">
          <div className="filter-group">
            <label>Поиск</label>
            <input 
              type="text"
              placeholder="Имя, username, компания..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
          
          <div className="filter-group">
            <label>Тип ЛПР</label>
            <select 
              value={filters.is_decision_maker}
              onChange={(e) => handleFilterChange('is_decision_maker', e.target.value)}
            >
              <option value="">Все</option>
              <option value="true">Только ЛПР</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Должность</label>
            <select 
              value={filters.position_type}
              onChange={(e) => handleFilterChange('position_type', e.target.value)}
            >
              <option value="">Все</option>
              <option value="CEO">CEO / Владелец</option>
              <option value="DIRECTOR">Директор</option>
              <option value="MANAGER">Менеджер</option>
              <option value="SPECIALIST">Специалист</option>
              <option value="FREELANCER">Фрилансер</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Обогащение</label>
            <select 
              value={filters.is_enriched}
              onChange={(e) => handleFilterChange('is_enriched', e.target.value)}
            >
              <option value="">Все</option>
              <option value="true">Обогащённые</option>
              <option value="false">Не обогащённые</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Мин. Score</label>
            <select 
              value={filters.min_score}
              onChange={(e) => handleFilterChange('min_score', e.target.value)}
            >
              <option value="">Любой</option>
              <option value="30">30+</option>
              <option value="50">50+</option>
              <option value="70">70+</option>
              <option value="90">90+</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Мин. сообщений</label>
            <select 
              value={filters.min_messages}
              onChange={(e) => handleFilterChange('min_messages', e.target.value)}
            >
              <option value="">Любое</option>
              <option value="3">3+</option>
              <option value="5">5+</option>
              <option value="10">10+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner" style={{ padding: '12px', background: '#2e1a1a', border: '1px solid #3e2a2a', color: '#d17d7d', borderRadius: '4px', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Contacts Table */}
      {contacts.length === 0 ? (
        <div className="empty-state">
          <h3>Контакты не найдены</h3>
          <p>Нажмите "Собрать контакты" чтобы агрегировать данные из сообщений</p>
          <button className="btn btn-primary" onClick={handleAggregate}>
            📥 Собрать контакты
          </button>
        </div>
      ) : (
        <div className="contacts-table-container">
          <table className="contacts-table">
            <thead>
              <tr>
                <th>Контакт</th>
                <th>Bio</th>
                <th>Должность</th>
                <th>ЛПР</th>
                <th>Отрасль</th>
                <th className="sortable" onClick={() => {
                  const newOrder = filters.sort_by === 'lead_score' && filters.sort_order === 'desc' ? 'asc' : 'desc';
                  handleFilterChange('sort_by', 'lead_score');
                  handleFilterChange('sort_order', newOrder);
                }}>
                  Score {filters.sort_by === 'lead_score' && (filters.sort_order === 'desc' ? '↓' : '↑')}
                </th>
                <th className="sortable" onClick={() => {
                  const newOrder = filters.sort_by === 'messages_count' && filters.sort_order === 'desc' ? 'asc' : 'desc';
                  handleFilterChange('sort_by', 'messages_count');
                  handleFilterChange('sort_order', newOrder);
                }}>
                  Сообщений {filters.sort_by === 'messages_count' && (filters.sort_order === 'desc' ? '↓' : '↑')}
                </th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(contact => (
                <tr key={contact.id} onClick={() => handleViewContact(contact)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="contact-name">
                      <span className="contact-fullname">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Без имени'}
                      </span>
                      <span className="contact-username">@{contact.username}</span>
                    </div>
                  </td>
                  <td>
                    <span className="contact-bio" title={contact.bio}>
                      {contact.bio || '—'}
                    </span>
                  </td>
                  <td>
                    <div className="contact-position">
                      {contact.position_type && renderPositionBadge(contact.position_type)}
                      {contact.position && <span className="position-title">{contact.position}</span>}
                      {contact.company_name && <span className="position-company">{contact.company_name}</span>}
                    </div>
                  </td>
                  <td>
                    {contact.is_decision_maker && (
                      <span className="badge badge-lpr">✓ ЛПР</span>
                    )}
                  </td>
                  <td>{contact.industry || '—'}</td>
                  <td>{contact.is_enriched ? renderScore(contact.lead_score || 0) : '—'}</td>
                  <td>{contact.messages_count}</td>
                  <td>
                    {contact.is_enriched ? (
                      <span className="badge badge-enriched">Обогащён</span>
                    ) : (
                      <span className="badge badge-pending">Ожидает</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination */}
          <div className="pagination">
            <span className="pagination-info">
              Показано {contacts.length} из {total.toLocaleString()} контактов
            </span>
            <div className="pagination-controls">
              <button 
                className="pagination-btn"
                disabled={page === 1}
                onClick={() => setPage(1)}
              >
                ««
              </button>
              <button 
                className="pagination-btn"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                «
              </button>
              <span className="pagination-btn active">{page}</span>
              <button 
                className="pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                »
              </button>
              <button 
                className="pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                »»
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrich API Key Modal */}
      {showEnrichModal && (
        <div className="modal-overlay" onClick={() => setShowEnrichModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>🤖 Обогащение контактов</h2>
              <button className="modal-close" onClick={() => setShowEnrichModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h4>Настройки</h4>
                <div className="filter-group" style={{ marginBottom: '16px' }}>
                  <label>Количество контактов</label>
                  <select 
                    value={enrichCount} 
                    onChange={(e) => setEnrichCount(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  >
                    <option value={1000}>1,000 контактов (~$0.08)</option>
                    <option value={5000}>5,000 контактов (~$0.40)</option>
                    <option value={10000}>10,000 контактов (~$0.80)</option>
                    <option value={0}>Все ({(stats?.notEnriched || 0).toLocaleString()}) (~${((stats?.notEnriched || 0) * 0.00008).toFixed(2)})</option>
                  </select>
                </div>
                
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Будет обогащено</span>
                    <span className="detail-value">
                      {(enrichCount === 0 ? stats?.notEnriched || 0 : Math.min(stats?.notEnriched || 0, enrichCount)).toLocaleString()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Примерная стоимость</span>
                    <span className="detail-value" style={{ color: '#7dd17d' }}>
                      ~${((enrichCount === 0 ? stats?.notEnriched || 0 : Math.min(stats?.notEnriched || 0, enrichCount)) * 0.00008).toFixed(2)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Модель</span>
                    <span className="detail-value">Qwen 2.5-7B</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Примерное время</span>
                    <span className="detail-value">
                      ~{Math.ceil((enrichCount === 0 ? stats?.notEnriched || 0 : Math.min(stats?.notEnriched || 0, enrichCount)) / 30 / 2)} мин
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="filter-group" style={{ marginTop: '20px' }}>
                <label>OpenRouter API Key</label>
                <input 
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '12px', color: '#666', marginTop: '4px', display: 'block' }}>
                  Получить ключ: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#7db8d1' }}>openrouter.ai/keys</a>
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowEnrichModal(false)}
                  style={{ flex: 1 }}
                >
                  Отмена
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleEnrich}
                  disabled={enriching || !apiKey.trim()}
                  style={{ flex: 1 }}
                >
                  {enriching ? '⏳ Запуск...' : '🚀 Запустить обогащение'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contact Detail Modal */}
      {selectedContact && (
        <div className="modal-overlay" onClick={() => setSelectedContact(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Детали контакта</h2>
              <button className="modal-close" onClick={() => setSelectedContact(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="contact-detail">
                <div className="contact-detail-header">
                  <div className="contact-avatar">
                    {(selectedContact.first_name?.[0] || selectedContact.username?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="contact-detail-info">
                    <h3>
                      {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ') || 'Без имени'}
                    </h3>
                    <span className="username">@{selectedContact.username}</span>
                  </div>
                </div>

                {selectedContact.bio && (
                  <div className="detail-section">
                    <h4>Биография</h4>
                    <p style={{ color: 'rgba(255,255,255,0.8)', margin: 0 }}>{selectedContact.bio}</p>
                  </div>
                )}

                {selectedContact.is_enriched && (
                  <>
                    <div className="detail-section">
                      <h4>Профессиональная информация</h4>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="detail-label">Должность</span>
                          <span className="detail-value">{selectedContact.position || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Тип</span>
                          <span className="detail-value">
                            {selectedContact.position_type && renderPositionBadge(selectedContact.position_type)}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Компания</span>
                          <span className="detail-value">{selectedContact.company_name || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Отрасль</span>
                          <span className="detail-value">{selectedContact.industry || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Размер компании</span>
                          <span className="detail-value">{selectedContact.company_size || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">ЛПР</span>
                          <span className="detail-value">
                            {selectedContact.is_decision_maker ? (
                              <span className="badge badge-lpr">✓ Да</span>
                            ) : 'Нет'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h4>AI анализ</h4>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="detail-label">Lead Score</span>
                          <span className="detail-value">{renderScore(selectedContact.lead_score || 0)}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Уверенность</span>
                          <span className="detail-value">{selectedContact.enrichment_confidence}%</span>
                        </div>
                      </div>
                      {selectedContact.ai_summary && (
                        <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: 12 }}>
                          {selectedContact.ai_summary}
                        </p>
                      )}
                    </div>

                    {selectedContact.interests?.length > 0 && (
                      <div className="detail-section">
                        <h4>Интересы</h4>
                        <div className="tags-list">
                          {selectedContact.interests.map((int, i) => (
                            <span key={i} className="tag">{int}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedContact.pain_points?.length > 0 && (
                      <div className="detail-section">
                        <h4>Боли / Проблемы</h4>
                        <div className="tags-list">
                          {selectedContact.pain_points.map((pain, i) => (
                            <span key={i} className="tag-pain">
                              {pain}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="detail-section">
                  <h4>Активность</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Сообщений</span>
                      <span className="detail-value">{selectedContact.messages_count}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Первое появление</span>
                      <span className="detail-value">
                        {selectedContact.first_seen_at ? new Date(selectedContact.first_seen_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Последнее</span>
                      <span className="detail-value">
                        {selectedContact.last_seen_at ? new Date(selectedContact.last_seen_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Каналы</span>
                      <span className="detail-value">{selectedContact.source_chats?.length || 0}</span>
                    </div>
                  </div>
                </div>

                {contactMessages.length > 0 && (
                  <div className="detail-section">
                    <h4>Последние сообщения</h4>
                    <div className="messages-list">
                      {contactMessages.slice(0, 10).map(msg => (
                        <div key={msg.id} className="message-item">
                          <div className="message-meta">
                            <span>{msg.chat_name}</span>
                            <span>{new Date(msg.message_time).toLocaleString()}</span>
                          </div>
                          <div className="message-text">{msg.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Contacts;
