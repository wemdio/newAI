import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './Outreach.css';

const DEFAULT_SLEEP_PERIODS = '00:00-15:00, 19:00-00:00';
const DEFAULT_FOLLOW_UP_PROMPT =
  'Напиши короткое напоминание о себе. Вежливо напомни о предложении и спроси, актуально ли оно еще. Если не актуально - попроси сообщить об этом. Сообщение должно быть кратким (2-3 предложения).';
const DEFAULT_TRIGGER_PHRASE_POSITIVE = 'Отлично, рад, что смог вас заинтересовать';
const DEFAULT_TRIGGER_PHRASE_NEGATIVE = 'Вижу, что не смог вас заинтересовать';
const DEFAULT_FORWARD_LIMIT = 5;
const DEFAULT_HISTORY_LIMIT = 20;

const formatSleepPeriods = (value) => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value || '';
};

const parseSleepPeriods = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

const normalizeNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeRange = (minValue, maxValue, fallbackMin, fallbackMax) => {
  const min = normalizeNumber(minValue, fallbackMin);
  const max = normalizeNumber(maxValue, fallbackMax);
  return {
    min: Math.min(min, max),
    max: Math.max(min, max)
  };
};

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
    trigger_phrase_positive: DEFAULT_TRIGGER_PHRASE_POSITIVE,
    trigger_phrase_negative: DEFAULT_TRIGGER_PHRASE_NEGATIVE,
    target_chat_positive: '',
    target_chat_negative: '',
    forward_limit: DEFAULT_FORWARD_LIMIT,
    history_limit: DEFAULT_HISTORY_LIMIT,
    use_fallback_on_ai_fail: false,
    fallback_text: '',
    message_delay_min: 60,
    message_delay_max: 180,
    daily_limit: 20,
    sleep_periods: DEFAULT_SLEEP_PERIODS,
    timezone_offset: 3,
    pre_read_delay_min: 5,
    pre_read_delay_max: 10,
    read_reply_delay_min: 5,
    read_reply_delay_max: 10,
    account_loop_delay_min: 300,
    account_loop_delay_max: 600,
    dialog_wait_window_min: 40,
    dialog_wait_window_max: 60,
    ignore_bot_usernames: true,
    account_cooldown_hours: 5,
    follow_up_enabled: false,
    follow_up_delay_hours: 24,
    follow_up_prompt: DEFAULT_FOLLOW_UP_PROMPT,
    reply_only_if_previously_wrote: true,
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
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyCampaignFilter, setHistoryCampaignFilter] = useState('all');

  const [proxies, setProxies] = useState([]);
  const [proxyUsage, setProxyUsage] = useState({});
  const [showProxyForm, setShowProxyForm] = useState(false);
  const [newProxyUrl, setNewProxyUrl] = useState('');
  const [newProxyName, setNewProxyName] = useState('');
  const [proxyBulkText, setProxyBulkText] = useState('');
  const [proxySearchTerms, setProxySearchTerms] = useState({});

  const [processedClients, setProcessedClients] = useState([]);
  const [processedSearch, setProcessedSearch] = useState('');
  const [processedCampaignFilter, setProcessedCampaignFilter] = useState('all');
  const [showProcessedForm, setShowProcessedForm] = useState(false);
  const [processedUsername, setProcessedUsername] = useState('');
  const [processedName, setProcessedName] = useState('');

  const [historySelectedChat, setHistorySelectedChat] = useState(null);
  const [historyMessages, setHistoryMessages] = useState([]);
  const [historyMessageDraft, setHistoryMessageDraft] = useState('');
  const [historySending, setHistorySending] = useState(false);

  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const [logsCampaignFilter, setLogsCampaignFilter] = useState('all');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);

  // Fetch data based on active tab
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'campaigns') {
        const [accRes, campRes, statsRes] = await Promise.all([
          api.get('/outreach/accounts'),
          api.get('/outreach/campaigns'),
          api.get('/outreach/stats')
        ]);
        setAccounts(Array.isArray(accRes.data) ? accRes.data : []);
        setCampaigns(Array.isArray(campRes.data) ? campRes.data : []);
        setStats(statsRes.data);
      } else if (activeTab === 'accounts') {
        const [accRes, proxyRes, usageRes] = await Promise.all([
          api.get('/outreach/accounts'),
          api.get('/outreach/proxies'),
          api.get('/outreach/proxies/usage')
        ]);
        setAccounts(Array.isArray(accRes.data) ? accRes.data : []);
        setProxies(Array.isArray(proxyRes.data) ? proxyRes.data : []);
        const usageMap = {};
        (usageRes.data?.usage || []).forEach(item => {
          usageMap[item.proxy.id] = item.accounts_count;
        });
        setProxyUsage(usageMap);
      } else if (activeTab === 'chats' || activeTab === 'history') {
        const [chatsRes, campaignsRes] = await Promise.all([
          api.get('/outreach/chats'),
          api.get('/outreach/campaigns')
        ]);
        setChats(Array.isArray(chatsRes.data) ? chatsRes.data : []);
        setCampaigns(Array.isArray(campaignsRes.data) ? campaignsRes.data : []);
      } else if (activeTab === 'processed') {
        const params = {};
        if (processedCampaignFilter !== 'all') {
          params.campaign_id = processedCampaignFilter;
        }
        const [processedRes, campaignsRes] = await Promise.all([
          api.get('/outreach/processed', { params }),
          api.get('/outreach/campaigns')
        ]);
        setProcessedClients(Array.isArray(processedRes.data) ? processedRes.data : []);
        setCampaigns(Array.isArray(campaignsRes.data) ? campaignsRes.data : []);
      } else if (activeTab === 'logs') {
        const params = { limit: 200 };
        if (logsCampaignFilter !== 'all') {
          params.campaign_id = logsCampaignFilter;
        }
        const [res, campaignsRes] = await Promise.all([
          api.get('/outreach/logs', { params }),
          api.get('/outreach/campaigns')
        ]);
        setLogs(Array.isArray(res.data) ? res.data : []);
        setCampaigns(Array.isArray(campaignsRes.data) ? campaignsRes.data : []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, processedCampaignFilter, logsCampaignFilter]);

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

  useEffect(() => {
    if (activeTab === 'logs' && autoRefreshLogs) {
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, autoRefreshLogs, fetchData]);

  useEffect(() => {
    if (activeTab === 'processed') {
      fetchData();
    }
  }, [activeTab, processedCampaignFilter, fetchData]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchData();
    }
  }, [activeTab, logsCampaignFilter, fetchData]);

  // ============ CAMPAIGN HANDLERS ============

  const handleSaveCampaign = async (e) => {
    e.preventDefault();
    try {
      const messageDelay = normalizeRange(
        campaignForm.message_delay_min,
        campaignForm.message_delay_max,
        60,
        180
      );
      const preReadDelay = normalizeRange(
        campaignForm.pre_read_delay_min,
        campaignForm.pre_read_delay_max,
        5,
        10
      );
      const readReplyDelay = normalizeRange(
        campaignForm.read_reply_delay_min,
        campaignForm.read_reply_delay_max,
        5,
        10
      );
      const accountLoopDelay = normalizeRange(
        campaignForm.account_loop_delay_min,
        campaignForm.account_loop_delay_max,
        300,
        600
      );
      const dialogWaitWindow = normalizeRange(
        campaignForm.dialog_wait_window_min,
        campaignForm.dialog_wait_window_max,
        40,
        60
      );

      const payload = {
        ...campaignForm,
        trigger_phrase_positive: campaignForm.trigger_phrase_positive?.trim() || null,
        trigger_phrase_negative: campaignForm.trigger_phrase_negative?.trim() || null,
        target_chat_positive: campaignForm.target_chat_positive?.trim() || null,
        target_chat_negative: campaignForm.target_chat_negative?.trim() || null,
        forward_limit: normalizeNumber(campaignForm.forward_limit, DEFAULT_FORWARD_LIMIT),
        history_limit: normalizeNumber(campaignForm.history_limit, DEFAULT_HISTORY_LIMIT),
        use_fallback_on_ai_fail: !!campaignForm.use_fallback_on_ai_fail,
        fallback_text: campaignForm.fallback_text?.trim() || null,
        message_delay_min: messageDelay.min,
        message_delay_max: messageDelay.max,
        daily_limit: normalizeNumber(campaignForm.daily_limit, 20),
        sleep_periods: parseSleepPeriods(campaignForm.sleep_periods),
        timezone_offset: normalizeNumber(campaignForm.timezone_offset, 3),
        pre_read_delay_min: preReadDelay.min,
        pre_read_delay_max: preReadDelay.max,
        read_reply_delay_min: readReplyDelay.min,
        read_reply_delay_max: readReplyDelay.max,
        account_loop_delay_min: accountLoopDelay.min,
        account_loop_delay_max: accountLoopDelay.max,
        dialog_wait_window_min: dialogWaitWindow.min,
        dialog_wait_window_max: dialogWaitWindow.max,
        account_cooldown_hours: normalizeNumber(campaignForm.account_cooldown_hours, 5),
        follow_up_delay_hours: normalizeNumber(campaignForm.follow_up_delay_hours, 24),
        follow_up_prompt: campaignForm.follow_up_prompt?.trim() || DEFAULT_FOLLOW_UP_PROMPT
      };

      if (selectedCampaign) {
        await api.patch(`/outreach/campaigns/${selectedCampaign.id}`, payload);
      } else {
        await api.post('/outreach/campaigns', payload);
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
      trigger_phrase_positive: campaign.trigger_phrase_positive ?? '',
      trigger_phrase_negative: campaign.trigger_phrase_negative ?? '',
      target_chat_positive: campaign.target_chat_positive ?? '',
      target_chat_negative: campaign.target_chat_negative ?? '',
      forward_limit: campaign.forward_limit ?? DEFAULT_FORWARD_LIMIT,
      history_limit: campaign.history_limit ?? DEFAULT_HISTORY_LIMIT,
      use_fallback_on_ai_fail: campaign.use_fallback_on_ai_fail ?? false,
      fallback_text: campaign.fallback_text ?? '',
      message_delay_min: campaign.message_delay_min || 60,
      message_delay_max: campaign.message_delay_max || 180,
      daily_limit: campaign.daily_limit || 20,
      sleep_periods: formatSleepPeriods(campaign.sleep_periods) || DEFAULT_SLEEP_PERIODS,
      timezone_offset: campaign.timezone_offset ?? 3,
      pre_read_delay_min: campaign.pre_read_delay_min ?? 5,
      pre_read_delay_max: campaign.pre_read_delay_max ?? 10,
      read_reply_delay_min: campaign.read_reply_delay_min ?? 5,
      read_reply_delay_max: campaign.read_reply_delay_max ?? 10,
      account_loop_delay_min: campaign.account_loop_delay_min ?? 300,
      account_loop_delay_max: campaign.account_loop_delay_max ?? 600,
      dialog_wait_window_min: campaign.dialog_wait_window_min ?? 40,
      dialog_wait_window_max: campaign.dialog_wait_window_max ?? 60,
      ignore_bot_usernames: campaign.ignore_bot_usernames ?? true,
      account_cooldown_hours: campaign.account_cooldown_hours ?? 5,
      follow_up_enabled: campaign.follow_up_enabled ?? false,
      follow_up_delay_hours: campaign.follow_up_delay_hours ?? 24,
      follow_up_prompt: campaign.follow_up_prompt || DEFAULT_FOLLOW_UP_PROMPT,
      reply_only_if_previously_wrote: campaign.reply_only_if_previously_wrote ?? true,
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

  const handleRestartCampaign = async (id) => {
    if (!window.confirm('Перезапустить кампанию?')) return;
    try {
      await api.post(`/outreach/campaigns/${id}/restart`);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleResetCampaignStatus = async (id) => {
    if (!window.confirm('Сбросить статус кампании на паузу?')) return;
    try {
      await api.post(`/outreach/campaigns/${id}/reset-status`);
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
      trigger_phrase_positive: DEFAULT_TRIGGER_PHRASE_POSITIVE,
      trigger_phrase_negative: DEFAULT_TRIGGER_PHRASE_NEGATIVE,
      target_chat_positive: '',
      target_chat_negative: '',
      forward_limit: DEFAULT_FORWARD_LIMIT,
      history_limit: DEFAULT_HISTORY_LIMIT,
      use_fallback_on_ai_fail: false,
      fallback_text: '',
      message_delay_min: 60,
      message_delay_max: 180,
      daily_limit: 20,
      sleep_periods: DEFAULT_SLEEP_PERIODS,
      timezone_offset: 3,
      pre_read_delay_min: 5,
      pre_read_delay_max: 10,
      read_reply_delay_min: 5,
      read_reply_delay_max: 10,
      account_loop_delay_min: 300,
      account_loop_delay_max: 600,
      dialog_wait_window_min: 40,
      dialog_wait_window_max: 60,
      ignore_bot_usernames: true,
      account_cooldown_hours: 5,
      follow_up_enabled: false,
      follow_up_delay_hours: 24,
      follow_up_prompt: DEFAULT_FOLLOW_UP_PROMPT,
      reply_only_if_previously_wrote: true,
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

  // ============ PROXY HANDLERS ============

  const handleAddProxy = async () => {
    if (!newProxyUrl.trim()) {
      alert('Введите URL прокси');
      return;
    }
    try {
      await api.post('/outreach/proxies', {
        url: newProxyUrl.trim(),
        name: newProxyName.trim() || null
      });
      setNewProxyUrl('');
      setNewProxyName('');
      setShowProxyForm(false);
      fetchData();
    } catch (error) {
      alert('Ошибка добавления прокси: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleBulkAddProxies = async () => {
    if (!proxyBulkText.trim()) {
      alert('Введите список прокси');
      return;
    }
    try {
      const res = await api.post('/outreach/proxies/bulk', { proxies_text: proxyBulkText });
      alert(`Добавлено: ${res.data.added}, пропущено: ${res.data.skipped}`);
      setProxyBulkText('');
      fetchData();
    } catch (error) {
      alert('Ошибка добавления прокси: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteProxy = async (proxyId) => {
    if (!window.confirm('Удалить этот прокси? Он будет отвязан от всех аккаунтов.')) return;
    try {
      await api.delete(`/outreach/proxies/${proxyId}`);
      fetchData();
    } catch (error) {
      alert('Ошибка удаления прокси: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleClearProxies = async () => {
    if (!window.confirm('Удалить все прокси? Они будут отвязаны от всех аккаунтов.')) return;
    try {
      await api.delete('/outreach/proxies');
      fetchData();
    } catch (error) {
      alert('Ошибка очистки прокси: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleAssignProxyToAccount = async (accountId, proxyId) => {
    try {
      await api.patch(`/outreach/accounts/${accountId}`, {
        proxy_id: proxyId || null
      });
      fetchData();
    } catch (error) {
      alert('Ошибка привязки прокси: ' + (error.response?.data?.error || error.message));
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

  // ============ PROCESSED HANDLERS ============

  const handleAddProcessedClient = async () => {
    const username = processedUsername.trim();
    if (!processedCampaignFilter || processedCampaignFilter === 'all') {
      alert('Выберите кампанию');
      return;
    }
    if (!username) {
      alert('Введите username');
      return;
    }
    try {
      await api.post('/outreach/processed', {
        campaign_id: processedCampaignFilter,
        target_username: username,
        target_name: processedName.trim() || null
      });
      setProcessedUsername('');
      setProcessedName('');
      setShowProcessedForm(false);
      fetchData();
    } catch (error) {
      alert('Ошибка добавления клиента: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRemoveProcessedClient = async (clientId) => {
    if (!window.confirm('Удалить клиента из обработанных?')) return;
    try {
      await api.delete(`/outreach/processed/${clientId}`);
      fetchData();
    } catch (error) {
      alert('Ошибка удаления клиента: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUploadProcessedClients = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!processedCampaignFilter || processedCampaignFilter === 'all') {
      alert('Выберите кампанию');
      event.target.value = '';
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaign_id', processedCampaignFilter);
      const res = await api.post('/outreach/processed/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`Добавлено клиентов: ${res.data.added_count}`);
      fetchData();
    } catch (error) {
      alert('Ошибка загрузки списка: ' + (error.response?.data?.error || error.message));
    } finally {
      event.target.value = '';
    }
  };

  const handleAddProcessedFromChat = async (chat) => {
    const campaignId = chat?.campaign?.id || chat?.campaign_id;
    const username = chat?.target_username;
    if (!campaignId || !username) {
      alert('Не удалось определить кампанию или пользователя');
      return;
    }
    try {
      await api.post('/outreach/processed', {
        campaign_id: campaignId,
        target_username: username,
        target_name: chat?.target_name || null
      });
      fetchData();
    } catch (error) {
      alert('Ошибка добавления клиента: ' + (error.response?.data?.error || error.message));
    }
  };

  // ============ CHAT HANDLERS ============

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    setChatDraft('');
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

  const handleLeadStatusUpdate = async (chatId, leadStatus) => {
    try {
      const updates = { lead_status: leadStatus };
      if (leadStatus === 'lead' || leadStatus === 'not_lead') {
        updates.status = 'manual';
      }
      await api.patch(`/outreach/chats/${chatId}`, updates);
      fetchData();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSendChatMessage = async () => {
    if (!selectedChat || !chatDraft.trim()) return;
    setChatSending(true);
    try {
      await api.post(`/outreach/chats/${selectedChat.id}/send`, {
        content: chatDraft.trim()
      });
      setChatMessages(prev => [
        ...prev,
        { id: `pending-${Date.now()}`, sender: 'me', content: chatDraft.trim(), created_at: new Date().toISOString(), pending: true }
      ]);
      setChatDraft('');
    } catch (error) {
      alert('Ошибка отправки: ' + (error.response?.data?.error || error.message));
    } finally {
      setChatSending(false);
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm('Удалить диалог?')) return;
    try {
      await api.delete(`/outreach/chats/${chatId}`);
      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
        setChatMessages([]);
      }
      if (historySelectedChat?.id === chatId) {
        setHistorySelectedChat(null);
        setHistoryMessages([]);
      }
      fetchData();
    } catch (error) {
      alert('Ошибка удаления: ' + (error.response?.data?.error || error.message));
    }
  };

  // ============ HISTORY HANDLERS ============

  const handleSelectHistoryChat = async (chat) => {
    setHistorySelectedChat(chat);
    setHistoryMessageDraft('');
    try {
      const res = await api.get(`/outreach/chats/${chat.id}/messages`);
      setHistoryMessages(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching history messages:', error);
    }
  };

  const handleHistorySendMessage = async () => {
    if (!historySelectedChat || !historyMessageDraft.trim()) return;
    setHistorySending(true);
    try {
      await api.post(`/outreach/chats/${historySelectedChat.id}/send`, {
        content: historyMessageDraft.trim()
      });
      setHistoryMessages(prev => [
        ...prev,
        { id: `pending-${Date.now()}`, sender: 'me', content: historyMessageDraft.trim(), created_at: new Date().toISOString(), pending: true }
      ]);
      setHistoryMessageDraft('');
    } catch (error) {
      alert('Ошибка отправки: ' + (error.response?.data?.error || error.message));
    } finally {
      setHistorySending(false);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const getFilenameFromDisposition = (disposition) => {
    if (!disposition) return null;
    const match = /filename="([^"]+)"/.exec(disposition);
    return match ? match[1] : null;
  };

  const handleExportHistory = async (format) => {
    try {
      const params = { format };
      if (historyCampaignFilter !== 'all') {
        params.campaign_id = historyCampaignFilter;
      }
      const res = await api.get('/outreach/history/export', {
        params,
        responseType: 'blob'
      });
      const filename = getFilenameFromDisposition(res.headers['content-disposition'])
        || `outreach_dialogs.${format === 'html' ? 'html' : 'json'}`;
      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], { type: contentType });
      downloadBlob(blob, filename);
    } catch (error) {
      alert('Ошибка экспорта: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleImportHistory = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert('Пожалуйста, загрузите JSON файл');
      event.target.value = '';
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (historyCampaignFilter !== 'all') {
        formData.append('campaign_id', historyCampaignFilter);
      }
      const res = await api.post('/outreach/history/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const warnings = [];
      if (res.data.skipped_missing_campaign) {
        warnings.push(`Нет campaign_id: ${res.data.skipped_missing_campaign}`);
      }
      if (res.data.skipped_missing_username) {
        warnings.push(`Нет username: ${res.data.skipped_missing_username}`);
      }
      alert(
        `Импорт завершён!\nИмпортировано: ${res.data.imported_count}\nПропущено: ${res.data.skipped_count}` +
        (warnings.length ? `\n\nПропуски:\n- ${warnings.join('\n- ')}` : '')
      );
      fetchData();
    } catch (error) {
      alert('Ошибка импорта: ' + (error.response?.data?.error || error.message));
    } finally {
      event.target.value = '';
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

  const getLeadBadge = (leadStatus) => {
    if (!leadStatus || leadStatus === 'none') return null;
    const colors = {
      lead: '#5cb85c',
      not_lead: '#d9534f',
      later: '#f0ad4e'
    };
    const labels = {
      lead: 'Лид',
      not_lead: 'Не лид',
      later: 'Потом'
    };
    return (
      <span className="status-badge" style={{ background: colors[leadStatus] || '#666' }}>
        {labels[leadStatus] || leadStatus}
      </span>
    );
  };

  const getHistoryStatusBadge = (status) => {
    const value = status || 'none';
    const colors = {
      none: '#666',
      lead: '#22543d',
      not_lead: '#742a2a',
      later: '#744210'
    };
    const labels = {
      none: 'Не размечен',
      lead: 'Лид',
      not_lead: 'Не лид',
      later: 'Потом'
    };
    return (
      <span className="status-badge" style={{ background: colors[value] || '#666' }}>
        {labels[value] || value}
      </span>
    );
  };

  const formatHistoryTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  };

  const historyCampaignChats = historyCampaignFilter === 'all'
    ? chats
    : chats.filter(chat => chat.campaign?.id === historyCampaignFilter);

  const historyStats = historyCampaignChats.reduce((acc, chat) => {
    const status = chat.lead_status || 'none';
    acc.total += 1;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { total: 0, lead: 0, not_lead: 0, later: 0, none: 0 });

  const filteredHistoryChats = historyCampaignChats.filter(chat => {
    const leadStatus = chat.lead_status || 'none';
    if (historyStatusFilter !== 'all' && leadStatus !== historyStatusFilter) {
      return false;
    }
    if (!historySearch) return true;
    const term = historySearch.toLowerCase();
    return (
      (chat.target_username || '').toLowerCase().includes(term)
      || (chat.target_name || '').toLowerCase().includes(term)
      || (chat.account?.phone_number || '').toLowerCase().includes(term)
      || (chat.campaign?.name || '').toLowerCase().includes(term)
    );
  });

  const filteredProcessedClients = processedClients.filter(client => {
    if (!processedSearch) return true;
    const term = processedSearch.toLowerCase();
    return (
      (client.target_username || '').toLowerCase().includes(term)
      || (client.target_name || '').toLowerCase().includes(term)
    );
  });

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
        {['campaigns', 'accounts', 'chats', 'history', 'processed', 'logs'].map(tab => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'campaigns' && 'Кампании'}
            {tab === 'accounts' && 'Аккаунты'}
            {tab === 'chats' && 'Чаты'}
            {tab === 'history' && 'История'}
            {tab === 'processed' && 'Обработанные'}
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
                        onClick={() => handleRestartCampaign(camp.id)}
                      >
                        Перезапуск
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleResetCampaignStatus(camp.id)}
                      >
                        Сброс статуса
                      </button>
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
            ) : (
              <>
                <div className="proxy-section">
                  <div className="proxy-header">
                    <h3>Прокси ({proxies.length})</h3>
                    <div className="proxy-actions">
                      <button className="btn btn-primary btn-small" onClick={() => setShowProxyForm(true)}>
                        Добавить прокси
                      </button>
                      {proxies.length > 0 && (
                        <button className="btn btn-danger btn-small" onClick={handleClearProxies}>
                          Очистить все
                        </button>
                      )}
                    </div>
                  </div>

                  {showProxyForm && (
                    <div className="proxy-form">
                      <div className="form-group">
                        <label>URL прокси</label>
                        <input
                          type="text"
                          value={newProxyUrl}
                          onChange={e => setNewProxyUrl(e.target.value)}
                          placeholder="socks5://user:pass@host:port"
                        />
                      </div>
                      <div className="form-group">
                        <label>Название (опционально)</label>
                        <input
                          type="text"
                          value={newProxyName}
                          onChange={e => setNewProxyName(e.target.value)}
                          placeholder="Мой прокси 1"
                        />
                      </div>
                      <div className="form-actions">
                        <button className="btn btn-primary btn-small" onClick={handleAddProxy}>Сохранить</button>
                        <button className="btn btn-secondary btn-small" onClick={() => setShowProxyForm(false)}>Отмена</button>
                      </div>
                    </div>
                  )}

                  <div className="proxy-bulk">
                    <label>Добавить список прокси (по одному на строку)</label>
                    <textarea
                      value={proxyBulkText}
                      onChange={e => setProxyBulkText(e.target.value)}
                      rows={3}
                      placeholder="socks5://user:pass@host:port"
                    />
                    <button className="btn btn-secondary btn-small" onClick={handleBulkAddProxies}>
                      Загрузить список
                    </button>
                  </div>

                  {proxies.length === 0 ? (
                    <div className="empty-state small">
                      <p>Прокси не добавлены</p>
                    </div>
                  ) : (
                    <div className="proxy-list">
                      {proxies.map(proxy => (
                        <div key={proxy.id} className="proxy-item">
                          <div>
                            <div className="proxy-name">{proxy.name || 'Без названия'}</div>
                            <div className="proxy-url">{proxy.url}</div>
                            <div className="proxy-usage">Привязано аккаунтов: {proxyUsage[proxy.id] || 0}</div>
                          </div>
                          <button className="btn btn-danger btn-small" onClick={() => handleDeleteProxy(proxy.id)}>
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {accounts.length === 0 ? (
                  <div className="empty-state">
                    <h3>Нет аккаунтов</h3>
                    <p>Добавьте Telegram аккаунты для рассылки</p>
                  </div>
                ) : (
                  <>
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

                    <div className="accounts-table-wrapper">
                      <h3>Привязка прокси к аккаунтам</h3>
                      <table className="accounts-table">
                        <thead>
                          <tr>
                            <th>Аккаунт</th>
                            <th>Прокси</th>
                            <th>Статус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map(acc => {
                            const searchTerm = (proxySearchTerms[acc.id] || '').toLowerCase();
                            const filtered = proxies.filter(proxy => {
                              const label = (proxy.name || proxy.url).toLowerCase();
                              return label.includes(searchTerm);
                            });
                            return (
                              <tr key={acc.id}>
                                <td>{acc.phone_number}</td>
                                <td>
                                  <input
                                    type="text"
                                    value={proxySearchTerms[acc.id] || ''}
                                    onChange={e => setProxySearchTerms(prev => ({ ...prev, [acc.id]: e.target.value }))}
                                    placeholder="Поиск прокси..."
                                    className="proxy-search"
                                  />
                                  <select
                                    value={acc.proxy_id || ''}
                                    onChange={e => handleAssignProxyToAccount(acc.id, e.target.value || null)}
                                  >
                                    <option value="">Без прокси</option>
                                    {filtered.map(proxy => {
                                      const usage = proxyUsage[proxy.id] || 0;
                                      const label = `${proxy.name || proxy.url} (${usage})`;
                                      return (
                                        <option key={proxy.id} value={proxy.id}>
                                          {label}
                                        </option>
                                      );
                                    })}
                                  </select>
                    {acc.proxy_url && (
                                    <div className="proxy-preview">{acc.proxy_url}</div>
                                  )}
                                </td>
                                <td>{getStatusBadge(acc.status)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                  </div>
                  </>
                )}
              </>
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
                            {getLeadBadge(chat.lead_status)}
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
                        {getLeadBadge(selectedChat.lead_status)}
                      </div>
                      <div className="chat-controls">
                        <button 
                          className={`btn btn-small ${selectedChat.status === 'manual' ? 'btn-success' : 'btn-warning'}`}
                          onClick={() => handleChatModeToggle(selectedChat.id, selectedChat.status)}
                        >
                          {selectedChat.status === 'manual' ? 'Вкл. AI' : 'Ручной режим'}
                        </button>
                        <button
                          className={`btn btn-small ${selectedChat.lead_status === 'lead' ? 'btn-success' : 'btn-secondary'}`}
                          onClick={() => handleLeadStatusUpdate(
                            selectedChat.id,
                            selectedChat.lead_status === 'lead' ? 'none' : 'lead'
                          )}
                        >
                          Лид
                        </button>
                        <button
                          className={`btn btn-small ${selectedChat.lead_status === 'not_lead' ? 'btn-danger' : 'btn-secondary'}`}
                          onClick={() => handleLeadStatusUpdate(
                            selectedChat.id,
                            selectedChat.lead_status === 'not_lead' ? 'none' : 'not_lead'
                          )}
                        >
                          Не лид
                        </button>
                        <button
                          className={`btn btn-small ${selectedChat.lead_status === 'later' ? 'btn-warning' : 'btn-secondary'}`}
                          onClick={() => handleLeadStatusUpdate(
                            selectedChat.id,
                            selectedChat.lead_status === 'later' ? 'none' : 'later'
                          )}
                        >
                          Потом
                        </button>
                        <button
                          className="btn btn-small btn-secondary"
                          onClick={() => handleAddProcessedFromChat(selectedChat)}
                        >
                          В обработанные
                        </button>
                        <button
                          className="btn btn-small btn-danger"
                          onClick={() => handleDeleteChat(selectedChat.id)}
                        >
                          Удалить
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
                    <div className="chat-reply">
                      <textarea
                        value={chatDraft}
                        onChange={e => setChatDraft(e.target.value)}
                        placeholder="Введите сообщение..."
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            handleSendChatMessage();
                          }
                        }}
                      />
                      <button
                        className="btn btn-primary"
                        disabled={chatSending || !chatDraft.trim()}
                        onClick={handleSendChatMessage}
                      >
                        {chatSending ? 'Отправка...' : 'Отправить'}
                      </button>
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

        {/* ============ HISTORY TAB ============ */}
        {activeTab === 'history' && (
          <section className="history-section">
            <div className="section-header">
              <h2>История диалогов</h2>
              <div className="history-actions">
                <button className="btn btn-secondary btn-small" onClick={() => handleExportHistory('json')}>
                  Скачать JSON
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => handleExportHistory('html')}>
                  Скачать HTML
                </button>
                <label className="btn btn-secondary btn-small">
                  Импорт JSON
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportHistory}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            <div className="history-controls">
              <input
                type="text"
                placeholder="Поиск по username, имени, кампании..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
              >
                <option value="all">Все статусы</option>
                <option value="none">Не размечены</option>
                <option value="lead">Лиды</option>
                <option value="not_lead">Не лиды</option>
                <option value="later">Потом</option>
              </select>
              <select
                value={historyCampaignFilter}
                onChange={(e) => setHistoryCampaignFilter(e.target.value)}
              >
                <option value="all">Все кампании</option>
                {campaigns.map(camp => (
                  <option key={camp.id} value={camp.id}>{camp.name}</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-small" onClick={fetchData}>
                Обновить
              </button>
            </div>

            <div className="history-stats">
              <div className="history-stat">
                <div className="value">{historyStats.total}</div>
                <div className="label">Всего</div>
              </div>
              <div className="history-stat">
                <div className="value">{historyStats.lead}</div>
                <div className="label">Лиды</div>
              </div>
              <div className="history-stat">
                <div className="value">{historyStats.not_lead}</div>
                <div className="label">Не лиды</div>
              </div>
              <div className="history-stat">
                <div className="value">{historyStats.later}</div>
                <div className="label">Потом</div>
              </div>
              <div className="history-stat">
                <div className="value">{historyStats.none}</div>
                <div className="label">Не размечено</div>
              </div>
            </div>

            <div className="history-layout">
              <div className="history-list">
                {filteredHistoryChats.length === 0 ? (
                  <div className="empty-state small">
                    <p>Нет диалогов</p>
                  </div>
                ) : (
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Статус</th>
                        <th>Последнее</th>
                        <th>Аккаунт</th>
                        <th>Пользователь</th>
                        <th>Кампания</th>
                        <th>Обработан</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistoryChats.map(chat => (
                        <tr key={chat.id}>
                          <td>{getHistoryStatusBadge(chat.lead_status || 'none')}</td>
                          <td>{formatHistoryTime(chat.last_message_at)}</td>
                          <td>{chat.account?.phone_number || '-'}</td>
                          <td>{chat.target_name || `@${chat.target_username}`}</td>
                          <td>{chat.campaign?.name || '-'}</td>
                          <td>{formatHistoryTime(chat.processed_at)}</td>
                          <td>
                            <div className="history-row-actions">
                              <button className="btn btn-secondary btn-small" onClick={() => handleSelectHistoryChat(chat)}>
                                👁
                              </button>
                              <button
                                className={`btn btn-small ${chat.lead_status === 'lead' ? 'btn-success' : 'btn-secondary'}`}
                                onClick={() => handleLeadStatusUpdate(chat.id, chat.lead_status === 'lead' ? 'none' : 'lead')}
                              >
                                ✅
                              </button>
                              <button
                                className={`btn btn-small ${chat.lead_status === 'not_lead' ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => handleLeadStatusUpdate(chat.id, chat.lead_status === 'not_lead' ? 'none' : 'not_lead')}
                              >
                                ❌
                              </button>
                              <button
                                className={`btn btn-small ${chat.lead_status === 'later' ? 'btn-warning' : 'btn-secondary'}`}
                                onClick={() => handleLeadStatusUpdate(chat.id, chat.lead_status === 'later' ? 'none' : 'later')}
                              >
                                ⏰
                              </button>
                              <button className="btn btn-secondary btn-small" onClick={() => handleAddProcessedFromChat(chat)}>
                                🚫
                              </button>
                              <button className="btn btn-danger btn-small" onClick={() => handleDeleteChat(chat.id)}>
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="history-view">
                {historySelectedChat ? (
                  <>
                    <div className="history-chat-header">
                      <div>
                        <h3>{historySelectedChat.target_name || `@${historySelectedChat.target_username}`}</h3>
                        <div className="history-meta">
                          <span>{historySelectedChat.campaign?.name || '—'}</span>
                          <span>{historySelectedChat.account?.phone_number || '—'}</span>
                          {getHistoryStatusBadge(historySelectedChat.lead_status || 'none')}
                        </div>
                      </div>
                      <div className="history-chat-actions">
                        <button
                          className={`btn btn-small ${historySelectedChat.lead_status === 'lead' ? 'btn-success' : 'btn-secondary'}`}
                          onClick={() => handleLeadStatusUpdate(
                            historySelectedChat.id,
                            historySelectedChat.lead_status === 'lead' ? 'none' : 'lead'
                          )}
                        >
                          Лид
                        </button>
                        <button
                          className={`btn btn-small ${historySelectedChat.lead_status === 'not_lead' ? 'btn-danger' : 'btn-secondary'}`}
                          onClick={() => handleLeadStatusUpdate(
                            historySelectedChat.id,
                            historySelectedChat.lead_status === 'not_lead' ? 'none' : 'not_lead'
                          )}
                        >
                          Не лид
                        </button>
                        <button
                          className={`btn btn-small ${historySelectedChat.lead_status === 'later' ? 'btn-warning' : 'btn-secondary'}`}
                          onClick={() => handleLeadStatusUpdate(
                            historySelectedChat.id,
                            historySelectedChat.lead_status === 'later' ? 'none' : 'later'
                          )}
                        >
                          Потом
                        </button>
                        <button className="btn btn-small btn-secondary" onClick={() => handleAddProcessedFromChat(historySelectedChat)}>
                          В обработанные
                        </button>
                        <button className="btn btn-small btn-danger" onClick={() => handleDeleteChat(historySelectedChat.id)}>
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="messages-container history-messages">
                      {historyMessages.map(msg => (
                        <div key={msg.id} className={`message ${msg.sender}`}>
                          <div className="message-content">{msg.content}</div>
                          <div className="message-time">
                            {formatHistoryTime(msg.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="chat-reply">
                      <textarea
                        value={historyMessageDraft}
                        onChange={e => setHistoryMessageDraft(e.target.value)}
                        placeholder="Введите сообщение..."
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            handleHistorySendMessage();
                          }
                        }}
                      />
                      <button
                        className="btn btn-primary"
                        disabled={historySending || !historyMessageDraft.trim()}
                        onClick={handleHistorySendMessage}
                      >
                        {historySending ? 'Отправка...' : 'Отправить'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>Выберите диалог</h3>
                    <p>Кликните на строку диалога для просмотра сообщений</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============ PROCESSED TAB ============ */}
        {activeTab === 'processed' && (
          <section className="processed-section">
            <div className="section-header">
              <h2>Обработанные клиенты</h2>
              <div className="processed-actions">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setShowProcessedForm(!showProcessedForm)}
                >
                  {showProcessedForm ? 'Скрыть форму' : 'Добавить клиента'}
                </button>
                <label className="btn btn-secondary btn-small">
                  Загрузить список
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleUploadProcessedClients}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            <div className="processed-controls">
              <select
                value={processedCampaignFilter}
                onChange={(e) => setProcessedCampaignFilter(e.target.value)}
              >
                <option value="all">Все кампании</option>
                {campaigns.map(camp => (
                  <option key={camp.id} value={camp.id}>{camp.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Поиск по username/имени..."
                value={processedSearch}
                onChange={(e) => setProcessedSearch(e.target.value)}
              />
              <button className="btn btn-secondary btn-small" onClick={fetchData}>
                Обновить
              </button>
            </div>

            {showProcessedForm && (
              <div className="processed-form">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={processedUsername}
                    onChange={(e) => setProcessedUsername(e.target.value)}
                    placeholder="@username"
                  />
                </div>
                <div className="form-group">
                  <label>Имя (опционально)</label>
                  <input
                    type="text"
                    value={processedName}
                    onChange={(e) => setProcessedName(e.target.value)}
                    placeholder="Имя пользователя"
                  />
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary btn-small" onClick={handleAddProcessedClient}>
                    Добавить
                  </button>
                </div>
              </div>
            )}

            <div className="processed-hint">
              Эти пользователи не будут получать новые сообщения. Можно удалить из списка, чтобы разрешить общение снова.
            </div>

            {filteredProcessedClients.length === 0 ? (
              <div className="empty-state small">
                <p>Нет обработанных клиентов</p>
              </div>
            ) : (
              <table className="processed-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Имя</th>
                    <th>Кампания</th>
                    <th>Добавлен</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProcessedClients.map(client => {
                    const campaign = campaigns.find(c => c.id === client.campaign_id);
                    return (
                      <tr key={client.id}>
                        <td>@{client.target_username}</td>
                        <td>{client.target_name || '—'}</td>
                        <td>{campaign?.name || '—'}</td>
                        <td>{formatHistoryTime(client.created_at)}</td>
                        <td>
                          <button
                            className="btn btn-danger btn-small"
                            onClick={() => handleRemoveProcessedClient(client.id)}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* ============ LOGS TAB ============ */}
        {activeTab === 'logs' && (
          <section className="logs-section">
             <div className="section-header">
              <h2>Логи воркера</h2>
              <div className="logs-actions">
                <select
                  value={logsCampaignFilter}
                  onChange={(e) => setLogsCampaignFilter(e.target.value)}
                >
                  <option value="all">Все кампании</option>
                  {campaigns.map(camp => (
                    <option key={camp.id} value={camp.id}>{camp.name}</option>
                  ))}
                </select>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoRefreshLogs}
                    onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                  />
                  <span>Автообновление</span>
                </label>
                <button className="btn btn-secondary btn-small" onClick={fetchData}>
                  Обновить
                </button>
              </div>
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
                <>
                  <div className="form-group">
                    <label>AI Промпт (инструкции для AI)</label>
                    <textarea 
                      value={campaignForm.ai_prompt}
                      onChange={e => setCampaignForm({...campaignForm, ai_prompt: e.target.value})}
                      placeholder="Ты менеджер по продажам. Твоя задача - выявить интерес к продукту и назначить звонок. Будь дружелюбным и не навязчивым..."
                      rows={4}
                    />
                    <small className="form-hint">
                      Можно использовать {"{trigger_phrase_positive}"} и {"{trigger_phrase_negative}"} для автодетекции лидов.
                    </small>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Триггер фраза (интерес)</label>
                      <input
                        type="text"
                        value={campaignForm.trigger_phrase_positive}
                        onChange={e => setCampaignForm({...campaignForm, trigger_phrase_positive: e.target.value})}
                        placeholder={DEFAULT_TRIGGER_PHRASE_POSITIVE}
                      />
                    </div>
                    <div className="form-group">
                      <label>Чат для лидов</label>
                      <input
                        type="text"
                        value={campaignForm.target_chat_positive}
                        onChange={e => setCampaignForm({...campaignForm, target_chat_positive: e.target.value})}
                        placeholder="@sales_team или -1001234567890"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Триггер фраза (неинтересно)</label>
                      <input
                        type="text"
                        value={campaignForm.trigger_phrase_negative}
                        onChange={e => setCampaignForm({...campaignForm, trigger_phrase_negative: e.target.value})}
                        placeholder={DEFAULT_TRIGGER_PHRASE_NEGATIVE}
                      />
                    </div>
                    <div className="form-group">
                      <label>Чат для отказов</label>
                      <input
                        type="text"
                        value={campaignForm.target_chat_negative}
                        onChange={e => setCampaignForm({...campaignForm, target_chat_negative: e.target.value})}
                        placeholder="@rejects или -1001234567890"
                      />
                    </div>
                  </div>

                  <div className="form-row three-col">
                    <div className="form-group">
                      <label>Forward лимит</label>
                      <input
                        type="number"
                        value={campaignForm.forward_limit}
                        onChange={e => setCampaignForm({...campaignForm, forward_limit: parseInt(e.target.value)})}
                        min={1}
                        max={50}
                      />
                    </div>
                    <div className="form-group">
                      <label>История для AI</label>
                      <input
                        type="number"
                        value={campaignForm.history_limit}
                        onChange={e => setCampaignForm({...campaignForm, history_limit: parseInt(e.target.value)})}
                        min={5}
                        max={100}
                      />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={campaignForm.use_fallback_on_ai_fail}
                          onChange={e => setCampaignForm({...campaignForm, use_fallback_on_ai_fail: e.target.checked})}
                        />
                        <span>Fallback при сбое AI</span>
                      </label>
                    </div>
                  </div>

                  {campaignForm.use_fallback_on_ai_fail && (
                    <div className="form-group">
                      <label>Fallback текст</label>
                      <textarea 
                        value={campaignForm.fallback_text}
                        onChange={e => setCampaignForm({...campaignForm, fallback_text: e.target.value})}
                        placeholder="Сообщение, которое отправится если AI не ответил"
                        rows={3}
                      />
                    </div>
                  )}
                </>
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

              <div className="form-row three-col">
                <div className="form-group">
                  <label>Перед чтением (сек, мин)</label>
                  <input
                    type="number"
                    value={campaignForm.pre_read_delay_min}
                    onChange={e => setCampaignForm({...campaignForm, pre_read_delay_min: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>Перед чтением (сек, макс)</label>
                  <input
                    type="number"
                    value={campaignForm.pre_read_delay_max}
                    onChange={e => setCampaignForm({...campaignForm, pre_read_delay_max: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>Часовой пояс (UTC)</label>
                  <input
                    type="number"
                    value={campaignForm.timezone_offset}
                    onChange={e => setCampaignForm({...campaignForm, timezone_offset: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              <div className="form-row three-col">
                <div className="form-group">
                  <label>После чтения (сек, мин)</label>
                  <input
                    type="number"
                    value={campaignForm.read_reply_delay_min}
                    onChange={e => setCampaignForm({...campaignForm, read_reply_delay_min: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>После чтения (сек, макс)</label>
                  <input
                    type="number"
                    value={campaignForm.read_reply_delay_max}
                    onChange={e => setCampaignForm({...campaignForm, read_reply_delay_max: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>Отлежка аккаунта (ч)</label>
                  <input
                    type="number"
                    value={campaignForm.account_cooldown_hours}
                    onChange={e => setCampaignForm({...campaignForm, account_cooldown_hours: parseInt(e.target.value)})}
                    min={1}
                  />
                </div>
              </div>

              <div className="form-row three-col">
                <div className="form-group">
                  <label>Пауза между аккаунтами (сек, мин)</label>
                  <input
                    type="number"
                    value={campaignForm.account_loop_delay_min}
                    onChange={e => setCampaignForm({...campaignForm, account_loop_delay_min: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>Пауза между аккаунтами (сек, макс)</label>
                  <input
                    type="number"
                    value={campaignForm.account_loop_delay_max}
                    onChange={e => setCampaignForm({...campaignForm, account_loop_delay_max: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>Окно диалога (сек, мин)</label>
                  <input
                    type="number"
                    value={campaignForm.dialog_wait_window_min}
                    onChange={e => setCampaignForm({...campaignForm, dialog_wait_window_min: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
              </div>

              <div className="form-row three-col">
                <div className="form-group">
                  <label>Окно диалога (сек, макс)</label>
                  <input
                    type="number"
                    value={campaignForm.dialog_wait_window_max}
                    onChange={e => setCampaignForm({...campaignForm, dialog_wait_window_max: parseInt(e.target.value)})}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>Периоды сна (через запятую)</label>
                  <input
                    type="text"
                    value={campaignForm.sleep_periods}
                    onChange={e => setCampaignForm({...campaignForm, sleep_periods: e.target.value})}
                    placeholder="00:00-15:00, 19:00-00:00"
                  />
                </div>
                <div className="form-group">
                  <label>Ответ только если писали</label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={campaignForm.reply_only_if_previously_wrote}
                      onChange={e => setCampaignForm({...campaignForm, reply_only_if_previously_wrote: e.target.checked})}
                    />
                    <span>Включено</span>
                  </label>
                </div>
              </div>

              <div className="form-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={campaignForm.ignore_bot_usernames}
                    onChange={e => setCampaignForm({...campaignForm, ignore_bot_usernames: e.target.checked})}
                  />
                  <span>Не отвечать ботам</span>
                </label>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={campaignForm.follow_up_enabled}
                    onChange={e => setCampaignForm({...campaignForm, follow_up_enabled: e.target.checked})}
                  />
                  <span>Включить follow-up сообщения</span>
                </label>
              </div>

              {campaignForm.follow_up_enabled && (
                <>
                  <div className="form-row three-col">
                    <div className="form-group">
                      <label>Через сколько часов</label>
                      <input
                        type="number"
                        value={campaignForm.follow_up_delay_hours}
                        onChange={e => setCampaignForm({...campaignForm, follow_up_delay_hours: parseInt(e.target.value)})}
                        min={1}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Промпт для follow-up</label>
                    <textarea
                      value={campaignForm.follow_up_prompt}
                      onChange={e => setCampaignForm({...campaignForm, follow_up_prompt: e.target.value})}
                      rows={3}
                    />
                  </div>
                </>
              )}

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