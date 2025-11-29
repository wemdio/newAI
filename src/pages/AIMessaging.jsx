import React, { useState, useEffect } from 'react';
import axios from 'axios';
import supabase from '../supabaseClient';
import './AIMessaging.css';

// Daily message limit constant
const DAILY_MESSAGE_LIMIT = 5;

const AIMessaging = () => {
  // UI Version 2.3 - With refresh and proxy validation
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // State management
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [hotLeads, setHotLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showConversationDetail, setShowConversationDetail] = useState(false);
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [showEditAccount, setShowEditAccount] = useState(false); // Added for account editing
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null); // Added for account editing
  
  const [uploading, setUploading] = useState(false);
  const [sessionString, setSessionString] = useState('');
  
  // Form states
  const [newAccount, setNewAccount] = useState({
    account_name: '',
    session_file: '',
    api_id: '',
    api_hash: '',
    proxy_url: '',
    phone_number: '',
    daily_limit: 3
  });
  
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    communication_prompt: '',
    hot_lead_criteria: '',
    target_channel_id: ''
  });

  // --- HELPERS ---

  // API base URL
  const getApiUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:3000/api';
    }
    return 'https://wemdio-newai-f239.twc1.net/api';
  };
  
  const apiUrl = getApiUrl();
  
  // Get user ID from Supabase session
  const getUserId = () => {
    if (!session?.user?.id) {
      console.error('No session found!');
      return null;
    }
    return session.user.id;
  };
  
  // Ensure user exists in database before using
  const ensureUserExists = async () => {
    const userId = getUserId();
    if (!userId) throw new Error('No user session');
    
    try {
      await axios.post(`${apiUrl}/auth/create-user`, { user_id: userId });
      console.log('User verified in database:', userId);
      return userId;
    } catch (err) {
      console.error('Failed to ensure user exists:', err);
      return userId;
    }
  };
  
  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);
      const userId = getUserId();
      if (!userId) return;

      const headers = { 'x-user-id': userId };
      
      // Load accounts
      const accountsRes = await axios.get(`${apiUrl}/messaging/accounts`, { headers });
      setAccounts(accountsRes.data.accounts || []);
      
      // Load campaigns
      const campaignsRes = await axios.get(`${apiUrl}/messaging/campaigns`, { headers });
      setCampaigns(campaignsRes.data.campaigns || []);
      
      // Load conversations
      const conversationsRes = await axios.get(`${apiUrl}/messaging/conversations`, { headers });
      setConversations(conversationsRes.data.conversations || []);
      
      // Load hot leads
      const hotLeadsRes = await axios.get(`${apiUrl}/messaging/hot-leads`, { headers });
      setHotLeads(hotLeadsRes.data.hot_leads || []);
      
      // Load stats
      const statsRes = await axios.get(`${apiUrl}/messaging/stats`, { headers });
      setStats(statsRes.data.stats);
      
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- HOOKS ---
  
  // Initialize session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionLoading(false);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Load data when session ready
  useEffect(() => {
    if (!session?.user || sessionLoading) return;
    
    let isMounted = true;
    
    const initializeAndLoad = async () => {
      if (!isMounted) return;
      try {
        await ensureUserExists();
        await loadData();
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };
    
    initializeAndLoad();
    
    // Refresh every 30 seconds for real-time stats
    const interval = setInterval(() => {
      if (isMounted) {
        loadData().catch(err => console.error('Auto-refresh failed:', err));
      }
    }, 30000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [session, sessionLoading]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  // --- HANDLERS ---

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/accounts`, newAccount, {
        headers: { 'x-user-id': userId }
      });
      alert('Аккаунт добавлен!');
      setShowAddAccount(false);
      setNewAccount({ account_name: '', session_file: '', api_id: '', api_hash: '', proxy_url: '', phone_number: '' });
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns`, newCampaign, {
        headers: { 'x-user-id': userId }
      });
      alert('Кампания создана!');
      setShowCreateCampaign(false);
      setNewCampaign({ name: '', communication_prompt: '', hot_lead_criteria: '', target_channel_id: '' });
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleStartCampaign = async (campaignId) => {
    if (!window.confirm('Запустить кампанию?')) return;
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns/${campaignId}/start`, {}, { headers: { 'x-user-id': userId } });
      alert('Кампания запущена!');
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handlePauseCampaign = async (campaignId) => {
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns/${campaignId}/pause`, {}, { headers: { 'x-user-id': userId } });
      alert('Кампания приостановлена');
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleResumeCampaign = async (campaignId) => {
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns/${campaignId}/resume`, {}, { headers: { 'x-user-id': userId } });
      alert('Кампания возобновлена');
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const openEditCampaign = (campaign) => {
    setEditingCampaign({
      id: campaign.id,
      name: campaign.name,
      communication_prompt: campaign.communication_prompt,
      hot_lead_criteria: campaign.hot_lead_criteria,
      target_channel_id: campaign.target_channel_id || ''
    });
    setShowEditCampaign(true);
  };
  
  const handleUpdateCampaign = async (e) => {
    e.preventDefault();
    try {
      const userId = getUserId();
      await axios.put(`${apiUrl}/messaging/campaigns/${editingCampaign.id}`, editingCampaign, { headers: { 'x-user-id': userId } });
      alert('Кампания обновлена!');
      setShowEditCampaign(false);
      setEditingCampaign(null);
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm('Удалить кампанию?')) return;
    try {
      const userId = getUserId();
      await axios.delete(`${apiUrl}/messaging/campaigns/${campaignId}`, { headers: { 'x-user-id': userId } });
      alert('Кампания удалена');
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const viewConversation = async (conversationId) => {
    try {
      const userId = getUserId();
      const res = await axios.get(`${apiUrl}/messaging/conversations/${conversationId}`, { headers: { 'x-user-id': userId } });
      setSelectedConversation(res.data.conversation);
      setShowConversationDetail(true);
    } catch (error) {
      alert('Ошибка загрузки диалога');
    }
  };
  
  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Удалить аккаунт?')) return;
    try {
      const userId = getUserId();
      await axios.delete(`${apiUrl}/messaging/accounts/${accountId}`, { headers: { 'x-user-id': userId } });
      alert('Аккаунт удален');
      loadData();
    } catch (error) {
      alert('Ошибка удаления');
    }
  };

  const openEditAccount = (account) => {
    setEditingAccount({
      id: account.id,
      account_name: account.account_name,
      proxy_url: account.proxy_url || '',
      daily_limit: account.daily_limit || 3
    });
    setShowEditAccount(true);
  };

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    try {
      const userId = getUserId();
      await axios.put(`${apiUrl}/messaging/accounts/${editingAccount.id}`, 
        {
          account_name: editingAccount.account_name,
          proxy_url: editingAccount.proxy_url || null,
          daily_limit: parseInt(editingAccount.daily_limit)
        }, 
        { headers: { 'x-user-id': userId } }
      );
      alert('Аккаунт обновлен!');
      setShowEditAccount(false);
      setEditingAccount(null);
      loadData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  // Merge hot leads from 'hot_leads' table and conversations with 'hot_lead' status
  // This handles legacy hot leads that don't have a record in 'hot_leads' table
  const hotLeadConversationIds = new Set(hotLeads.map(hl => hl.conversation_id));
  const missingHotLeads = conversations.filter(c => c.status === 'hot_lead' && !hotLeadConversationIds.has(c.id));

  const adaptedMissingLeads = missingHotLeads.map(c => ({
      id: `legacy-${c.id}`,
      conversation_id: c.id, // Fix: Add conversation_id for modal lookup
      created_at: c.last_message_at || c.created_at,
      ai_conversations: {
          peer_username: c.peer_username,
          peer_user_id: c.peer_user_id
      },
      messaging_campaigns: c.messaging_campaigns || { name: 'Legacy' },
      conversation_history: c.conversation_history,
      posted_to_channel: true // Assume posted/processed for legacy to avoid "New" badge
  }));

  const allHotLeads = [...hotLeads, ...adaptedMissingLeads].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  // Split conversations into active and completed (older than 48h or stopped)
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const activeConversations = conversations.filter(c => 
    c.status !== 'hot_lead' && 
    c.status !== 'stopped' && 
    new Date(c.last_message_at) > twoDaysAgo
  );

  const completedConversations = conversations.filter(c => 
    c.status !== 'hot_lead' && 
    (c.status === 'stopped' || new Date(c.last_message_at) <= twoDaysAgo)
  );

  if (sessionLoading) {
    return (
      <div className="ai-messaging-loading">
        <div className="spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }
  
  if (!session?.user) {
    return (
      <div className="ai-messaging-loading">
        <p>Сессия не найдена. Пожалуйста, войдите в систему.</p>
      </div>
    );
  }
  
  if (loading && !stats) {
    return (
      <div className="ai-messaging loading">
        <div className="spinner"></div>
        <p>Загрузка данных...</p>
      </div>
    );
  }
  
  return (
    <div className="ai-messaging">
      <div className="page-header">
        <h1>AI Рассылки</h1>
        <p className="subtitle">
          Автоматическое общение с лидами через Telegram с использованием AI
        </p>
      </div>
      
      {/* Stats Overview */}
      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-label">Кампании</div>
              <div className="stat-value">{stats.campaigns.total}</div>
              <div className="stat-detail">{stats.campaigns.running} активных</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-label">Аккаунты</div>
              <div className="stat-value">{stats.accounts.total}</div>
              <div className="stat-detail">{stats.accounts.active} активных</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-label">Диалоги</div>
              <div className="stat-value">{stats.conversations.total}</div>
              <div className="stat-detail">{stats.conversations.active} активных</div>
            </div>
          </div>
          
          <div className="stat-card hot">
            <div className="stat-content">
              <div className="stat-label">Горячие лиды</div>
              <div className="stat-value">{allHotLeads.length}</div>
              <div className="stat-detail">{allHotLeads.filter(l => !l.posted_to_channel).length} новых</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Telegram Accounts Section */}
      <section className="section accounts-section">
        <div className="section-header">
          <h2>Telegram Аккаунты</h2>
          <div className="section-actions">
            <button 
              className={`btn btn-secondary btn-small ${refreshing ? 'refreshing' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? '🔄' : '↻'} Обновить
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddAccount(true)}>
              Добавить аккаунт
            </button>
          </div>
        </div>
        
        {accounts.length === 0 ? (
          <div className="empty-state">
            <p>Нет аккаунтов</p>
            <p className="hint">Добавьте Telegram аккаунты для рассылки</p>
          </div>
        ) : (
          <div className="accounts-grid">
            {accounts.map(account => (
              <div key={account.id} className={`account-card ${account.status}`}>
                <div className="account-header">
                  <h3>{account.account_name}</h3>
<span className={`status-badge ${account.status}`}>
                      {account.status === 'active' ? 'Активен' :
                       account.status === 'paused' ? 'Пауза' :
                       account.status === 'banned' ? 'Забанен' :
                       account.status === 'frozen' ? 'Заморожен' :
                       account.status === 'error' ? 'Ошибка' : 'Неизвестно'}
                    </span>
                </div>
                
                <div className="account-info">
                  <div className="info-row">
                    <span className="label">Прокси:</span>
                    <span className="value">
                      {account.proxy_url ? (
                        <span style={{ color: '#7dd17d' }}>✓ Настроен</span>
                      ) : (
                        <span style={{ color: '#d17d7d' }}>✗ Не указан</span>
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Сообщений сегодня:</span>
                    <span className={`value ${(account.messages_sent_today || 0) >= DAILY_MESSAGE_LIMIT ? 'limit-reached' : ''}`}>
                        {account.messages_sent_today || 0} / {DAILY_MESSAGE_LIMIT}
                      </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Использован:</span>
                    <span className="value">
                      {account.last_used_at ? new Date(account.last_used_at).toLocaleString('ru') : 'Нет'}
                    </span>
                  </div>
                </div>
                
                <div className="account-actions">
                  <button 
                    className="btn btn-small btn-primary" 
                    onClick={() => openEditAccount(account)}
                    style={{ marginRight: '8px' }}
                  >
                    Изменить
                  </button>
                  <button 
                    className="btn btn-small btn-danger" 
                    onClick={() => handleDeleteAccount(account.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      
      {/* Campaigns Section */}
      <section className="section campaigns-section">
        <div className="section-header">
          <h2>Кампании</h2>
          <button className="btn btn-primary" onClick={() => setShowCreateCampaign(true)}>
            Создать кампанию
          </button>
        </div>
        
        {campaigns.length === 0 ? (
          <div className="empty-state">
            <p>Нет кампаний</p>
            <p className="hint">Создайте кампанию для автоматической рассылки</p>
          </div>
        ) : (
          <div className="campaigns-list">
            {campaigns.map(campaign => (
              <div key={campaign.id} className={`campaign-card ${campaign.status}`}>
                <div className="campaign-header">
                  <div>
                    <h3>{campaign.name}</h3>
                    <span className={`status-badge ${campaign.status}`}>
                      {campaign.status === 'running' ? 'Запущена' :
                       campaign.status === 'paused' ? 'Приостановлена' :
                       campaign.status === 'stopped' ? 'Остановлена' : 'Черновик'}
                    </span>
                  </div>
                  <div className="campaign-actions">
                    {campaign.status === 'draft' && (
                      <button 
                        className="btn btn-success" 
                        onClick={() => handleStartCampaign(campaign.id)}
                      >
                        Запустить
                      </button>
                    )}
                    {campaign.status === 'running' && (
                      <button 
                        className="btn btn-warning" 
                        onClick={() => handlePauseCampaign(campaign.id)}
                      >
                        Приостановить
                      </button>
                    )}
                    {campaign.status === 'paused' && (
                      <button 
                        className="btn btn-success" 
                        onClick={() => handleResumeCampaign(campaign.id)}
                      >
                        Возобновить
                      </button>
                    )}
                    <button 
                      className="btn btn-primary" 
                      onClick={() => openEditCampaign(campaign)}
                    >
                      Изменить
                    </button>
                    {(campaign.status === 'draft' || campaign.status === 'paused' || campaign.status === 'stopped') && (
                      <button 
                        className="btn btn-danger" 
                        onClick={() => handleDeleteCampaign(campaign.id)}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="campaign-stats">
                  <div className="stat">
                     <span className="stat-label">Канал:</span>
                     <span className="stat-value">{campaign.target_channel_id || 'Нет'}</span>
                  </div>
                </div>
                
                <details className="campaign-details">
                  <summary>Показать промпты</summary>
                  <div className="prompts">
                    <div className="prompt-block">
                      <strong>Промпт общения:</strong>
                      <pre>{campaign.communication_prompt}</pre>
                    </div>
                    <div className="prompt-block">
                      <strong>Критерии горячего лида:</strong>
                      <pre>{campaign.hot_lead_criteria}</pre>
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
      
      {/* Hot Leads Section */}
      <section className="section hot-leads-section">
        <div className="section-header">
          <h2>Горячие лиды</h2>
          <span className="count-badge hot">{allHotLeads.length}</span>
        </div>
        
        {allHotLeads.length === 0 ? (
          <div className="empty-state">
            <p>Горячих лидов пока нет</p>
          </div>
        ) : (
          <div className="conversations-list scrollable-list">
            {allHotLeads.map(lead => (
              <div key={lead.id} className="conversation-card" style={{ borderLeft: '2px solid #d17d7d' }}>
                <div className="conv-header">
                  <div className="conv-user-info">
                    <strong>@{lead.ai_conversations?.peer_username || lead.ai_conversations?.peer_user_id}</strong>
                    {!lead.posted_to_channel && <span className="badge new">New</span>}
                  </div>
                </div>
                
                <div className="conv-details">
                  <div className="conv-row">
                     <span className="label">Кампания:</span>
                     <span className="value">{lead.messaging_campaigns?.name}</span>
                  </div>
                  <div className="conv-row">
                     <span className="label">Создан:</span>
                     <span className="value date">{new Date(lead.created_at).toLocaleString('ru')}</span>
                  </div>
                </div>
                
                <button 
                  className="btn btn-secondary btn-full" 
                  onClick={() => viewConversation(lead.conversation_id)} // Use conversation_id for modal
                >
                  История
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Conversations Section (Active) */}
      <section className="section conversations-section">
        <div className="section-header">
          <h2>Активные диалоги (48ч)</h2>
          <span className="count-badge">
            {activeConversations.length}
          </span>
        </div>
        
        {activeConversations.length === 0 ? (
          <div className="empty-state">
            <p>Нет активных диалогов</p>
          </div>
        ) : (
          <div className="conversations-list scrollable-list">
            {activeConversations
              .slice(0, 50) // Limit render for performance
              .map(conv => (
              <div key={conv.id} className="conversation-card">
                <div className="conv-header">
                  <div className="conv-user-info">
                    <strong>@{conv.peer_username || conv.peer_user_id}</strong>
                    <span className={`status-badge ${conv.status}`}>
                      {conv.status === 'active' ? 'Активен' :
                       conv.status === 'waiting' ? 'Ожидание' : conv.status}
                    </span>
                  </div>
                </div>
                
                <div className="conv-details">
                  <div className="conv-row">
                     <span className="label">Аккаунт:</span>
                     <span className="value">{conv.telegram_accounts?.account_name || 'N/A'}</span>
                  </div>
                  <div className="conv-row">
                     <span className="label">Сообщений:</span>
                     <span className="value">{conv.messages_count}</span>
                  </div>
                  <div className="conv-row">
                     <span className="label">Последнее:</span>
                     <span className="value date">{new Date(conv.last_message_at).toLocaleString('ru')}</span>
                  </div>
                </div>
                
                <button 
                  className="btn btn-secondary btn-full" 
                  onClick={() => viewConversation(conv.id)}
                >
                  История
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completed Conversations Section */}
      <section className="section conversations-section">
        <div className="section-header">
          <h2>Завершенные / Старые</h2>
          <span className="count-badge">
            {completedConversations.length}
          </span>
        </div>
        
        {completedConversations.length === 0 ? (
          <div className="empty-state">
            <p>Нет завершенных диалогов</p>
          </div>
        ) : (
          <div className="conversations-list scrollable-list">
            {completedConversations
              .slice(0, 20) // Show fewer completed by default
              .map(conv => (
              <div key={conv.id} className="conversation-card" style={{ opacity: 0.7 }}>
                <div className="conv-header">
                  <div className="conv-user-info">
                    <strong>@{conv.peer_username || conv.peer_user_id}</strong>
                    <span className={`status-badge ${conv.status}`}>
                      {conv.status === 'stopped' ? 'Остановлен' : 'Нет ответа'}
                    </span>
                  </div>
                </div>
                
                <div className="conv-details">
                  <div className="conv-row">
                     <span className="label">Аккаунт:</span>
                     <span className="value">{conv.telegram_accounts?.account_name || 'N/A'}</span>
                  </div>
                  <div className="conv-row">
                     <span className="label">Сообщений:</span>
                     <span className="value">{conv.messages_count}</span>
                  </div>
                  <div className="conv-row">
                     <span className="label">Последнее:</span>
                     <span className="value date">{new Date(conv.last_message_at).toLocaleString('ru')}</span>
                  </div>
                </div>
                
                <button 
                  className="btn btn-secondary btn-full" 
                  onClick={() => viewConversation(conv.id)}
                >
                  История
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      
      {/* Add Account Modal */}
      {showAddAccount && (
        <div className="modal-overlay" onClick={() => setShowAddAccount(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить аккаунт</h2>
              <button className="close-btn" onClick={() => setShowAddAccount(false)}>×</button>
            </div>
            
            {/* Session String Form */}
            <form onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionString.trim()) {
                  alert('Введите session string!');
                  return;
                }
                
                setUploading(true);
                try {
                  const userId = getUserId();
                  const accountName = newAccount.account_name || 'Imported Account';
                  const response = await axios.post(
                    `${apiUrl}/messaging/accounts/import-session`,
                    {
                      account_name: accountName,
                      session_string: sessionString.trim(),
                      proxy_url: newAccount.proxy_url || null,
                      daily_limit: newAccount.daily_limit
                    },
                    {
                      headers: {
                        'x-user-id': userId
                      }
                    }
                  );
                  
                  if (response.data.success) {
                    alert('Аккаунт успешно добавлен!');
                    setShowAddAccount(false);
                    setSessionString('');
                    setNewAccount({
                      account_name: '',
                      session_file: '',
                      api_id: '',
                      api_hash: '',
                      proxy_url: '',
                      phone_number: ''
                    });
                    loadData();
                  }
                } catch (error) {
                  console.error('Failed to import session:', error);
                  alert('Ошибка импорта session: ' + (error.response?.data?.error || error.message));
                } finally {
                  setUploading(false);
                }
              }}>
                <div className="help-box">
                  <strong>Session String</strong> - это зашифрованные данные сессии Telegram.<br/>
                  Обычно выдается магазинами аккаунтов как длинная hex-строка.<br/>
                  <br/>
                  <strong>Пример:</strong> 838bbfe1808a243cecf7155620941acc2107...
                </div>
                
                <div className="form-group">
                  <label>Название аккаунта *</label>
                  <input
                    type="text"
                    placeholder="Мой аккаунт"
                    value={newAccount.account_name}
                    onChange={e => setNewAccount({...newAccount, account_name: e.target.value})}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Session String *</label>
                  <textarea
                    placeholder="Вставьте сюда hex-строку session (838bbfe1808a243cecf7...)"
                    value={sessionString}
                    onChange={e => setSessionString(e.target.value)}
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    required
                  />
                  <small>API credentials будут использованы автоматически</small>
                </div>
                
                <div className="form-group">
                  <label>Proxy URL *</label>
                  <input
                    type="text"
                    placeholder="socks5://user:pass@1.2.3.4:1080"
                    value={newAccount.proxy_url}
                    onChange={e => setNewAccount({...newAccount, proxy_url: e.target.value})}
                    required
                  />
                  <small>Обязательно! Формат: protocol://user:pass@host:port (socks5, socks4, http)</small>
                </div>

                <div className="form-group">
                  <label>Дневной лимит сообщений</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newAccount.daily_limit}
                    onChange={e => setNewAccount({...newAccount, daily_limit: parseInt(e.target.value)})}
                    required
                  />
                  <small>По умолчанию: 3. Не ставьте больше 25 для новых аккаунтов.</small>
                </div>
                
                <div className="form-actions">
                  <button type="button" onClick={() => setShowAddAccount(false)}>Отмена</button>
                  <button type="submit" className="primary" disabled={uploading}>
                    {uploading ? 'Импорт...' : 'Импортировать'}
                  </button>
                </div>
              </form>
          </div>
        </div>
      )}
      
      {/* Create Campaign Modal */}
      {showCreateCampaign && (
        <div className="modal-overlay" onClick={() => setShowCreateCampaign(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Создать кампанию</h2>
              <button className="close-btn" onClick={() => setShowCreateCampaign(false)}>×</button>
            </div>
            
            <form onSubmit={handleCreateCampaign}>
              <div className="form-group">
                <label>Название кампании *</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                  placeholder="Например: Весенняя рассылка 2025"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Промпт для общения *</label>
                <textarea
                  rows="6"
                  value={newCampaign.communication_prompt}
                  onChange={e => setNewCampaign({...newCampaign, communication_prompt: e.target.value})}
                  placeholder="Например: Ты менеджер по продажам. Веди диалог естественно, узнай потребности клиента..."
                  required
                />
                <small>Опишите как AI должен вести диалог с лидами</small>
              </div>
              
              <div className="form-group">
                <label>Критерии горячего лида *</label>
                <textarea
                  rows="4"
                  value={newCampaign.hot_lead_criteria}
                  onChange={e => setNewCampaign({...newCampaign, hot_lead_criteria: e.target.value})}
                  placeholder="Например: Лид горячий если он указал бюджет, спросил цены, хочет встречу или демо..."
                  required
                />
                <small>Опишите когда считать лида горячим</small>
              </div>
              
              <div className="form-group">
                <label>Telegram канал для уведомлений (опционально)</label>
                <input
                  type="text"
                  value={newCampaign.target_channel_id}
                  onChange={e => setNewCampaign({...newCampaign, target_channel_id: e.target.value})}
                  placeholder="-100123456789"
                />
                <small>ID канала куда постить горячие лиды</small>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateCampaign(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Edit Campaign Modal */}
      {showEditCampaign && editingCampaign && (
        <div className="modal-overlay" onClick={() => setShowEditCampaign(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Редактировать кампанию</h2>
              <button className="close-btn" onClick={() => setShowEditCampaign(false)}>×</button>
            </div>
            
            <form onSubmit={handleUpdateCampaign}>
              <div className="form-group">
                <label>Название кампании *</label>
                <input
                  type="text"
                  value={editingCampaign.name}
                  onChange={e => setEditingCampaign({...editingCampaign, name: e.target.value})}
                  placeholder="Например: Весенняя рассылка 2025"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Промпт для общения *</label>
                <textarea
                  rows="6"
                  value={editingCampaign.communication_prompt}
                  onChange={e => setEditingCampaign({...editingCampaign, communication_prompt: e.target.value})}
                  placeholder="Например: Ты менеджер по продажам. Веди диалог естественно..."
                  required
                />
                <small>Изменения применятся к новым диалогам</small>
              </div>
              
              <div className="form-group">
                <label>Критерии горячего лида *</label>
                <textarea
                  rows="4"
                  value={editingCampaign.hot_lead_criteria}
                  onChange={e => setEditingCampaign({...editingCampaign, hot_lead_criteria: e.target.value})}
                  placeholder="Например: Лид горячий если он указал бюджет, спросил цены..."
                  required
                />
                <small>Изменения применятся к новым сообщениям</small>
              </div>
              
              <div className="form-group">
                <label>Telegram канал для уведомлений (опционально)</label>
                <input
                  type="text"
                  value={editingCampaign.target_channel_id}
                  onChange={e => setEditingCampaign({...editingCampaign, target_channel_id: e.target.value})}
                  placeholder="-100123456789"
                />
                <small>ID канала куда постить горячие лиды</small>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditCampaign(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditAccount && editingAccount && (
        <div className="modal-overlay" onClick={() => setShowEditAccount(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Редактировать аккаунт</h2>
              <button className="close-btn" onClick={() => setShowEditAccount(false)}>×</button>
            </div>
            
            <form onSubmit={handleUpdateAccount}>
              <div className="form-group">
                <label>Название аккаунта</label>
                <input
                  type="text"
                  value={editingAccount.account_name}
                  onChange={e => setEditingAccount({...editingAccount, account_name: e.target.value})}
                  placeholder="Мой аккаунт"
                  required
                />
              </div>

              <div className="form-group">
                <label>Proxy URL</label>
                <input
                  type="text"
                  value={editingAccount.proxy_url}
                  onChange={e => setEditingAccount({...editingAccount, proxy_url: e.target.value})}
                  placeholder="http://user:pass@ip:port"
                />
                <small>Оставьте пустым, если не используете прокси</small>
              </div>

              <div className="form-group">
                <label>Дневной лимит сообщений</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={editingAccount.daily_limit}
                  onChange={e => setEditingAccount({...editingAccount, daily_limit: e.target.value})}
                  required
                />
                <small>Лимит сообщений в сутки (по умолчанию 3)</small>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditAccount(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Conversation Detail Modal */}
      {showConversationDetail && selectedConversation && (
        <div className="modal-overlay" onClick={() => setShowConversationDetail(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Диалог с @{selectedConversation.peer_username}</h2>
              <button className="close-btn" onClick={() => setShowConversationDetail(false)}>×</button>
            </div>
            
            <div className="conversation-detail">
              <div className="conv-meta-grid">
                <div className="meta-item">
                  <span className="label">Статус:</span>
                  <span className={`status-badge ${selectedConversation.status}`}>
                      {selectedConversation.status === 'active' ? 'Активен' :
                       selectedConversation.status === 'hot_lead' ? 'Горячий' :
                       selectedConversation.status === 'waiting' ? 'Ожидание' : 'Остановлен'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="label">Сообщений:</span>
                  <span className="value">{selectedConversation.messages_count}</span>
                </div>
                <div className="meta-item">
                  <span className="label">Аккаунт:</span>
                  <span className="value">{selectedConversation.telegram_accounts?.account_name}</span>
                </div>
                <div className="meta-item">
                  <span className="label">Начало:</span>
                  <span className="value">{new Date(selectedConversation.created_at).toLocaleString('ru')}</span>
                </div>
              </div>
              
              <div className="history-messages">
                {(selectedConversation.conversation_history || []).map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    <div className="message-header">
                      <span className="message-role">
                        {msg.role === 'user' ? 'Лид' : 'AI'}
                      </span>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleString('ru')}
                      </span>
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIMessaging;