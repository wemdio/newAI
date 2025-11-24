import React, { useState } from 'react';
import { auditApi } from '../services/api';
import './Configuration.css';

function LeadAudit() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  const [form, setForm] = useState({
    openRouterKey: '',
    channelId: '',
    daysBack: 7,
    leadPrompt: ''
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.openRouterKey || !form.channelId || !form.leadPrompt) {
      setError('Please fill all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await auditApi.run(form);
      setResults(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="configuration">
      <div className="config-header">
        <h2>🔍 Lead Magnet / Audit (Internal)</h2>
      </div>

      <div className="alert alert-info">
        This tool scans PAST messages (last N days) using a specific prompt and posts matches to a Telegram channel.
        Useful for generating a "Lead Magnet" report for potential clients.
      </div>

      {results && (
        <div className="alert alert-success" style={{ whiteSpace: 'pre-line' }}>
          <h3>✅ Audit Complete</h3>
          <p><strong>Found Leads:</strong> {results.found}</p>
          <p><strong>Posted to Channel:</strong> {results.posted}</p>
          <p><strong>Failed to Post:</strong> {results.failed}</p>
          <p><strong>Messages Analyzed:</strong> {results.totalAnalyzed}</p>
          <p><strong>Messages Fetched:</strong> {results.totalFetched}</p>
          <p><strong>Duration:</strong> {(results.duration / 1000).toFixed(1)}s</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="config-form">
        
        <div className="form-section">
          <h3>1. OpenRouter API Key</h3>
          <p className="section-description">API key to use for this specific audit run.</p>
          <input
            type="password"
            value={form.openRouterKey}
            onChange={(e) => handleChange('openRouterKey', e.target.value)}
            placeholder="sk-or-..."
            className="form-input"
            required
          />
        </div>

        <div className="form-section">
          <h3>2. Target Telegram Channel ID</h3>
          <p className="section-description">Where to post the found leads.</p>
          <input
            type="text"
            value={form.channelId}
            onChange={(e) => handleChange('channelId', e.target.value)}
            placeholder="@channel or -100..."
            className="form-input"
            required
          />
        </div>

        <div className="form-section">
          <h3>3. Scan Depth (Days)</h3>
          <p className="section-description">How far back to look in the message history.</p>
          <input
            type="number"
            value={form.daysBack}
            onChange={(e) => handleChange('daysBack', parseInt(e.target.value))}
            min="1"
            max="30"
            className="form-input"
            required
          />
        </div>

        <div className="form-section">
          <h3>4. Lead Criteria (Prompt)</h3>
          <p className="section-description">
            Describe exactly what the client is looking for.
            This will be used as the system prompt for AI analysis.
          </p>
          <textarea
            value={form.leadPrompt}
            onChange={(e) => handleChange('leadPrompt', e.target.value)}
            placeholder="Example: Find companies looking for React developers..."
            className="form-textarea"
            rows={10}
            required
          />
        </div>

        <div className="form-actions">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-large"
            style={{ backgroundColor: '#9c27b0' }} // Distinct purple color for audit
          >
            {loading ? 'Running Audit (Please Wait)...' : '🚀 Run Lead Audit'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LeadAudit;

