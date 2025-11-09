import React, { useState, useEffect } from 'react';
import { configApi, scannerApi } from '../services/api';
import './Configuration.css';

function Configuration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [configExists, setConfigExists] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState(null); // Store masked key
  const [config, setConfig] = useState({
    openrouterApiKey: '',
    leadPrompt: '',
    messagePrompt: '',
    telegramChannelId: '',
    isActive: true
  });

  // Scanner control state
  const [scannerStatus, setScannerStatus] = useState(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState(null);

  useEffect(() => {
    loadConfiguration();
    loadScannerStatus();
    
    // Poll scanner status every 5 seconds
    const interval = setInterval(loadScannerStatus, 5000);
    return () => clearInterval(interval);
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
          isActive: response.data.config.is_active !== false
        });
      }
    } catch (err) {
      if (err.response?.status === 404) {
        // 404 is OK - means first time setup
        setConfigExists(false);
      } else {
        setError(err.response?.data?.message || 'Failed to load configuration');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!config.leadPrompt.trim()) {
      setError('Lead detection criteria is required');
      return;
    }
    if (!config.telegramChannelId.trim()) {
      setError('Telegram channel ID is required');
      return;
    }
    
    // API key is required only for new configs OR if user wants to update it
    const isUpdatingApiKey = config.openrouterApiKey.trim().length > 0;
    if (!configExists && !isUpdatingApiKey) {
      setError('OpenRouter API key is required for first-time setup');
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
      setError(err.response?.data?.message || 'Failed to save configuration');
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
      setError(err.response?.data?.message || 'Failed to update status');
    }
  };

  const loadScannerStatus = async () => {
    try {
      const response = await scannerApi.status();
      setScannerStatus(response.data.status);
      setScannerError(null);
    } catch (err) {
      console.error('Scanner status error:', err);
    }
  };

  const handleStartScanner = async () => {
    try {
      setScannerLoading(true);
      setScannerError(null);
      await scannerApi.start();
      await loadScannerStatus();
    } catch (err) {
      setScannerError(err.response?.data?.message || 'Failed to start scanner');
    } finally {
      setScannerLoading(false);
    }
  };

  const handleStopScanner = async () => {
    try {
      setScannerLoading(true);
      setScannerError(null);
      await scannerApi.stop();
      await loadScannerStatus();
    } catch (err) {
      setScannerError(err.response?.data?.message || 'Failed to stop scanner');
    } finally {
      setScannerLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading configuration...</div>;
  }

  return (
    <div className="configuration">
      <div className="config-header">
        <h2>Configuration</h2>
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
              {config.isActive ? 'Active' : 'Paused'}
            </span>
          </label>
        </div>
      </div>

      {!configExists && !error && (
        <div className="alert alert-info">
          Welcome! This is your first time setting up. Please fill in all the fields below to get started.
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          Configuration saved successfully!
        </div>
      )}

      <form onSubmit={handleSubmit} className="config-form">
        {/* OpenRouter API Key */}
        <div className="form-section">
          <h3>OpenRouter API Key</h3>
          <p className="section-description">
            Your OpenRouter API key for AI analysis. Get it from{' '}
            <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer">
              openrouter.ai
            </a>
          </p>
          {maskedApiKey && (
            <div className="alert alert-info" style={{ marginBottom: '10px' }}>
              API Key already set: {maskedApiKey}
            </div>
          )}
          <input
            type="password"
            value={config.openrouterApiKey}
            onChange={(e) => setConfig({ ...config, openrouterApiKey: e.target.value })}
            placeholder={maskedApiKey ? "Leave empty to keep current key" : "sk-or-v1-..."}
            className="form-input"
            required={!configExists}
          />
          <small className="form-hint">
            {maskedApiKey 
              ? "Enter a new key only if you want to update it"
              : "Your API key is encrypted and stored securely"}
          </small>
        </div>

        {/* Telegram Channel ID */}
        <div className="form-section">
          <h3>Telegram Channel ID</h3>
          <p className="section-description">
            Your private Telegram channel where leads will be posted
          </p>
          <input
            type="text"
            value={config.telegramChannelId}
            onChange={(e) => setConfig({ ...config, telegramChannelId: e.target.value })}
            placeholder="@your_channel or -100123456789"
            className="form-input"
            required
          />
          <small className="form-hint">
            Format: @channel_name or numeric ID (e.g., -100123456789)
          </small>
        </div>

        {/* Lead Detection Criteria */}
        <div className="form-section">
          <h3>Lead Detection Criteria</h3>
          <p className="section-description">
            Describe what kind of messages should be identified as leads
          </p>
          <textarea
            value={config.leadPrompt}
            onChange={(e) => setConfig({ ...config, leadPrompt: e.target.value })}
            placeholder="Example: Identify messages where people are looking for web development services, mentioning they need a website or looking for a developer. Also include messages about mobile app development, e-commerce solutions, or technical consulting."
            className="form-textarea"
            rows={8}
            required
          />
          <small className="form-hint">
            Be specific! The AI will use this to determine what counts as a lead.
          </small>
        </div>

        {/* Message Suggestion Prompt */}
        <div className="form-section">
          <h3>Message Suggestion Prompt (Optional)</h3>
          <p className="section-description">
            Instructions for AI to generate first message suggestions for sales managers
          </p>
          <textarea
            value={config.messagePrompt}
            onChange={(e) => setConfig({ ...config, messagePrompt: e.target.value })}
            placeholder="Example: Generate a friendly, personalized first message. Mention their specific need, offer help, and suggest a quick call. Keep it short (2-3 sentences) and professional."
            className="form-textarea"
            rows={5}
          />
          <small className="form-hint">
            AI will generate a message suggestion for each lead based on these instructions. Leave empty to disable.
          </small>
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary btn-large"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {/* Scanner Control Panel */}
      <div className="scanner-control-panel">
        <div className="panel-header">
          <h3>Scanner Control</h3>
          {scannerStatus && (
            <div className="status-badge">
              <span className={`status-dot ${scannerStatus.isRunning ? 'active' : 'inactive'}`}></span>
              <span className="status-text">
                {scannerStatus.isRunning ? 'Active' : 'Stopped'}
              </span>
            </div>
          )}
        </div>

        <div className="panel-content">
          <p className="panel-description">
            {scannerStatus?.isRunning 
              ? 'Scanner is running and analyzing new messages in real-time'
              : 'Scanner is stopped. Click "Start" to begin analyzing new messages'}
          </p>

          {scannerStatus?.isRunning && scannerStatus.subscribedAt && (
            <p className="scanner-info">
              Started: {new Date(scannerStatus.subscribedAt).toLocaleString('en-US')}
            </p>
          )}

          <div className="scanner-buttons">
            {scannerStatus?.isRunning ? (
              <button 
                onClick={handleStopScanner} 
                disabled={scannerLoading}
                className="btn-danger btn-large"
              >
                {scannerLoading ? 'Stopping...' : 'Stop Scanner'}
              </button>
            ) : (
              <button 
                onClick={handleStartScanner} 
                disabled={scannerLoading}
                className="btn-success btn-large"
              >
                {scannerLoading ? 'Starting...' : 'Start Scanner'}
              </button>
            )}
          </div>

          {scannerError && (
            <div className="alert alert-error" style={{ marginTop: '15px' }}>
              {scannerError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Configuration;










