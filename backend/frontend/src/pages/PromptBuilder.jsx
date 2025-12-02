import React, { useState } from 'react';
import axios from 'axios';
import './PromptBuilder.css';

const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api');

const PromptBuilder = () => {
  const [activeMode, setActiveMode] = useState('create'); // 'create' | 'improve'
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Create mode state
  const [briefData, setBriefData] = useState({
    companyName: '',
    industry: '',
    services: '',
    notServices: '',
    restrictions: '',
    targetAudience: '',
    decisionMaker: '',
    notClient: '',
    painPoints: '',
    triggerEvents: '',
    clientPhrases: '',
    industryTerms: '',
    simpleTerms: '',
    positiveMarkers: '',
    negativeMarkers: '',
    competitors: '',
    confusedServices: '',
    idealLeadExamples: '',
    notLeadExamples: '',
    additionalNotes: ''
  });

  // Improve mode state
  const [improveData, setImproveData] = useState({
    currentPrompt: '',
    foundLeads: '',
    feedback: '',
    apiKey: ''
  });

  const handleBriefChange = (field, value) => {
    setBriefData(prev => ({ ...prev, [field]: value }));
  };

  const handleImproveChange = (field, value) => {
    setImproveData(prev => ({ ...prev, [field]: value }));
  };

  const generatePromptFromBrief = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post(`${API_URL}/prompt/generate`, {
        brief: briefData
      });

      if (response.data.success) {
        setResult({
          type: 'generated',
          prompt: response.data.prompt,
          explanation: response.data.explanation
        });
      } else {
        setError(response.data.error || 'Ошибка генерации промпта');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const improvePrompt = async () => {
    if (!improveData.currentPrompt) {
      setError('Введите текущий промпт');
      return;
    }
    if (!improveData.apiKey) {
      setError('Введите OpenRouter API ключ');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post(`${API_URL}/prompt/improve`, {
        currentPrompt: improveData.currentPrompt,
        foundLeads: improveData.foundLeads,
        feedback: improveData.feedback,
        apiKey: improveData.apiKey
      });

      if (response.data.success) {
        setResult({
          type: 'improved',
          prompt: response.data.improvedPrompt,
          changes: response.data.changes,
          analysis: response.data.analysis
        });
      } else {
        setError(response.data.error || 'Ошибка улучшения промпта');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Промпт скопирован в буфер обмена!');
  };

  return (
    <div className="prompt-builder">
      <div className="prompt-header">
        <h1>🔧 Конструктор промптов</h1>
        <p className="subtitle">Создание и улучшение промптов для поиска лидов</p>
      </div>

      {/* Mode Tabs */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${activeMode === 'create' ? 'active' : ''}`}
          onClick={() => setActiveMode('create')}
        >
          📝 Создать из брифа
        </button>
        <button
          className={`mode-tab ${activeMode === 'improve' ? 'active' : ''}`}
          onClick={() => setActiveMode('improve')}
        >
          🔄 Улучшить промпт
        </button>
      </div>

      {/* Create Mode */}
      {activeMode === 'create' && (
        <div className="create-mode">
          <div className="brief-form">
            <h2>📋 Заполните бриф</h2>
            
            <div className="form-section">
              <h3>О компании</h3>
              <div className="form-group">
                <label>Название компании</label>
                <input
                  type="text"
                  value={briefData.companyName}
                  onChange={(e) => handleBriefChange('companyName', e.target.value)}
                  placeholder="ООО Рога и Копыта"
                />
              </div>
              <div className="form-group">
                <label>Сфера деятельности</label>
                <input
                  type="text"
                  value={briefData.industry}
                  onChange={(e) => handleBriefChange('industry', e.target.value)}
                  placeholder="B2B лидогенерация, образовательные услуги..."
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Услуги / Продукты</h3>
              <div className="form-group">
                <label>Что вы продаёте? (подробно)</label>
                <textarea
                  value={briefData.services}
                  onChange={(e) => handleBriefChange('services', e.target.value)}
                  placeholder="Опишите ваши услуги или продукты максимально подробно..."
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>Что вы НЕ делаете? (часто путают)</label>
                <textarea
                  value={briefData.notServices}
                  onChange={(e) => handleBriefChange('notServices', e.target.value)}
                  placeholder="Какие услуги вы не оказываете, но клиенты часто спрашивают..."
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Ограничения (география, лицензии, мин. чек)</label>
                <textarea
                  value={briefData.restrictions}
                  onChange={(e) => handleBriefChange('restrictions', e.target.value)}
                  placeholder="Только РФ, нет лицензии на медицину, минимальный заказ от 50к..."
                  rows={2}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Целевая аудитория</h3>
              <div className="form-group">
                <label>Кто ваш идеальный клиент?</label>
                <textarea
                  value={briefData.targetAudience}
                  onChange={(e) => handleBriefChange('targetAudience', e.target.value)}
                  placeholder="B2B компании, стартапы, SaaS, IT-компании с отделом продаж..."
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Кто принимает решение о покупке? (ЛПР)</label>
                <input
                  type="text"
                  value={briefData.decisionMaker}
                  onChange={(e) => handleBriefChange('decisionMaker', e.target.value)}
                  placeholder="CEO, директор по маркетингу, руководитель отдела продаж..."
                />
              </div>
              <div className="form-group">
                <label>Кто точно НЕ ваш клиент?</label>
                <textarea
                  value={briefData.notClient}
                  onChange={(e) => handleBriefChange('notClient', e.target.value)}
                  placeholder="B2C бизнесы, маркетплейсы, фрилансеры без бюджета..."
                  rows={2}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Боли и потребности</h3>
              <div className="form-group">
                <label>С какими проблемами приходят клиенты?</label>
                <textarea
                  value={briefData.painPoints}
                  onChange={(e) => handleBriefChange('painPoints', e.target.value)}
                  placeholder="Нет лидов, пустой пайплайн, не умеют делать холодные продажи..."
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>Триггерные события (что заставляет искать услугу)</label>
                <textarea
                  value={briefData.triggerEvents}
                  onChange={(e) => handleBriefChange('triggerEvents', e.target.value)}
                  placeholder="Запуск нового продукта, выход на новый рынок, проверка..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>Как клиенты формулируют запрос? (примеры фраз)</label>
                <textarea
                  value={briefData.clientPhrases}
                  onChange={(e) => handleBriefChange('clientPhrases', e.target.value)}
                  placeholder='"Ищу лидогенератора", "Нужен трафик B2B", "Кто делает холодные рассылки?"...'
                  rows={3}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Ключевые слова</h3>
              <div className="form-group">
                <label>Профессиональные термины отрасли</label>
                <textarea
                  value={briefData.industryTerms}
                  onChange={(e) => handleBriefChange('industryTerms', e.target.value)}
                  placeholder="Аутрич, лидген, пайплайн, Lemlist, Apollo, прогрев доменов..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>Как называют "по-простому" (сленг)</label>
                <textarea
                  value={briefData.simpleTerms}
                  onChange={(e) => handleBriefChange('simpleTerms', e.target.value)}
                  placeholder="Холодные письма, рассылка, сбор базы, парсинг..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>Слова-маркеры "это наш клиент"</label>
                <input
                  type="text"
                  value={briefData.positiveMarkers}
                  onChange={(e) => handleBriefChange('positiveMarkers', e.target.value)}
                  placeholder="ищу, нужен, посоветуйте, кто делает..."
                />
              </div>
              <div className="form-group">
                <label>Слова-маркеры "это НЕ наш клиент"</label>
                <input
                  type="text"
                  value={briefData.negativeMarkers}
                  onChange={(e) => handleBriefChange('negativeMarkers', e.target.value)}
                  placeholder="зарплата, в штат, резюме, предлагаю услуги..."
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Конкуренты</h3>
              <div className="form-group">
                <label>Основные конкуренты</label>
                <input
                  type="text"
                  value={briefData.competitors}
                  onChange={(e) => handleBriefChange('competitors', e.target.value)}
                  placeholder="Названия компаний-конкурентов..."
                />
              </div>
              <div className="form-group">
                <label>Смежные услуги (часто путают с вашими)</label>
                <textarea
                  value={briefData.confusedServices}
                  onChange={(e) => handleBriefChange('confusedServices', e.target.value)}
                  placeholder="Таргетированная реклама, контекст, SMM..."
                  rows={2}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Примеры</h3>
              <div className="form-group">
                <label>Примеры ИДЕАЛЬНОГО лида (2-3 примера)</label>
                <textarea
                  value={briefData.idealLeadExamples}
                  onChange={(e) => handleBriefChange('idealLeadExamples', e.target.value)}
                  placeholder='Пример 1: CEO стартапа пишет "Ищу команду для холодного аутрича, бюджет 100к/мес"...'
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>Примеры НЕЦЕЛЕВОГО обращения (2-3 примера)</label>
                <textarea
                  value={briefData.notLeadExamples}
                  onChange={(e) => handleBriefChange('notLeadExamples', e.target.value)}
                  placeholder='Пример 1: "Ищу менеджера по продажам в штат, ЗП 80к" - это вакансия...'
                  rows={4}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Дополнительно</h3>
              <div className="form-group">
                <label>Что ещё важно учесть?</label>
                <textarea
                  value={briefData.additionalNotes}
                  onChange={(e) => handleBriefChange('additionalNotes', e.target.value)}
                  placeholder="Любая дополнительная информация..."
                  rows={3}
                />
              </div>
            </div>

            <button
              className="btn-generate"
              onClick={generatePromptFromBrief}
              disabled={loading}
            >
              {loading ? '⏳ Генерация...' : '🚀 Сгенерировать промпт'}
            </button>
          </div>
        </div>
      )}

      {/* Improve Mode */}
      {activeMode === 'improve' && (
        <div className="improve-mode">
          <div className="improve-form">
            <h2>🔄 Улучшение промпта</h2>
            <p className="mode-description">
              Вставьте текущий промпт и примеры найденных лидов. AI проанализирует и предложит улучшения.
            </p>

            <div className="form-group">
              <label>OpenRouter API ключ *</label>
              <input
                type="password"
                value={improveData.apiKey}
                onChange={(e) => handleImproveChange('apiKey', e.target.value)}
                placeholder="sk-or-..."
              />
            </div>

            <div className="form-group">
              <label>Текущий промпт *</label>
              <textarea
                value={improveData.currentPrompt}
                onChange={(e) => handleImproveChange('currentPrompt', e.target.value)}
                placeholder="Вставьте сюда ваш текущий промпт..."
                rows={10}
              />
            </div>

            <div className="form-group">
              <label>Найденные лиды (для анализа)</label>
              <textarea
                value={improveData.foundLeads}
                onChange={(e) => handleImproveChange('foundLeads', e.target.value)}
                placeholder="Вставьте примеры лидов, которые нашла система. Укажите какие хорошие, какие плохие..."
                rows={8}
              />
            </div>

            <div className="form-group">
              <label>Что не нравится? Что улучшить?</label>
              <textarea
                value={improveData.feedback}
                onChange={(e) => handleImproveChange('feedback', e.target.value)}
                placeholder="Например: находит много вакансий, пропускает лидов с определёнными словами, слишком много ложных срабатываний..."
                rows={4}
              />
            </div>

            <button
              className="btn-improve"
              onClick={improvePrompt}
              disabled={loading}
            >
              {loading ? '⏳ Анализ...' : '🔍 Проанализировать и улучшить'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="result-section">
          <h2>
            {result.type === 'generated' ? '✅ Сгенерированный промпт' : '✅ Улучшенный промпт'}
          </h2>

          {result.analysis && (
            <div className="analysis-block">
              <h3>📊 Анализ текущего промпта:</h3>
              <pre>{result.analysis}</pre>
            </div>
          )}

          {result.changes && (
            <div className="changes-block">
              <h3>🔄 Внесённые изменения:</h3>
              <pre>{result.changes}</pre>
            </div>
          )}

          {result.explanation && (
            <div className="explanation-block">
              <h3>💡 Пояснение:</h3>
              <pre>{result.explanation}</pre>
            </div>
          )}

          <div className="prompt-result">
            <div className="prompt-header-row">
              <h3>📝 Промпт:</h3>
              <button
                className="btn-copy"
                onClick={() => copyToClipboard(result.prompt)}
              >
                📋 Копировать
              </button>
            </div>
            <pre className="prompt-text">{result.prompt}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptBuilder;

