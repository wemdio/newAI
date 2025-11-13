import React, { useState, useEffect } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import './AIMessaging.css';

const AIMessaging = () => {
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
  const [selectedConversation, setSelectedConversation] = useState(null);
  
  // Account upload method: 'manual' or 'tdata'
  const [accountUploadMethod, setAccountUploadMethod] = useState('tdata');
  const [tdataFile, setTdataFile] = useState(null);
  const [tdataUploadType, setTdataUploadType] = useState('folder'); // 'folder' or 'zip'
  const [uploading, setUploading] = useState(false);
  
  // Form states
  const [newAccount, setNewAccount] = useState({
    account_name: '',
    session_file: '',
    api_id: '',
    api_hash: '',
    proxy_url: '',
    phone_number: ''
  });
  
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    communication_prompt: '',
    hot_lead_criteria: '',
    target_channel_id: ''
  });
  
  // API base URL
  const getApiUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:3000/api';
    }
    return 'https://wemdio-newai-4f37.twc1.net/api';
  };
  
  const apiUrl = getApiUrl();
  
  // Get user ID from session
  const getUserId = () => {
    // In production, get from session/auth
    return '00000000-0000-0000-0000-000000000001';
  };
  
  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);
      const userId = getUserId();
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
      alert('Ошибка загрузки данных. Проверьте консоль.');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Create account (manual)
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/accounts`, newAccount, {
        headers: { 'x-user-id': userId }
      });
      
      alert('Аккаунт добавлен!');
      setShowAddAccount(false);
      setNewAccount({
        account_name: '',
        session_file: '',
        api_id: '',
        api_hash: '',
        proxy_url: '',
        phone_number: ''
      });
      loadData();
    } catch (error) {
      console.error('Failed to create account:', error);
      alert('Ошибка создания аккаунта: ' + error.response?.data?.error || error.message);
    }
  };
  
  // Convert folder FileList to ZIP blob
  const convertFolderToZip = async (files) => {
    const zip = new JSZip();
    const tdataFolder = zip.folder('tdata');
    
    // Add all files to zip maintaining structure
    for (const file of files) {
      // Get relative path from webkitRelativePath
      const relativePath = file.webkitRelativePath || file.name;
      // Remove the first folder name (usually the selected folder name)
      const pathParts = relativePath.split('/');
      const zipPath = pathParts.slice(1).join('/');
      
      if (zipPath) {
        tdataFolder.file(zipPath, file);
      }
    }
    
    // Generate zip blob
    return await zip.generateAsync({ type: 'blob' });
  };
  
  // Handle folder selection
  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) {
      return;
    }
    
    console.log(`📁 Selected ${files.length} files from folder`);
    
    // Convert folder to ZIP
    try {
      const zipBlob = await convertFolderToZip(files);
      // Create File object from Blob
      const zipFile = new File([zipBlob], 'tdata.zip', { type: 'application/zip' });
      setTdataFile(zipFile);
      console.log('✅ Folder converted to ZIP');
    } catch (error) {
      console.error('Failed to convert folder to ZIP:', error);
      alert('Ошибка конвертации папки в ZIP');
    }
  };
  
  // Handle ZIP file selection
  const handleZipSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTdataFile(file);
      console.log('📦 ZIP file selected:', file.name);
    }
  };
  
  // Upload tdata and create account
  const handleUploadTdata = async (e) => {
    e.preventDefault();
    
    if (!tdataFile) {
      alert(tdataUploadType === 'folder' ? 'Выберите папку tdata' : 'Выберите tdata zip файл');
      return;
    }
    
    if (!newAccount.account_name) {
      alert('Введите название аккаунта');
      return;
    }
    
    setUploading(true);
    
    try {
      const userId = getUserId();
      const formData = new FormData();
      formData.append('tdata', tdataFile);
      formData.append('account_name', newAccount.account_name);
      if (newAccount.proxy_url) {
        formData.append('proxy_url', newAccount.proxy_url);
      }
      
      const response = await axios.post(
        `${apiUrl}/messaging/accounts/upload-tdata`, 
        formData,
        {
          headers: { 
            'x-user-id': userId,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      alert(`Аккаунт успешно добавлен!\nТелефон: ${response.data.phone}\nUsername: @${response.data.username || 'нет'}`);
      setShowAddAccount(false);
      setTdataFile(null);
      setNewAccount({
        account_name: '',
        session_file: '',
        api_id: '',
        api_hash: '',
        proxy_url: '',
        phone_number: ''
      });
      loadData();
    } catch (error) {
      console.error('Failed to upload tdata:', error);
      alert('Ошибка загрузки tdata: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
    }
  };
  
  // Create campaign
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns`, newCampaign, {
        headers: { 'x-user-id': userId }
      });
      
      alert('Кампания создана!');
      setShowCreateCampaign(false);
      setNewCampaign({
        name: '',
        communication_prompt: '',
        hot_lead_criteria: '',
        target_channel_id: ''
      });
      loadData();
    } catch (error) {
      console.error('Failed to create campaign:', error);
      alert('Ошибка создания кампании: ' + error.response?.data?.error || error.message);
    }
  };
  
  // Start campaign
  const handleStartCampaign = async (campaignId) => {
    if (!window.confirm('Запустить кампанию?')) return;
    
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns/${campaignId}/start`, {}, {
        headers: { 'x-user-id': userId }
      });
      
      alert('Кампания запущена!');
      loadData();
    } catch (error) {
      console.error('Failed to start campaign:', error);
      alert('Ошибка запуска: ' + error.response?.data?.error || error.message);
    }
  };
  
  // Pause campaign
  const handlePauseCampaign = async (campaignId) => {
    try {
      const userId = getUserId();
      await axios.post(`${apiUrl}/messaging/campaigns/${campaignId}/pause`, {}, {
        headers: { 'x-user-id': userId }
      });
      
      alert('Кампания приостановлена');
      loadData();
    } catch (error) {
      console.error('Failed to pause campaign:', error);
      alert('Ошибка: ' + error.response?.data?.error || error.message);
    }
  };
  
  // View conversation
  const viewConversation = async (conversationId) => {
    try {
      const userId = getUserId();
      const res = await axios.get(`${apiUrl}/messaging/conversations/${conversationId}`, {
        headers: { 'x-user-id': userId }
      });
      
      setSelectedConversation(res.data.conversation);
      setShowConversationDetail(true);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      alert('Ошибка загрузки диалога');
    }
  };
  
  // Delete account
  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Удалить аккаунт?')) return;
    
    try {
      const userId = getUserId();
      await axios.delete(`${apiUrl}/messaging/accounts/${accountId}`, {
        headers: { 'x-user-id': userId }
      });
      
      alert('Аккаунт удален');
      loadData();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Ошибка удаления');
    }
  };
  
  if (loading) {
    return (
      <div className="ai-messaging loading">
        <div className="spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }
  
  return (
    <div className="ai-messaging">
      <div className="page-header">
        <h1>🤖 AI Рассылки</h1>
        <p className="subtitle">
          Автоматическое общение с лидами через Telegram с использованием AI
        </p>
      </div>
      
      {/* Stats Overview */}
      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <div className="stat-label">Кампании</div>
              <div className="stat-value">{stats.campaigns.total}</div>
              <div className="stat-detail">{stats.campaigns.running} активных</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <div className="stat-label">Аккаунты</div>
              <div className="stat-value">{stats.accounts.total}</div>
              <div className="stat-detail">{stats.accounts.active} активных</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">💬</div>
            <div className="stat-content">
              <div className="stat-label">Диалоги</div>
              <div className="stat-value">{stats.conversations.total}</div>
              <div className="stat-detail">{stats.conversations.active} активных</div>
            </div>
          </div>
          
          <div className="stat-card hot">
            <div className="stat-icon">🔥</div>
            <div className="stat-content">
              <div className="stat-label">Горячие лиды</div>
              <div className="stat-value">{stats.campaigns.total_hot_leads}</div>
              <div className="stat-detail">{hotLeads.filter(l => !l.posted_to_channel).length} новых</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Telegram Accounts Section */}
      <section className="section accounts-section">
        <div className="section-header">
          <h2>📱 Telegram Аккаунты</h2>
          <button className="btn btn-primary" onClick={() => setShowAddAccount(true)}>
            + Добавить аккаунт
          </button>
        </div>
        
        {accounts.length === 0 ? (
          <div className="empty-state">
            <p>😔 Нет аккаунтов</p>
            <p className="hint">Добавьте Telegram аккаунты для рассылки</p>
          </div>
        ) : (
          <div className="accounts-grid">
            {accounts.map(account => (
              <div key={account.id} className={`account-card ${account.status}`}>
                <div className="account-header">
                  <h3>{account.account_name}</h3>
                  <span className={`status-badge ${account.status}`}>
                    {account.status === 'active' ? '✅ Активен' : 
                     account.status === 'paused' ? '⏸️ Пауза' :
                     account.status === 'banned' ? '🔒 Забанен' : '❌ Ошибка'}
                  </span>
                </div>
                
                <div className="account-info">
                  <div className="info-row">
                    <span className="label">Телефон:</span>
                    <span className="value">{account.phone_number || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Прокси:</span>
                    <span className="value">{account.proxy_url ? '✅ Есть' : '❌ Нет'}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Сообщений сегодня:</span>
                    <span className="value">{account.messages_sent_today} / 25</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Последнее использование:</span>
                    <span className="value">
                      {account.last_used_at ? new Date(account.last_used_at).toLocaleString('ru') : 'Не использовался'}
                    </span>
                  </div>
                </div>
                
                <div className="account-actions">
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
          <h2>🎯 Кампании</h2>
          <button className="btn btn-primary" onClick={() => setShowCreateCampaign(true)}>
            + Создать кампанию
          </button>
        </div>
        
        {campaigns.length === 0 ? (
          <div className="empty-state">
            <p>😔 Нет кампаний</p>
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
                      {campaign.status === 'running' ? '🟢 Запущена' :
                       campaign.status === 'paused' ? '⏸️ Приостановлена' :
                       campaign.status === 'stopped' ? '⏹️ Остановлена' : '📝 Черновик'}
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
                  </div>
                </div>
                
                <div className="campaign-stats">
                  <div className="stat">
                    <span className="stat-label">Обработано лидов:</span>
                    <span className="stat-value">{campaign.leads_contacted}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Горячих лидов:</span>
                    <span className="stat-value">{campaign.hot_leads_found}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Канал уведомлений:</span>
                    <span className="stat-value">{campaign.target_channel_id || 'Не указан'}</span>
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
      
      {/* Conversations Section */}
      <section className="section conversations-section">
        <div className="section-header">
          <h2>💬 Активные диалоги</h2>
          <span className="count-badge">{conversations.length}</span>
        </div>
        
        {conversations.length === 0 ? (
          <div className="empty-state">
            <p>Нет активных диалогов</p>
          </div>
        ) : (
          <div className="conversations-list">
            {conversations.slice(0, 10).map(conv => (
              <div key={conv.id} className="conversation-card">
                <div className="conv-header">
                  <div>
                    <strong>@{conv.peer_username || conv.peer_user_id}</strong>
                    <span className={`status-badge ${conv.status}`}>
                      {conv.status === 'active' ? '🟢' :
                       conv.status === 'hot_lead' ? '🔥' :
                       conv.status === 'waiting' ? '⏳' : '⏹️'}
                    </span>
                  </div>
                  <span className="conv-account">
                    Аккаунт: {conv.telegram_accounts?.account_name || 'N/A'}
                  </span>
                </div>
                
                <div className="conv-info">
                  <span>Сообщений: {conv.messages_count}</span>
                  <span>Последнее: {new Date(conv.last_message_at).toLocaleString('ru')}</span>
                </div>
                
                <button 
                  className="btn btn-small" 
                  onClick={() => viewConversation(conv.id)}
                >
                  Посмотреть историю
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      
      {/* Hot Leads Section */}
      <section className="section hot-leads-section">
        <div className="section-header">
          <h2>🔥 Горячие лиды</h2>
          <span className="count-badge hot">{hotLeads.length}</span>
        </div>
        
        {hotLeads.length === 0 ? (
          <div className="empty-state">
            <p>Горячих лидов пока нет</p>
            <p className="hint">Когда AI определит интерес - они появятся здесь</p>
          </div>
        ) : (
          <div className="hot-leads-list">
            {hotLeads.map(lead => (
              <div key={lead.id} className="hot-lead-card">
                <div className="hot-lead-header">
                  <div>
                    <h3>@{lead.ai_conversations?.peer_username}</h3>
                    {!lead.posted_to_channel && <span className="badge new">НОВЫЙ</span>}
                  </div>
                  <span className="hot-lead-time">
                    {new Date(lead.created_at).toLocaleString('ru')}
                  </span>
                </div>
                
                <div className="hot-lead-info">
                  <div><strong>Кампания:</strong> {lead.messaging_campaigns?.name}</div>
                  <div><strong>Telegram ID:</strong> {lead.ai_conversations?.peer_user_id}</div>
                </div>
                
                <details className="conversation-history">
                  <summary>История диалога ({lead.conversation_history?.length || 0} сообщений)</summary>
                  <div className="history-messages">
                    {(lead.conversation_history || []).map((msg, idx) => (
                      <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-role">
                          {msg.role === 'user' ? '👤 Лид' : '🤖 Мы'}
                        </div>
                        <div className="message-content">{msg.content}</div>
                      </div>
                    ))}
                  </div>
                </details>
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
              <h2>Добавить Telegram аккаунт</h2>
              <button className="close-btn" onClick={() => setShowAddAccount(false)}>×</button>
            </div>
            
            {/* Method selector */}
            <div className="method-selector">
              <button
                type="button"
                className={`method-btn ${accountUploadMethod === 'tdata' ? 'active' : ''}`}
                onClick={() => setAccountUploadMethod('tdata')}
              >
                📦 Загрузить tdata (рекомендуется)
              </button>
              <button
                type="button"
                className={`method-btn ${accountUploadMethod === 'manual' ? 'active' : ''}`}
                onClick={() => setAccountUploadMethod('manual')}
              >
                ⚙️ Вручную (session файл)
              </button>
            </div>
            
            {/* tdata Upload Form */}
            {accountUploadMethod === 'tdata' && (
              <form onSubmit={handleUploadTdata}>
                <div className="form-group">
                  <label>Название аккаунта *</label>
                  <input
                    type="text"
                    value={newAccount.account_name}
                    onChange={e => setNewAccount({...newAccount, account_name: e.target.value})}
                    placeholder="Например: Мой аккаунт 1"
                    required
                  />
                </div>
                
                {/* Upload type selector */}
                <div className="upload-type-selector">
                  <label>
                    <input
                      type="radio"
                      name="upload-type"
                      value="folder"
                      checked={tdataUploadType === 'folder'}
                      onChange={() => {
                        setTdataUploadType('folder');
                        setTdataFile(null);
                      }}
                    />
                    📁 Папка tdata (рекомендуется)
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="upload-type"
                      value="zip"
                      checked={tdataUploadType === 'zip'}
                      onChange={() => {
                        setTdataUploadType('zip');
                        setTdataFile(null);
                      }}
                    />
                    📦 ZIP архив
                  </label>
                </div>
                
                <div className="form-group">
                  {tdataUploadType === 'folder' ? (
                    <>
                      <label>Выберите папку tdata *</label>
                      <input
                        type="file"
                        {...({ webkitdirectory: "true", directory: "true" })}
                        multiple
                        onChange={handleFolderSelect}
                        required
                      />
                      <small>📁 Выберите папку tdata напрямую. Система автоматически упакует её и извлечет все данные.</small>
                    </>
                  ) : (
                    <>
                      <label>tdata архив (zip) *</label>
                      <input
                        type="file"
                        accept=".zip"
                        onChange={handleZipSelect}
                        required
                      />
                      <small>📦 Загрузите tdata папку запакованную в ZIP.</small>
                    </>
                  )}
                  {tdataFile && (
                    <div className="file-selected">
                      ✅ Выбрано: {tdataFile.name} ({(tdataFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                </div>
                
                <div className="form-group">
                  <label>Прокси (опционально)</label>
                  <input
                    type="text"
                    value={newAccount.proxy_url}
                    onChange={e => setNewAccount({...newAccount, proxy_url: e.target.value})}
                    placeholder="socks5://user:pass@host:port"
                  />
                  <small>Опционально. Используйте если аккаунт требует прокси</small>
                </div>
                
                <div className="help-box">
                  <strong>💡 Где найти tdata:</strong>
                  <ul>
                    <li><strong>Windows:</strong> %APPDATA%\Telegram Desktop\tdata</li>
                    <li><strong>macOS:</strong> ~/Library/Application Support/Telegram Desktop/tdata</li>
                    <li><strong>Linux:</strong> ~/.local/share/TelegramDesktop/tdata</li>
                  </ul>
                  <p style="margin-top: 8px;">
                    {tdataUploadType === 'folder' 
                      ? '✨ Просто выберите папку tdata - не нужно архивировать!'
                      : '📦 Заархивируйте папку tdata в ZIP перед загрузкой'
                    }
                  </p>
                </div>
                
                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowAddAccount(false)}
                    disabled={uploading}
                  >
                    Отмена
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={uploading}
                  >
                    {uploading ? '⏳ Загрузка...' : '📤 Загрузить tdata'}
                  </button>
                </div>
              </form>
            )}
            
            {/* Manual Form */}
            {accountUploadMethod === 'manual' && (
              <form onSubmit={handleCreateAccount}>
                <div className="form-group">
                  <label>Название аккаунта *</label>
                  <input
                    type="text"
                    value={newAccount.account_name}
                    onChange={e => setNewAccount({...newAccount, account_name: e.target.value})}
                    placeholder="Например: Мой аккаунт 1"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Session файл *</label>
                  <input
                    type="text"
                    value={newAccount.session_file}
                    onChange={e => setNewAccount({...newAccount, session_file: e.target.value})}
                    placeholder="session_name.session"
                    required
                  />
                  <small>Загрузите session файл в backend/python-service/sessions/</small>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>API ID *</label>
                    <input
                      type="number"
                      value={newAccount.api_id}
                      onChange={e => setNewAccount({...newAccount, api_id: e.target.value})}
                      placeholder="1234567"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>API Hash *</label>
                    <input
                      type="text"
                      value={newAccount.api_hash}
                      onChange={e => setNewAccount({...newAccount, api_hash: e.target.value})}
                      placeholder="abcdef123456..."
                      required
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Прокси (опционально)</label>
                  <input
                    type="text"
                    value={newAccount.proxy_url}
                    onChange={e => setNewAccount({...newAccount, proxy_url: e.target.value})}
                    placeholder="socks5://user:pass@host:port"
                  />
                </div>
                
                <div className="form-group">
                  <label>Телефон (опционально)</label>
                  <input
                    type="text"
                    value={newAccount.phone_number}
                    onChange={e => setNewAccount({...newAccount, phone_number: e.target.value})}
                    placeholder="+1234567890"
                  />
                </div>
                
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddAccount(false)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Добавить
                  </button>
                </div>
              </form>
            )}
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
      
      {/* Conversation Detail Modal */}
      {showConversationDetail && selectedConversation && (
        <div className="modal-overlay" onClick={() => setShowConversationDetail(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Диалог с @{selectedConversation.peer_username}</h2>
              <button className="close-btn" onClick={() => setShowConversationDetail(false)}>×</button>
            </div>
            
            <div className="conversation-detail">
              <div className="conv-meta">
                <div><strong>Статус:</strong> {selectedConversation.status}</div>
                <div><strong>Сообщений:</strong> {selectedConversation.messages_count}</div>
                <div><strong>Аккаунт:</strong> {selectedConversation.telegram_accounts?.account_name}</div>
              </div>
              
              <div className="history-messages">
                {(selectedConversation.conversation_history || []).map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    <div className="message-header">
                      <span className="message-role">
                        {msg.role === 'user' ? '👤 Лид' : '🤖 Мы'}
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



