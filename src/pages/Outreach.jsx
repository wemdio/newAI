import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Outreach.css';

const Outreach = () => {
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Accounts Form State
  const [accountForm, setAccountForm] = useState({
    phone_number: '',
    api_id: '',
    api_hash: '',
    session_string: '',
    proxy_url: ''
  });

  // Campaign Form State
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    message_template: '',
    auto_reply_enabled: false
  });

  // Targets Upload
  const [targetText, setTargetText] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFiles, setImportFiles] = useState([]);
  const [defaultProxy, setDefaultProxy] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'accounts') {
        const res = await api.get('/outreach/accounts');
        // Backend returns array directly for list endpoints
        setAccounts(Array.isArray(res.data) ? res.data : (res.data.accounts || []));
      } else if (activeTab === 'campaigns') {
        const res = await api.get('/outreach/campaigns');
        setCampaigns(Array.isArray(res.data) ? res.data : (res.data.campaigns || []));
      } else if (activeTab === 'logs') {
        const res = await api.get('/outreach/logs');
        setLogs(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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
      alert('Import failed: ' + (error.response?.data?.error || error.message));
      setLoading(false);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    try {
      await api.post('/outreach/accounts', accountForm);
      setAccountForm({ phone_number: '', api_id: '', api_hash: '', session_string: '', proxy_url: '' });
      fetchData();
      alert('Account added!');
    } catch (error) {
      alert('Error adding account: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Are you sure you want to delete this account?')) return;
    try {
      await api.delete(`/outreach/accounts/${id}`);
      setAccounts(prev => prev.filter(acc => acc.id !== id));
    } catch (error) {
      alert('Failed to delete: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      // Account selection logic needed (checkboxes). For now, use ALL accounts or none.
      // Let's just pass empty array for now.
      await api.post('/outreach/campaigns', { ...campaignForm, account_ids: [] });
      setCampaignForm({ name: '', message_template: '' });
      fetchData();
      alert('Campaign created!');
    } catch (error) {
      alert('Error creating campaign: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUploadTargets = async () => {
    if (!selectedCampaignId || !targetText) return;
    
    // Parse targets (one per line)
    const lines = targetText.split('\n').map(l => l.trim()).filter(l => l);
    const targets = lines.map(l => {
      if (l.startsWith('@')) return { username: l };
      return { phone: l }; // simplistic check
    });

    try {
      await api.post(`/outreach/campaigns/${selectedCampaignId}/targets`, { targets });
      setTargetText('');
      alert(`Uploaded ${targets.length} targets!`);
    } catch (error) {
      alert('Error uploading targets: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="outreach-page">
      <h1>TG Outreach Manager</h1>
      
      <div className="outreach-tabs">
        <button className={`tab-button ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>Accounts</button>
        <button className={`tab-button ${activeTab === 'campaigns' ? 'active' : ''}`} onClick={() => setActiveTab('campaigns')}>Campaigns</button>
        <button className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Logs</button>
      </div>

      <div className="tab-content">
        {activeTab === 'accounts' && (
          <section className="outreach-section">
            <div className="section-header">
                <h2>Manage Accounts</h2>
                <button className="btn btn-secondary" onClick={() => setShowImportModal(true)} style={{ marginLeft: '10px' }}>
                  Import ZIP (Session+JSON)
                </button>
            </div>
            
            <form onSubmit={handleAddAccount} className="add-form" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxWidth: '500px' }}>
              <h3>Add Single Account</h3>
              <input placeholder="Phone (+1...)" value={accountForm.phone_number} onChange={e => setAccountForm({...accountForm, phone_number: e.target.value})} required className="chat-input" />
              <input placeholder="API ID" value={accountForm.api_id} onChange={e => setAccountForm({...accountForm, api_id: e.target.value})} className="chat-input" />
              <input placeholder="API Hash" value={accountForm.api_hash} onChange={e => setAccountForm({...accountForm, api_hash: e.target.value})} className="chat-input" />
              <input placeholder="Session String" value={accountForm.session_string} onChange={e => setAccountForm({...accountForm, session_string: e.target.value})} required className="chat-input" />
              <input placeholder="Proxy (socks5://user:pass@host:port)" value={accountForm.proxy_url} onChange={e => setAccountForm({...accountForm, proxy_url: e.target.value})} className="chat-input" />
              <button type="submit" className="btn btn-primary">Add Account</button>
            </form>

            <div className="accounts-list">
              {loading ? <p>Loading...</p> : (
                accounts.length === 0 ? <p>No accounts found.</p> :
                accounts.map(acc => (
                  <div key={acc.id} className="account-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <h3>{acc.phone_number}</h3>
                        <button 
                            className="btn" 
                            style={{ background: '#ff4444', color: 'white', padding: '5px 10px', fontSize: '12px' }}
                            onClick={() => handleDeleteAccount(acc.id)}
                        >
                            ✕
                        </button>
                    </div>
                    <p>Status: <span style={{ color: acc.status === 'active' ? '#7dd17d' : '#aaa' }}>{acc.status}</span></p>
                    <p style={{ fontSize: '12px', color: '#888' }}>Import Status: {acc.import_status || 'N/A'}</p>
                    {acc.proxy_url && (
                        <p style={{ fontSize: '12px', color: '#666', wordBreak: 'break-all' }}>
                            Proxy: {acc.proxy_url}
                        </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'campaigns' && (
          <section className="outreach-section">
             <div className="section-header">
                <h2>Manage Campaigns</h2>
            </div>
            <form onSubmit={handleCreateCampaign} className="add-form" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxWidth: '500px' }}>
              <input placeholder="Campaign Name" value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm, name: e.target.value})} required className="chat-input" />
              <textarea placeholder="Message Template" value={campaignForm.message_template} onChange={e => setCampaignForm({...campaignForm, message_template: e.target.value})} required className="chat-input" style={{ minHeight: '100px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
                <input 
                    type="checkbox" 
                    id="auto_reply"
                    checked={campaignForm.auto_reply_enabled}
                    onChange={e => setCampaignForm({...campaignForm, auto_reply_enabled: e.target.checked})}
                    style={{ width: 'auto' }}
                />
                <label htmlFor="auto_reply" style={{ color: '#ccc', cursor: 'pointer' }}>Enable AI Auto-Reply</label>
              </div>

              <button type="submit" className="btn btn-primary">Create Campaign</button>
            </form>

            <div className="campaigns-list">
              {loading ? <p>Loading...</p> : (
                campaigns.length === 0 ? <p>No campaigns found.</p> :
                campaigns.map(camp => (
                  <div key={camp.id} className="campaign-card">
                    <h3>{camp.name} ({camp.status})</h3>
                    <p className="template-preview">{camp.message_template}</p>
                    
                    <div className="target-upload" style={{ marginTop: '15px', borderTop: '1px solid #333', paddingTop: '10px' }}>
                      <h4>Add Targets</h4>
                      <textarea 
                        placeholder="@username1&#10;@username2" 
                        className="chat-input"
                        style={{ width: '100%', minHeight: '60px', marginBottom: '10px' }}
                        onChange={e => {
                          setTargetText(e.target.value);
                          setSelectedCampaignId(camp.id);
                        }}
                        disabled={selectedCampaignId !== null && selectedCampaignId !== camp.id && targetText !== ''}
                        value={selectedCampaignId === camp.id ? targetText : ''}
                      />
                      {selectedCampaignId === camp.id && targetText && (
                        <button onClick={handleUploadTargets} className="btn btn-secondary">Upload Targets</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === 'logs' && (
          <section className="outreach-section">
            <div className="section-header">
                <h2>Worker Logs</h2>
                <button className="btn btn-secondary" onClick={fetchData}>Refresh</button>
            </div>
            <div className="logs-container" style={{ maxHeight: '500px', overflowY: 'auto', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                {logs.length === 0 ? <p style={{color: '#666'}}>No logs found.</p> : logs.map(log => (
                    <div key={log.id} style={{ marginBottom: '8px', fontFamily: 'monospace', fontSize: '13px', borderBottom: '1px solid #222', paddingBottom: '4px' }}>
                        <span style={{ color: '#666', marginRight: '10px' }}>{new Date(log.created_at).toLocaleTimeString()}</span>
                        <span style={{ 
                            color: log.level === 'ERROR' ? '#ff4444' : 
                                   log.level === 'SUCCESS' ? '#7dd17d' : 
                                   log.level === 'INFO' ? '#4fc3f7' : '#ddd',
                            fontWeight: 'bold',
                            marginRight: '10px',
                            display: 'inline-block',
                            minWidth: '60px'
                        }}>[{log.level}]</span>
                        <span style={{ color: '#ccc' }}>{log.message}</span>
                    </div>
                ))}
            </div>
          </section>
        )}
      </div>

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Import Accounts (ZIP)</h2>
            <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '15px' }}>
              Upload ZIP file(s) containing pairs of .session and .json files.
            </p>
            <form onSubmit={handleImport}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>ZIP File(s):</label>
                <input 
                  type="file" 
                  accept=".zip" 
                  multiple
                  onChange={e => setImportFiles(e.target.files)} 
                  required 
                  className="chat-input"
                />
                <small style={{ color: '#888', display: 'block', marginTop: '5px' }}>
                    {importFiles.length > 0 ? `${importFiles.length} file(s) selected` : ''}
                </small>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Default Proxy (Optional):</label>
                <input 
                  type="text" 
                  placeholder="socks5://user:pass@host:port" 
                  value={defaultProxy} 
                  onChange={e => setDefaultProxy(e.target.value)} 
                  className="chat-input"
                />
                <small style={{ color: '#666' }}>Used if proxy is missing in JSON</small>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowImportModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Uploading...' : 'Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Outreach;