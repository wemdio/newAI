import React, { useState, useEffect } from 'react';
import { leadsApi } from '../services/api';
import './Leads.css';

function Leads() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    minConfidence: 0,
    limit: 50,
    status: 'all'
  });
  const [selectedLeads, setSelectedLeads] = useState(new Set());

  useEffect(() => {
    // Debounce: wait 500ms after filter change before loading
    const timer = setTimeout(() => {
      loadLeads();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [filters]);

  const loadLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        limit: filters.limit,
        min_confidence: filters.minConfidence
      };
      if (filters.status !== 'all') {
        params.lead_status = filters.status;
      }
      const response = await leadsApi.getAll(params);
      setLeads(response.data.leads || []);
      setSelectedLeads(new Set()); // Clear selection on reload
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось загрузить лиды');
      console.error('Leads error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (leadId, status) => {
    try {
      await leadsApi.update(leadId, { lead_status: status });
      setLeads(leads.map(lead => 
        lead.id === leadId ? { ...lead, lead_status: status } : lead
      ));
    } catch (err) {
      alert('Не удалось обновить статус лида');
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!confirm('Удалить этот лид?')) return;
    
    try {
      await leadsApi.delete(leadId);
      setLeads(leads.filter(lead => lead.id !== leadId));
    } catch (err) {
      alert('Не удалось удалить лид');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedLeads.size === 0) {
      alert('Нет выбранных лидов');
      return;
    }
    
    if (!confirm(`Удалить ${selectedLeads.size} выбранных лидов?`)) return;
    
    try {
      await leadsApi.deleteBulk(Array.from(selectedLeads));
      setLeads(leads.filter(lead => !selectedLeads.has(lead.id)));
      setSelectedLeads(new Set());
    } catch (err) {
      alert('Не удалось удалить выбранные лиды');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Удалить ВСЕ лиды? Это действие необратимо!')) return;
    
    try {
      await leadsApi.deleteAll();
      setLeads([]);
      setSelectedLeads(new Set());
    } catch (err) {
      alert('Не удалось удалить все лиды');
    }
  };

  const toggleSelectLead = (leadId) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  const copyAllUsernames = async () => {
    // Extract usernames from leads, filter out empty/null values
    const usernames = leads
      .map(lead => lead.messages?.username || lead.username)
      .filter(username => username && username.trim() !== '')
      .map(username => username.startsWith('@') ? username : `@${username}`);
    
    if (usernames.length === 0) {
      alert('Нет юзернеймов для копирования');
      return;
    }
    
    // Remove duplicates
    const uniqueUsernames = [...new Set(usernames)];
    const text = uniqueUsernames.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      alert(`Скопировано ${uniqueUsernames.length} юзернеймов в буфер обмена`);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert(`Скопировано ${uniqueUsernames.length} юзернеймов в буфер обмена`);
    }
  };

  const getConfidenceColor = (score) => {
    if (score >= 80) return '#7dd17d';
    if (score >= 60) return '#f59e0b';
    return '#d17d7d';
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'sale': return '#7dd17d';
      case 'not_lead': return '#d17d7d';
      default: return '#888';
    }
  };

  if (loading) {
    return <div className="loading">Загрузка лидов...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Ошибка</h2>
        <p>{error}</p>
        <button onClick={loadLeads} className="btn-primary">Повторить</button>
      </div>
    );
  }

  return (
    <div className="leads">
      <div className="leads-header">
        <h2>Обнаруженные лиды</h2>
        <div className="header-actions">
          <button onClick={loadLeads} className="btn-refresh">
            Обновить
          </button>
          <button onClick={copyAllUsernames} className="btn-copy-usernames">
            📋 Копировать юзернеймы
          </button>
          {selectedLeads.size > 0 && (
            <button onClick={handleDeleteSelected} className="btn-delete">
              Удалить выбранные ({selectedLeads.size})
            </button>
          )}
          {leads.length > 0 && (
            <button onClick={handleDeleteAll} className="btn-delete-all">
              Удалить все
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Статус:</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="filter-select"
          >
            <option value="all">Все</option>
            <option value="lead">Лид</option>
            <option value="not_lead">Не лид</option>
            <option value="sale">Продажа</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Мин. уверенность:</label>
          <select
            value={filters.minConfidence}
            onChange={(e) => setFilters({ ...filters, minConfidence: Number(e.target.value) })}
            className="filter-select"
          >
            <option value={0}>Все (0%+)</option>
            <option value={50}>Средняя (50%+)</option>
            <option value={70}>Высокая (70%+)</option>
            <option value={90}>Очень высокая (90%+)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Лимит:</label>
          <select
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}
            className="filter-select"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {leads.length > 0 && (
          <div className="filter-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={selectedLeads.size === leads.length}
                onChange={toggleSelectAll}
              />
              Выбрать все
            </label>
          </div>
        )}
      </div>

      {/* Leads List */}
      {leads.length === 0 ? (
        <div className="no-data">
          <h3>Лиды не найдены</h3>
          <p>Настройте критерии определения лидов и запустите сканер</p>
        </div>
      ) : (
        <div className="leads-list">
          {leads.map((lead) => (
            <div key={lead.id} className={`lead-card ${selectedLeads.has(lead.id) ? 'selected' : ''}`}>
              <div className="lead-header">
                <div className="lead-header-left">
                  <input
                    type="checkbox"
                    checked={selectedLeads.has(lead.id)}
                    onChange={() => toggleSelectLead(lead.id)}
                    className="lead-checkbox"
                  />
                <div className="confidence-badge" style={{ backgroundColor: getConfidenceColor(lead.confidence_score) }}>
                  {lead.confidence_score}%
                  </div>
                  {lead.lead_status && lead.lead_status !== 'lead' && (
                    <div className="status-badge" style={{ borderColor: getStatusColor(lead.lead_status) }}>
                      {lead.lead_status === 'sale' ? 'Продажа' : 'Не лид'}
                    </div>
                  )}
                </div>
                <div className="lead-meta">
                  {new Date(lead.detected_at).toLocaleString()}
                </div>
              </div>

              <div className="lead-content">
                <div className="lead-message">
                  <strong>Сообщение:</strong>
                  <p>{lead.messages?.message || 'Нет данных'}</p>
                </div>

                <div className="lead-reasoning">
                  <strong>Почему это лид:</strong>
                  <p>{lead.reasoning}</p>
                </div>

                {lead.matched_criteria && lead.matched_criteria.length > 0 && (
                  <div className="matched-criteria">
                    <strong>Совпавшие критерии:</strong>
                    <div className="criteria-tags">
                      {lead.matched_criteria.map((criterion, idx) => (
                        <span key={idx} className="criterion-tag">{criterion}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="lead-actions">
                  <button
                  onClick={() => handleUpdateStatus(lead.id, 'lead')}
                  className={`btn-status ${lead.lead_status === 'lead' ? 'active' : ''}`}
                  disabled={lead.lead_status === 'lead'}
                  >
                  Лид
                  </button>
                <button
                  onClick={() => handleUpdateStatus(lead.id, 'not_lead')}
                  className={`btn-status ${lead.lead_status === 'not_lead' ? 'active' : ''}`}
                  disabled={lead.lead_status === 'not_lead'}
                >
                  Не лид
                </button>
                    <button
                  onClick={() => handleUpdateStatus(lead.id, 'sale')}
                  className={`btn-status ${lead.lead_status === 'sale' ? 'active' : ''}`}
                  disabled={lead.lead_status === 'sale'}
                  >
                  Продажа
                    </button>
                    <button
                  onClick={() => handleDeleteLead(lead.id)}
                  className="btn-delete-single"
                    >
                  Удалить
                    </button>
                  </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Leads;
