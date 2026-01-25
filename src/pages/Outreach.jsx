import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './Outreach.css';

const Outreach = () => {
  const [activeTab, setActiveTab] = useState('campaigns');
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [chats, setChats] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // Selected items
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  // Modals
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTargetsModal, setShowTargetsModal] = useState(false);

  // Forms
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    message_template: '',
    auto_reply_enabled: true,
    ai_prompt: '',
    ai_model: 'google/gemini-2.0-flash-001',
    message_delay_min: 60,
    message_delay_max: 180,
    daily_limit: 20,
    account_ids: []
  });

  const [accountForm, setAccountForm] = useState({
    phone_number: '',
    api_id: '',
    api_hash: '',
    session_string: '',
    proxy_url: ''
  });

  const [importFiles, setImportFiles] = useState([]);
  const [defaultProxy, setDefaultProxy] = useState('');
  const [targetText, setTargetText] = useState('');

  // Fetch data based on active tab
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'campaigns' || activeTab === 'accounts') {
        const [accRes, campRes, statsRes] = await Promise.all([
          api.get('/outreach/accounts'),
          api.get('/outreach/campaigns'),
          api.get('/outreach/stats')
        ]);
        setAccounts(Array.isArray(accRes.data) ? accRes.data : []);
        setCampaigns(Array.isArray(campRes.data) ? campRes.data : []);
        setStats(statsRes.data);
      } else if (activeTab === 'chats') {
        const res = await api.get('/outreach/chats');
        setChats(Array.isArray(res.data) ? res.data : []);
      } else if (activeTab === 'logs') {
        const res = await api.get('/outreach/logs?limit=200');
        setLogs(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh for active campaigns
  useEffect(() => {
    if (activeTab === 'campaigns') {
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchData]);

  // ============ CAMPAIGN HANDLERS ============

  const handleSaveCampaign = async (e) => {
    e.preventDefault();
    try {
      if (selectedCampaign) {
        await api.patch(`/outreach/campaigns/${selectedCampaign.id}`, campaignForm);
      } else {
        await api.post('/outreach/campaigns', campaignForm);
      }
      setShowCampaignModal(false);
      resetCampaignForm();
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEditCampaign = (campaign) => {
    setSelectedCampaign(campaign);
    setCampaignForm({
      name: campaign.name || '',
      message_template: campaign.message_template || '',
      auto_reply_enabled: campaign.auto_reply_enabled ?? true,
      ai_prompt: campaign.ai_prompt || '',
      ai_model: campaign.ai_model || 'google/gemini-2.0-flash-001',
      message_delay_min: campaign.message_delay_min || 60,
      message_delay_max: campaign.message_delay_max || 180,
      daily_limit: campaign.daily_limit || 20,
      account_ids: campaign.account_ids || []
    });
    setShowCampaignModal(true);
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('Удалить эту кампанию?')) return;
    try {
      await api.delete(`/outreach/campaigns/${id}`);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleStartCampaign = async (id) => {
    try {
      await api.post(`/outreach/campaigns/${id}/start`);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleStopCampaign = async (id) => {
    try {
      await api.post(`/outreach/campaigns/${id}/stop`);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const resetCampaignForm = () => {
    setSelectedCampaign(null);
    setCampaignForm({
      name: '',
      message_template: '',
      auto_reply_enabled: true,
      ai_prompt: '',
      ai_model: 'google/gemini-2.0-flash-001',
      message_delay_min: 60,
      message_delay_max: 180,
      daily_limit: 20,
      account_ids: []
    });
  };

  // ============ TARGETS HANDLERS ============

  const handleOpenTargets = (campaign) => {
    setSelectedCampaign(campaign);
    setTargetText('');
    setShowTargetsModal(true);
  };

  const handleUploadTargets = async () => {
    if (!selectedCampaign || !targetText.trim()) return;

    const lines = targetText.split('\n').map(l => l.trim()).filter(l => l);
    const targets = lines.map(l => {
      if (l.startsWith('@') || !l.includes('+')) {
        return { username: l.replace('@', '') };
      }
      return { phone: l };
    });

    try {
      const res = await api.post(`/outreach/campaigns/${selectedCampaign.id}/targets`, { targets });
      alert(`Добавлено ${res.data.count} целей`);
      setTargetText('');
      setShowTargetsModal(false);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  // ============ ACCOUNT HANDLERS ============

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    try {
      await api.post('/outreach/accounts', accountForm);
      setShowAccountModal(false);
      setAccountForm({ phone_number: '', api_id: '', api_hash: '', session_string: '', proxy_url: '' });
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Удалить этот аккаунт?')) return;
    try {
      await api.delete(`/outreach/accounts/${id}`);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (importFiles.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < importFiles.length; i++) {
        formData.append('files', importFiles[i]);
    }
    formData.append('default_proxy', defaultProxy);

    try {
      setLoading(true);
      const res = await api.post('/outreach/accounts/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(res.data.message);
      setShowImportModal(false);
      setImportFiles([]);
      setDefaultProxy('');
      fetchData();
    } catch (error) {
      alert('Ошибка импорта: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const toggleAccountInCampaign = (accountId) => {
    setCampaignForm(prev => {
      const ids = prev.account_ids || [];
      if (ids.includes(accountId)) {
        return { ...prev, account_ids: ids.filter(id => id !== accountId) };
      } else {
        return { ...prev, account_ids: [...ids, accountId] };
      }
    });
  };

  // ============ CHAT HANDLERS ============

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    try {
      const res = await api.get(`/outreach/chats/${chat.id}/messages`);
      setChatMessages(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleChatModeToggle = async (chatId, currentStatus) => {
    const newStatus = currentStatus === 'manual' ? 'active' : 'manual';
    try {
      await api.patch(`/outreach/chats/${chatId}`, { status: newStatus });
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  // ============ RENDER HELPERS ============

  const getStatusBadge = (status) => {
    const colors = {
      draft: '#666',
      active: '#7dd17d',
      paused: '#f0ad4e',
      completed: '#5bc0de',
      pending: '#888',
      sent: '#5bc0de',
      replied: '#7dd17d',
      failed: '#d9534f',
      manual: '#f0ad4e'
    };
    return (
      <span className="status-badge" style={{ background: colors[status] || '#666' }}>
        {status}
      </span>
    );
  };

  // ============ RENDER ============

  return (
    <div className="outreach-page">
      <div className="page-header">
        <h1>Аутрич</h1>
        <p className="subtitle">Автоматическая рассылка и AI-ответы в Telegram</p>
      </div>

      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-label">Аккаунты</div>
              <div className="stat-value">{stats.accounts?.active || 0}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-label">Кампании</div>
              <div className="stat-value">{stats.campaigns?.active || 0}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-label">Отправлено</div>
              <div className="stat-value">{stats.campaigns?.totalSent || 0}</div>
            </div>
          </div>
          <div className="stat-card hot">
            <div className="stat-content">
              <div className="stat-label">Ответов</div>
              <div className="stat-value">{stats.campaigns?.totalReplied || 0}</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="outreach-tabs">
        {['campaigns', 'accounts', 'chats', 'logs'].map(tab => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'campaigns' && 'Кампании'}
            {tab === 'accounts' && 'Аккаунты'}
            {tab === 'chats' && 'Чаты'}
            {tab === 'logs' && 'Логи'}
            {tab === 'chats' && stats?.chats?.unread > 0 && (
              <span className="unread-badge">{stats.chats.unread}</span>
            )}
          </button>
        ))}
      </div>

      <main className="tab-content">
        {/* ============ CAMPAIGNS TAB ============ */}
        {activeTab === 'campaigns' && (
          <section className="campaigns-section">
            <div className="section-header">
              <h2>Кампании рассылки</h2>
              <button 
                className="btn btn-primary"
                onClick={() => { resetCampaignForm(); setShowCampaignModal(true); }}
              >
                Новая кампания
                </button>
            </div>
            
            {loading ? (
              <div className="loading-spinner"></div>
            ) : campaigns.length === 0 ? (
              <div className="empty-state">
                <h3>Нет кампаний</h3>
                <p>Создайте первую кампанию для начала рассылки</p>
              </div>
            ) : (
              <div className="campaigns-grid">
                {campaigns.map(camp => (
                  <div key={camp.id} className={`campaign-card ${camp.status}`}>
                    <div className="campaign-header">
                      <h3>{camp.name}</h3>
                      {getStatusBadge(camp.status)}
                    </div>

                    <div className="campaign-stats">
                      <div className="mini-stat">
                        <span className="mini-value">{camp.messages_sent || 0}</span>
                        <span className="mini-label">Отправлено</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-value">{camp.messages_replied || 0}</span>
                        <span className="mini-label">Ответов</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-value">{camp.account_ids?.length || 0}</span>
                        <span className="mini-label">Аккаунтов</span>
                      </div>
                    </div>

                    <div className="campaign-message">
                      <p>{camp.message_template?.substring(0, 100)}...</p>
                    </div>

                    <div className="campaign-settings-preview">
                      {camp.auto_reply_enabled && (
                        <span className="setting-tag ai">AI-ответы</span>
                      )}
                      <span className="setting-tag">
                        {camp.message_delay_min}-{camp.message_delay_max}с
                      </span>
                      <span className="setting-tag">
                        {camp.daily_limit}/день
                      </span>
                    </div>

                    <div className="campaign-actions">
                      {camp.status === 'active' ? (
                        <button 
                          className="btn btn-warning"
                          onClick={() => handleStopCampaign(camp.id)}
                        >
                          Стоп
                        </button>
                      ) : (
                        <button 
                          className="btn btn-success"
                          onClick={() => handleStartCampaign(camp.id)}
                        >
                          Запустить
                        </button>
                      )}
                      <button 
                        className="btn btn-secondary"
                        onClick={() => handleOpenTargets(camp)}
                      >
                        Цели
                      </button>
                      <button 
                        className="btn btn-secondary"
                        onClick={() => handleEditCampaign(camp)}
                      >
                        Изменить
                      </button>
                      <button 
                        className="btn btn-danger"
                        onClick={() => handleDeleteCampaign(camp.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============ ACCOUNTS TAB ============ */}
        {activeTab === 'accounts' && (
          <section className="accounts-section">
            <div className="section-header">
              <h2>Telegram аккаунты</h2>
              <div className="header-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowImportModal(true)}
                >
                  Импорт ZIP
                </button>
                        <button 
                  className="btn btn-primary"
                  onClick={() => setShowAccountModal(true)}
                        >
                  Добавить
                        </button>
                    </div>
            </div>

            {loading ? (
              <div className="loading-spinner"></div>
            ) : accounts.length === 0 ? (
              <div className="empty-state">
                <h3>Нет аккаунтов</h3>
                <p>Добавьте Telegram аккаунты для рассылки</p>
              </div>
            ) : (
              <div className="accounts-grid">
                {accounts.map(acc => (
                  <div key={acc.id} className={`account-card ${acc.status}`}>
                    <div className="account-header">
                      <h3>{acc.phone_number}</h3>
                      {getStatusBadge(acc.status)}
                    </div>
                    <div className="account-details">
                    {acc.proxy_url && (
                        <p className="proxy-info">
                          {acc.proxy_url.split('@')[1] || acc.proxy_url.substring(0, 30)}...
                        </p>
                      )}
                      {acc.last_active_at && (
                        <p className="last-active">
                          {new Date(acc.last_active_at).toLocaleString()}
                        </p>
                    )}
                    </div>
                    <div className="account-actions">
                      <button 
                        className="btn btn-danger btn-small"
                        onClick={() => handleDeleteAccount(acc.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============ CHATS TAB ============ */}
        {activeTab === 'chats' && (
          <section className="chats-section">
            <div className="chats-layout">
              <div className="chats-list">
                <div className="section-header">
                  <h2>Диалоги</h2>
                  <button className="btn btn-secondary btn-small" onClick={fetchData}>
                    Обновить
                  </button>
                </div>
                
                {chats.length === 0 ? (
                  <div className="empty-state small">
                    <p>Нет активных диалогов</p>
                  </div>
                ) : (
                  <div className="chats-items">
                    {chats.map(chat => (
                      <div 
                        key={chat.id}
                        className={`chat-item ${selectedChat?.id === chat.id ? 'selected' : ''} ${chat.unread_count > 0 ? 'unread' : ''}`}
                        onClick={() => handleSelectChat(chat)}
                      >
                        <div className="chat-avatar">
                          {chat.target_name?.charAt(0) || chat.target_username?.charAt(0) || '?'}
                        </div>
                        <div className="chat-info">
                          <div className="chat-name">
                            {chat.target_name || `@${chat.target_username}`}
                            {chat.unread_count > 0 && (
                              <span className="unread-count">{chat.unread_count}</span>
                            )}
                          </div>
                          <div className="chat-meta">
                            <span className="chat-account">{chat.account?.phone_number}</span>
                            {getStatusBadge(chat.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="chat-view">
                {selectedChat ? (
                  <>
                    <div className="chat-header">
                      <div className="chat-title">
                        <h3>{selectedChat.target_name || `@${selectedChat.target_username}`}</h3>
                        <span className="chat-campaign">{selectedChat.campaign?.name}</span>
                      </div>
                      <div className="chat-controls">
                        <button 
                          className={`btn btn-small ${selectedChat.status === 'manual' ? 'btn-success' : 'btn-warning'}`}
                          onClick={() => handleChatModeToggle(selectedChat.id, selectedChat.status)}
                        >
                          {selectedChat.status === 'manual' ? 'Вкл. AI' : 'Ручной режим'}
                        </button>
                      </div>
                    </div>
                    <div className="messages-container">
                      {chatMessages.map(msg => (
                        <div key={msg.id} className={`message ${msg.sender}`}>
                          <div className="message-content">{msg.content}</div>
                          <div className="message-time">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>Выберите диалог</h3>
                    <p>Кликните на диалог слева для просмотра сообщений</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============ LOGS TAB ============ */}
        {activeTab === 'logs' && (
          <section className="logs-section">
            <div className="section-header">
              <h2>Логи воркера</h2>
              <button className="btn btn-secondary" onClick={fetchData}>
                Обновить
              </button>
            </div>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p className="no-logs">Логи пусты</p>
              ) : (
                logs.map(log => (
                  <div key={log.id} className={`log-entry ${log.level.toLowerCase()}`}>
                    <span className="log-time">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    <span className={`log-level ${log.level.toLowerCase()}`}>
                      [{log.level}]
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      {/* ============ CAMPAIGN MODAL ============ */}
      {showCampaignModal && (
        <div className="modal-overlay" onClick={() => setShowCampaignModal(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedCampaign ? 'Редактировать кампанию' : 'Новая кампания'}</h2>
              <button className="modal-close" onClick={() => setShowCampaignModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveCampaign} className="campaign-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Название кампании</label>
                  <input
                    type="text"
                    value={campaignForm.name}
                    onChange={e => setCampaignForm({...campaignForm, name: e.target.value})}
                    placeholder="Например: Продажа курса"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>AI Модель</label>
                  <select
                    value={campaignForm.ai_model}
                    onChange={e => setCampaignForm({...campaignForm, ai_model: e.target.value})}
                  >
                    <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                    <option value="google/gemini-2.5-pro-preview">Gemini 2.5 Pro</option>
                    <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Первое сообщение (шаблон)</label>
                <textarea
                  value={campaignForm.message_template}
                  onChange={e => setCampaignForm({...campaignForm, message_template: e.target.value})}
                  placeholder="Привет! Меня зовут [Имя], я хотел бы поговорить о..."
                  rows={4}
                  required
                />
            </div>
              
              <div className="form-group">
                <label className="checkbox-label">
                <input 
                    type="checkbox" 
                    checked={campaignForm.auto_reply_enabled}
                    onChange={e => setCampaignForm({...campaignForm, auto_reply_enabled: e.target.checked})}
                />
                  <span>Включить AI авто-ответы</span>
                </label>
              </div>

              {campaignForm.auto_reply_enabled && (
                <div className="form-group">
                  <label>AI Промпт (инструкции для AI)</label>
                      <textarea 
                    value={campaignForm.ai_prompt}
                    onChange={e => setCampaignForm({...campaignForm, ai_prompt: e.target.value})}
                    placeholder="Ты менеджер по продажам. Твоя задача - выявить интерес к продукту и назначить звонок. Будь дружелюбным и не навязчивым..."
                    rows={4}
                  />
                </div>
              )}

              <div className="form-row three-col">
                <div className="form-group">
                  <label>Мин. задержка (сек)</label>
                  <input
                    type="number"
                    value={campaignForm.message_delay_min}
                    onChange={e => setCampaignForm({...campaignForm, message_delay_min: parseInt(e.target.value)})}
                    min={30}
                  />
                </div>
                <div className="form-group">
                  <label>Макс. задержка (сек)</label>
                  <input
                    type="number"
                    value={campaignForm.message_delay_max}
                    onChange={e => setCampaignForm({...campaignForm, message_delay_max: parseInt(e.target.value)})}
                    min={60}
                  />
                </div>
                <div className="form-group">
                  <label>Лимит в день</label>
                  <input
                    type="number"
                    value={campaignForm.daily_limit}
                    onChange={e => setCampaignForm({...campaignForm, daily_limit: parseInt(e.target.value)})}
                    min={1}
                    max={100}
                  />
                    </div>
                  </div>

              <div className="form-group">
                <label>Выберите аккаунты для рассылки</label>
                <div className="accounts-selector">
                  {accounts.length === 0 ? (
                    <p className="no-accounts">Сначала добавьте аккаунты</p>
                  ) : (
                    accounts.map(acc => (
                      <label key={acc.id} className="account-checkbox">
                        <input
                          type="checkbox"
                          checked={campaignForm.account_ids?.includes(acc.id)}
                          onChange={() => toggleAccountInCampaign(acc.id)}
                        />
                        <span className="account-label">
                          {acc.phone_number}
                          <small>{acc.status}</small>
                        </span>
                      </label>
                ))
              )}
            </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCampaignModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  {selectedCampaign ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ ACCOUNT MODAL ============ */}
      {showAccountModal && (
        <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить аккаунт</h2>
              <button className="modal-close" onClick={() => setShowAccountModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveAccount}>
              <div className="form-group">
                <label>Телефон</label>
                <input
                  type="text"
                  value={accountForm.phone_number}
                  onChange={e => setAccountForm({...accountForm, phone_number: e.target.value})}
                  placeholder="+79001234567"
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>API ID</label>
                  <input
                    type="text"
                    value={accountForm.api_id}
                    onChange={e => setAccountForm({...accountForm, api_id: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>API Hash</label>
                  <input
                    type="text"
                    value={accountForm.api_hash}
                    onChange={e => setAccountForm({...accountForm, api_hash: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Session String</label>
                <textarea
                  value={accountForm.session_string}
                  onChange={e => setAccountForm({...accountForm, session_string: e.target.value})}
                  placeholder="Telethon session string..."
                  rows={3}
                  required
                />
              </div>
              <div className="form-group">
                <label>Proxy URL</label>
                <input
                  type="text"
                  value={accountForm.proxy_url}
                  onChange={e => setAccountForm({...accountForm, proxy_url: e.target.value})}
                  placeholder="socks5://user:pass@host:port"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAccountModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Добавить
                </button>
            </div>
            </form>
                    </div>
            </div>
        )}

      {/* ============ IMPORT MODAL ============ */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Импорт аккаунтов из ZIP</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            <form onSubmit={handleImport}>
              <p className="modal-description">
                Загрузите ZIP файл(ы) с парами .session и .json файлов
              </p>
              <div className="form-group">
                <label>ZIP файл(ы)</label>
                <input 
                  type="file" 
                  accept=".zip" 
                  multiple
                  onChange={e => setImportFiles(e.target.files)} 
                  required 
                />
                {importFiles.length > 0 && (
                  <small>{importFiles.length} файл(ов) выбрано</small>
                )}
              </div>
              <div className="form-group">
                <label>Proxy по умолчанию (опционально)</label>
                <input 
                  type="text" 
                  value={defaultProxy} 
                  onChange={e => setDefaultProxy(e.target.value)} 
                  placeholder="socks5://user:pass@host:port"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Загрузка...' : 'Импортировать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ TARGETS MODAL ============ */}
      {showTargetsModal && selectedCampaign && (
        <div className="modal-overlay" onClick={() => setShowTargetsModal(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🎯 Цели для: {selectedCampaign.name}</h2>
              <button className="modal-close" onClick={() => setShowTargetsModal(false)}>×</button>
            </div>
            <div className="targets-content">
              <div className="form-group">
                <label>Добавить юзернеймы (по одному на строку)</label>
                <textarea
                  value={targetText}
                  onChange={e => setTargetText(e.target.value)}
                  placeholder="@username1
@username2
@username3
или номера телефонов:
+79001234567"
                  rows={10}
                />
              </div>
              <div className="targets-stats">
                <p>
                  Строк введено: <strong>{targetText.split('\n').filter(l => l.trim()).length}</strong>
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTargetsModal(false)}>
                  Закрыть
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleUploadTargets}
                  disabled={!targetText.trim()}
                >
                  Добавить цели
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Outreach;