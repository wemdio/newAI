import React, { useState, useEffect } from 'react';
import { configApi, scannerApi, classifierApi, leadbotApi } from '../services/api';
import './Configuration.css';

const LEAD_PROMPT_MAX_LENGTH = 6000;
const LEAD_PROMPT_WARNING_LENGTH = Math.floor(LEAD_PROMPT_MAX_LENGTH * 0.8);

function Configuration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [configExists, setConfigExists] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState(null);
  const [config, setConfig] = useState({
    openrouterApiKey: '',
    leadPrompt: '',
    messagePrompt: '',
    telegramChannelId: '',
    telegramMinConfidence: 0,
    isActive: true
  });

  const [scannerStatus, setScannerStatus] = useState(null);

  const [classifierEnabled, setClassifierEnabled] = useState(false);
  const [classifierStats, setClassifierStats] = useState(null);
  const [classifierRuntime, setClassifierRuntime] = useState(null);
  const [classifierLoading, setClassifierLoading] = useState(false);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [leadbotEnabled, setLeadbotEnabled] = useState(false);
  const [leadbotStats, setLeadbotStats] = useState(null);
  const [leadbotLoading, setLeadbotLoading] = useState(false);

  useEffect(() => {
    loadConfiguration();
    loadScannerStatus();
    loadClassifierStatus();
    loadAnalysisStatus();
    loadLeadbotStatus();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await configApi.get();
      if (response.data.config) {
        setConfigExists(true);
        
        const apiKey = response.data.config.openrouter_api_key || '';
        const isMasked = apiKey.startsWith('***');
        
        if (isMasked) {
          setMaskedApiKey(apiKey); // Store the masked value
        }
        
        setConfig({
          openrouterApiKey: isMasked ? '' : apiKey, // Empty if masked
          leadPrompt: response.data.config.lead_prompt || '',
          messagePrompt: response.data.config.message_prompt || '',
          telegramChannelId: response.data.config.telegram_channel_id || '',
          telegramMinConfidence: Number.isFinite(response.data.config.telegram_min_confidence)
            ? response.data.config.telegram_min_confidence
            : 0,
          isActive: response.data.config.is_active !== false
        });
      }
    } catch (err) {
      if (err.response?.status === 404) {
        // 404 is OK - means first time setup
        setConfigExists(false);
      } else {
        setError(err.response?.data?.message || 'Не удалось загрузить настройки');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    const trimmedPrompt = config.leadPrompt.trim();
    if (!trimmedPrompt) {
      setError('Критерии определения лидов обязательны');
      return;
    }
    if (trimmedPrompt.length < 20) {
      setError('Критерии слишком короткие. Опишите подробнее (минимум 20 символов)');
      return;
    }
    if (trimmedPrompt.length > LEAD_PROMPT_MAX_LENGTH) {
      setError(`Критерии слишком длинные (${trimmedPrompt.length}/${LEAD_PROMPT_MAX_LENGTH} символов). Сократите текст`);
      return;
    }
    // Telegram Channel ID is now optional
    
    // API key is required only for new configs OR if user wants to update it
    const isUpdatingApiKey = config.openrouterApiKey.trim().length > 0;
    if (!configExists && !isUpdatingApiKey) {
      setError('API ключ OpenRouter обязателен при первой настройке');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const data = {
        lead_prompt: config.leadPrompt,
        message_prompt: config.messagePrompt || null,
        telegram_channel_id: config.telegramChannelId,
        telegram_min_confidence: config.telegramMinConfidence,
        is_active: config.isActive
      };
      
      // Only include API key if user provided a new one
      if (isUpdatingApiKey) {
        data.openrouter_api_key = config.openrouterApiKey;
      }

      // Use POST for new config, PUT for updates
      if (configExists) {
        await configApi.update(data);
      } else {
        await configApi.create(data);
        setConfigExists(true);
        setMaskedApiKey('***' + config.openrouterApiKey.slice(-4)); // Mask after creating
      }

      setSuccess(true);
      
      // Reload config to get masked API key
      if (isUpdatingApiKey) {
        await loadConfiguration();
      }
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      const newStatus = !config.isActive;
      await configApi.update({ is_active: newStatus });
      setConfig({ ...config, isActive: newStatus });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось обновить статус');
    }
  };

  const loadScannerStatus = async () => {
    try {
      const response = await scannerApi.status();
      setScannerStatus(response.data.status);
    } catch (err) {
      console.error('Scanner status error:', err);
    }
  };

  const loadClassifierStatus = async () => {
    try {
      const response = await classifierApi.status();
      setIsAdmin(true);
      setClassifierEnabled(response.data.enabled);
      setClassifierRuntime(response.data.runtime);

      const statsResponse = await classifierApi.stats();
      setClassifierStats(statsResponse.data.stats);
    } catch (err) {
      if (err.response?.status === 403) {
        setIsAdmin(false);
      } else {
        console.error('Classifier status error:', err);
      }
    }
  };

  const handleToggleClassifier = async () => {
    try {
      setClassifierLoading(true);
      const newState = !classifierEnabled;
      await classifierApi.toggle(newState);
      setClassifierEnabled(newState);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось переключить классификатор');
    } finally {
      setClassifierLoading(false);
    }
  };

  const loadAnalysisStatus = async () => {
    try {
      const response = await scannerApi.status();
      if (typeof response.data.analysisEnabled === 'boolean') {
        setAnalysisEnabled(response.data.analysisEnabled);
      }
    } catch (err) {
      console.error('Analysis status error:', err);
    }
  };

  const handleToggleAnalysis = async () => {
    try {
      setAnalysisLoading(true);
      const newState = !analysisEnabled;
      await scannerApi.toggle(newState);
      setAnalysisEnabled(newState);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось переключить анализ');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const loadLeadbotStatus = async () => {
    try {
      const response = await leadbotApi.status();
      setLeadbotEnabled(response.data.enabled);
      setLeadbotStats(response.data.stats);
    } catch (err) {
      if (err.response?.status !== 403) {
        console.error('Leadbot status error:', err);
      }
    }
  };

  const handleToggleLeadbot = async () => {
    try {
      setLeadbotLoading(true);
      const newState = !leadbotEnabled;
      await leadbotApi.toggle(newState);
      setLeadbotEnabled(newState);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось переключить Lead Bot');
    } finally {
      setLeadbotLoading(false);
    }
  };

  const categoryLabels = {
    development: 'Разработка',
    infobusiness: 'Инфобизнес',
    marketing: 'Маркетинг / SMM',
    hr: 'HR / Найм',
    design: 'Дизайн',
    realestate: 'Недвижимость',
    legal: 'Юриспруденция',
    finance: 'Бухгалтерия / Финансы',
    logistics: 'Логистика / Карго',
    marketplaces: 'Маркетплейсы',
    construction: 'Строительство',
    tenders: 'Тендеры / Госзакупки',
  };

  if (loading) {
    return <div className="loading">Загрузка настроек...</div>;
  }

  return (
    <div className="configuration">
      <div className="config-header">
        <h2>Настройки</h2>
        <div className="status-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={handleToggleActive}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
            <span className="toggle-text">
              {config.isActive ? 'Активно' : 'Приостановлено'}
            </span>
          </label>
        </div>
      </div>

      {!configExists && !error && (
        <div className="alert alert-info">
          Добро пожаловать! Это ваша первая настройка. Пожалуйста, заполните все поля ниже для начала работы.
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          Настройки успешно сохранены!
        </div>
      )}

      <form onSubmit={handleSubmit} className="config-form">
        {/* OpenRouter API Key */}
        <div className="form-section">
          <h3>OpenRouter API ключ</h3>
          <p className="section-description">
            Ваш API ключ OpenRouter для AI анализа. Получите его на{' '}
            <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer">
              openrouter.ai
            </a>
          </p>
          {maskedApiKey && (
            <div className="alert alert-info" style={{ marginBottom: '10px' }}>
              API ключ уже установлен: {maskedApiKey}
            </div>
          )}
          <input
            type="password"
            value={config.openrouterApiKey}
            onChange={(e) => setConfig({ ...config, openrouterApiKey: e.target.value })}
            placeholder={maskedApiKey ? "Оставьте пустым, чтобы сохранить текущий ключ" : "sk-or-v1-..."}
            className="form-input"
            required={!configExists}
          />
          <small className="form-hint">
            {maskedApiKey 
              ? "Введите новый ключ только если хотите обновить его"
              : "Ваш API ключ шифруется и хранится безопасно"}
          </small>
        </div>

        {/* Telegram Channel ID */}
        <div className="form-section">
          <h3>ID Telegram канала</h3>
          <p className="section-description">
            Ваш приватный Telegram канал, куда будут публиковаться лиды
          </p>
          <input
            type="text"
            value={config.telegramChannelId}
            onChange={(e) => setConfig({ ...config, telegramChannelId: e.target.value })}
            placeholder="@your_channel или -100123456789 (необязательно)"
            className="form-input"
          />
          <small className="form-hint">
            Оставьте пустым, если хотите просматривать лиды только в приложении
          </small>
        </div>

        {/* Telegram Confidence Threshold */}
        <div className="form-section">
          <h3>Порог публикации в Telegram</h3>
          <p className="section-description">
            Публиковать в Telegram только лиды с уверенностью от выбранного процента.
            Лиды ниже порога всё равно сохраняются в базе.
          </p>
          <div className="range-row">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={config.telegramMinConfidence}
              onChange={(e) => setConfig({ ...config, telegramMinConfidence: parseInt(e.target.value, 10) || 0 })}
              className="range-input"
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={config.telegramMinConfidence}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                setConfig({ ...config, telegramMinConfidence: Number.isFinite(value) ? value : 0 });
              }}
              className="form-input range-number"
            />
          </div>
          <small className="form-hint">
            0 = публиковать все лиды, 100 = только самые уверенные
          </small>
          <small className="form-hint">
            Влияет только на публикацию в Telegram, поиск лидов не меняется
          </small>
        </div>

        {/* Lead Detection Criteria */}
        <div className="form-section">
          <h3>Критерии определения лидов</h3>
          <p className="section-description">
            Опишите, какие сообщения должны определяться как лиды
          </p>
          <textarea
            value={config.leadPrompt}
            onChange={(e) => setConfig({ ...config, leadPrompt: e.target.value })}
            placeholder="Пример: Определяй сообщения, где люди ищут услуги веб-разработки, упоминают что им нужен сайт или ищут разработчика. Также включай сообщения о разработке мобильных приложений, e-commerce решениях или техническом консалтинге."
            className="form-textarea"
            rows={8}
            required
          />
          <small className="form-hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Будьте конкретны! AI будет использовать это для определения лидов.</span>
            <span style={{ color: config.leadPrompt.length > LEAD_PROMPT_MAX_LENGTH ? '#e74c3c' : config.leadPrompt.length > LEAD_PROMPT_WARNING_LENGTH ? '#f39c12' : '#888' }}>
              {config.leadPrompt.length}/{LEAD_PROMPT_MAX_LENGTH}
            </span>
          </small>
        </div>

        {/* Message Suggestion Prompt */}
        <div className="form-section">
          <h3>Подсказки для сообщений (опционально)</h3>
          <p className="section-description">
            Инструкции для AI по генерации первых сообщений для менеджеров по продажам
          </p>
          <textarea
            value={config.messagePrompt}
            onChange={(e) => setConfig({ ...config, messagePrompt: e.target.value })}
            placeholder="Пример: Создай дружелюбное, персонализированное первое сообщение. Упомяни их конкретную потребность, предложи помощь и предложи быстрый звонок. Делай коротко (2-3 предложения) и профессионально."
            className="form-textarea"
            rows={5}
          />
          <small className="form-hint">
            AI будет генерировать предложение сообщения для каждого лида на основе этих инструкций. Оставьте пустым чтобы отключить.
          </small>
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary btn-large"
          >
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>
      </form>

      {/* Scanner Status (Read-Only) */}
      <div className="scanner-status-panel">
        <div className="panel-header">
          <h3>Статус сканера</h3>
          {scannerStatus && (
            <div className="status-badge">
              <span className={`status-dot ${scannerStatus.isRunning ? 'active' : 'inactive'}`}></span>
              <span className="status-text">
                {scannerStatus.isRunning ? 'Работает 24/7' : 'Остановлен'}
              </span>
            </div>
          )}
        </div>

        <div className="panel-content">
          <div className="info-box">
            <div className="info-icon">ℹ️</div>
            <div className="info-text">
              <p className="info-title">Сканер работает автоматически круглосуточно</p>
              <p className="info-description">
                Система постоянно анализирует новые сообщения для всех активных пользователей. 
                Используйте тумблер "Активно/Приостановлено" выше, чтобы включить или приостановить 
                анализ сообщений для вашей компании.
              </p>
            </div>
          </div>

          {scannerStatus?.isRunning && scannerStatus.subscribedAt && (
            <p className="scanner-info">
              <strong>Запущен:</strong> {new Date(scannerStatus.subscribedAt).toLocaleString('ru-RU')}
            </p>
          )}

          {scannerStatus?.pendingBatchSize > 0 && (
            <p className="scanner-info">
              <strong>В обработке:</strong> {scannerStatus.pendingBatchSize} сообщений
            </p>
          )}
        </div>
      </div>

      {/* Analysis Kill-Switch (Admin Only) */}
      {isAdmin && (
        <div className="classifier-panel">
          <div className="panel-header">
            <h3>⚙️ Анализ лидов — рубильник</h3>
            <div className="classifier-toggle-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={analysisEnabled}
                  onChange={handleToggleAnalysis}
                  disabled={analysisLoading}
                  className="toggle-input"
                />
                <span className="toggle-slider"></span>
                <span className="toggle-text">
                  {analysisLoading ? 'Переключение...' : analysisEnabled ? 'Включён' : 'Выключен'}
                </span>
              </label>
            </div>
          </div>
          <div className="panel-content">
            <p className="classifier-description">
              Глобальный рубильник AI-анализа для всех клиентов. Когда выключен — ноль
              обращений к нейросети и ноль расходов на API, при этом приложение
              продолжает работать (переживает «зависшую» паузу Timeweb и рестарты).
              Лиды на это время не находятся. Применяется в течение ~15 секунд.
            </p>
          </div>
        </div>
      )}

      {/* Category Classifier (Admin Only) */}
      {isAdmin && (
        <div className="classifier-panel">
          <div className="panel-header">
            <h3>Классификатор лидов по нишам</h3>
            <div className="classifier-toggle-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={classifierEnabled}
                  onChange={handleToggleClassifier}
                  disabled={classifierLoading}
                  className="toggle-input"
                />
                <span className="toggle-slider"></span>
                <span className="toggle-text">
                  {classifierLoading ? 'Переключение...' : classifierEnabled ? 'Включён' : 'Выключен'}
                </span>
              </label>
            </div>
          </div>

          <div className="panel-content">
            <p className="classifier-description">
              Автоматически анализирует входящие сообщения и распределяет лиды по 12 нишам
              (разработка, маркетинг, HR, дизайн и др.) для бота фрилансера.
            </p>

            {classifierRuntime && (
              <div className="classifier-runtime">
                <p className="scanner-info">
                  <strong>Обработано:</strong> {classifierRuntime.processedCount ?? 0} сообщений
                </p>
                <p className="scanner-info">
                  <strong>Найдено лидов:</strong> {classifierRuntime.savedCount ?? 0}
                </p>
              </div>
            )}

            {classifierStats && (
              <div className="classifier-stats">
                <p className="scanner-info">
                  <strong>Всего в базе:</strong> {classifierStats.total} лидов
                </p>
                {classifierStats.byCategory && classifierStats.byCategory.length > 0 && (
                  <div className="category-grid">
                    {classifierStats.byCategory.map(({ category, count }) => (
                      <div key={category} className="category-chip">
                        <span className="category-name">{categoryLabels[category] || category}</span>
                        <span className="category-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lead Bot (Admin Only) */}
      {isAdmin && (
        <div className="classifier-panel">
          <div className="panel-header">
            <h3>Telegram Lead Bot</h3>
            <div className="classifier-toggle-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={leadbotEnabled}
                  onChange={handleToggleLeadbot}
                  disabled={leadbotLoading}
                  className="toggle-input"
                />
                <span className="toggle-slider"></span>
                <span className="toggle-text">
                  {leadbotLoading ? 'Переключение...' : leadbotEnabled ? 'Включён' : 'Выключен'}
                </span>
              </label>
            </div>
          </div>

          <div className="panel-content">
            <p className="classifier-description">
              Telegram-бот доставляет категоризированные лиды пользователям.
              Модель freemium: 10 бесплатных лидов, далее подписка 990 руб/мес через YooKassa.
            </p>

            <div className="info-box" style={{ marginTop: '12px' }}>
              <div className="info-icon">ℹ️</div>
              <div className="info-text">
                <p className="info-title">Админ-команды бота</p>
                <p className="info-description">
                  <code>/grant &lt;telegram_id&gt; &lt;category&gt; &lt;days&gt;</code> — выдать
                  пользователю бесплатный доступ к категории на N дней.
                </p>
              </div>
            </div>

            {leadbotStats && (
              <div className="classifier-stats" style={{ marginTop: '12px' }}>
                <p className="scanner-info">
                  <strong>Всего лидов в фиде:</strong> {leadbotStats.totalLeads}
                </p>
                <p className="scanner-info">
                  <strong>Лидов за 24ч:</strong> {leadbotStats.leadsLast24h}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Configuration;









