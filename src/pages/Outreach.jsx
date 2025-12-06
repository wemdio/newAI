import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Outreach.css'; // We'll create this next
import { API_URL } from '../services/api';

const Outreach = () => {
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
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
    message_template: ''
  });

  // Targets Upload
  const [targetText, setTargetText] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-user-id': (await import('../supabaseClient')).default.auth.getUser().then(u => u.data.user.id)
      };

      // Note: In real app, use proper auth token. 
      // For now, we assume Supabase auth header or x-user-id is handled.
      // Let's use the existing axios instance or fetch if possible.
      // But I see 'axios' import.
      // I need to attach user ID.
      
      const user = (await import('../supabaseClient')).default.auth.getSession().then(s => s.data.session?.user);
      if (!user) return;

      if (activeTab === 'accounts') {
        const res = await axios.get(`${API_URL}/outreach/accounts`, { headers: { 'x-user-id': user.id } });
        setAccounts(res.data);
      } else if (activeTab === 'campaigns') {
        const res = await axios.get(`${API_URL}/outreach/campaigns`, { headers: { 'x-user-id': user.id } });
        setCampaigns(res.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    try {
      const user = (await import('../supabaseClient')).default.auth.getSession().then(s => s.data.session?.user);
      await axios.post(`${API_URL}/outreach/accounts`, accountForm, { headers: { 'x-user-id': user.id } });
      setAccountForm({ phone_number: '', api_id: '', api_hash: '', session_string: '', proxy_url: '' });
      fetchData();
      alert('Account added!');
    } catch (error) {
      alert('Error adding account: ' + error.message);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      const user = (await import('../supabaseClient')).default.auth.getSession().then(s => s.data.session?.user);
      // Account selection logic needed (checkboxes). For now, use ALL accounts or none.
      // Let's just pass empty array for now.
      await axios.post(`${API_URL}/outreach/campaigns`, campaignForm, { headers: { 'x-user-id': user.id } });
      setCampaignForm({ name: '', message_template: '' });
      fetchData();
      alert('Campaign created!');
    } catch (error) {
      alert('Error creating campaign: ' + error.message);
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
      const user = (await import('../supabaseClient')).default.auth.getSession().then(s => s.data.session?.user);
      await axios.post(`${API_URL}/outreach/campaigns/${selectedCampaignId}/targets`, { targets }, { headers: { 'x-user-id': user.id } });
      setTargetText('');
      alert(`Uploaded ${targets.length} targets!`);
    } catch (error) {
      alert('Error uploading targets: ' + error.message);
    }
  };

  return (
    <div className="outreach-page">
      <h1>TG Outreach Manager</h1>
      
      <div className="tabs">
        <button className={activeTab === 'accounts' ? 'active' : ''} onClick={() => setActiveTab('accounts')}>Accounts</button>
        <button className={activeTab === 'campaigns' ? 'active' : ''} onClick={() => setActiveTab('campaigns')}>Campaigns</button>
      </div>

      <div className="tab-content">
        {activeTab === 'accounts' && (
          <div className="accounts-section">
            <form onSubmit={handleAddAccount} className="add-form">
              <h3>Add Account</h3>
              <input placeholder="Phone (+1...)" value={accountForm.phone_number} onChange={e => setAccountForm({...accountForm, phone_number: e.target.value})} required />
              <input placeholder="API ID" value={accountForm.api_id} onChange={e => setAccountForm({...accountForm, api_id: e.target.value})} />
              <input placeholder="API Hash" value={accountForm.api_hash} onChange={e => setAccountForm({...accountForm, api_hash: e.target.value})} />
              <input placeholder="Session String" value={accountForm.session_string} onChange={e => setAccountForm({...accountForm, session_string: e.target.value})} required />
              <input placeholder="Proxy (socks5://user:pass@host:port)" value={accountForm.proxy_url} onChange={e => setAccountForm({...accountForm, proxy_url: e.target.value})} />
              <button type="submit">Add Account</button>
            </form>

            <div className="list">
              <h3>Your Accounts</h3>
              {loading ? <p>Loading...</p> : (
                <ul>
                  {accounts.map(acc => (
                    <li key={acc.id}>{acc.phone_number} - {acc.status}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'campaigns' && (
          <div className="campaigns-section">
            <form onSubmit={handleCreateCampaign} className="add-form">
              <h3>Create Campaign</h3>
              <input placeholder="Campaign Name" value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm, name: e.target.value})} required />
              <textarea placeholder="Message Template" value={campaignForm.message_template} onChange={e => setCampaignForm({...campaignForm, message_template: e.target.value})} required />
              <button type="submit">Create Campaign</button>
            </form>

            <div className="list">
              <h3>Your Campaigns</h3>
              {loading ? <p>Loading...</p> : (
                <ul>
                  {campaigns.map(camp => (
                    <li key={camp.id} className="campaign-item">
                      <strong>{camp.name}</strong> ({camp.status})
                      <br/>
                      <small>{camp.message_template}</small>
                      
                      <div className="target-upload">
                        <h4>Add Targets</h4>
                        <textarea 
                          placeholder="@username1&#10;@username2" 
                          onChange={e => {
                            setTargetText(e.target.value);
                            setSelectedCampaignId(camp.id);
                          }}
                          disabled={selectedCampaignId !== null && selectedCampaignId !== camp.id && targetText !== ''}
                        />
                        {selectedCampaignId === camp.id && targetText && (
                          <button onClick={handleUploadTargets}>Upload Targets</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Outreach;

