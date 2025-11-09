import React, { useState, useEffect } from 'react';
import { leadsApi } from '../services/api';
import './Leads.css';

function Leads() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    minConfidence: 0,
    limit: 50,
    status: 'all'
  });
  const [selectedLeads, setSelectedLeads] = useState(new Set());

  useEffect(() => {
    loadLeads();
  }, [filters]);

  const loadLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        limit: filters.limit,
        min_confidence: filters.minConfidence
      };
      if (filters.status !== 'all') {
        params.lead_status = filters.status;
      }
      const response = await leadsApi.getAll(params);
      setLeads(response.data.leads || []);
      setSelectedLeads(new Set()); // Clear selection on reload
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load leads');
      console.error('Leads error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (leadId, status) => {
    try {
      await leadsApi.update(leadId, { lead_status: status });
      setLeads(leads.map(lead => 
        lead.id === leadId ? { ...lead, lead_status: status } : lead
      ));
    } catch (err) {
      alert('Failed to update lead status');
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!confirm('Delete this lead?')) return;
    
    try {
      await leadsApi.delete(leadId);
      setLeads(leads.filter(lead => lead.id !== leadId));
    } catch (err) {
      alert('Failed to delete lead');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedLeads.size === 0) {
      alert('No leads selected');
      return;
    }
    
    if (!confirm(`Delete ${selectedLeads.size} selected leads?`)) return;
    
    try {
      await leadsApi.deleteBulk(Array.from(selectedLeads));
      setLeads(leads.filter(lead => !selectedLeads.has(lead.id)));
      setSelectedLeads(new Set());
    } catch (err) {
      alert('Failed to delete selected leads');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL leads? This cannot be undone!')) return;
    
    try {
      await leadsApi.deleteAll();
      setLeads([]);
      setSelectedLeads(new Set());
    } catch (err) {
      alert('Failed to delete all leads');
    }
  };

  const toggleSelectLead = (leadId) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  const getConfidenceColor = (score) => {
    if (score >= 80) return '#7dd17d';
    if (score >= 60) return '#f59e0b';
    return '#d17d7d';
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'sale': return '#7dd17d';
      case 'not_lead': return '#d17d7d';
      default: return '#888';
    }
  };

  if (loading) {
    return <div className="loading">Loading leads...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={loadLeads} className="btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="leads">
      <div className="leads-header">
        <h2>Detected Leads</h2>
        <div className="header-actions">
          <button onClick={loadLeads} className="btn-refresh">
            Refresh
          </button>
          {selectedLeads.size > 0 && (
            <button onClick={handleDeleteSelected} className="btn-delete">
              Delete Selected ({selectedLeads.size})
            </button>
          )}
          {leads.length > 0 && (
            <button onClick={handleDeleteAll} className="btn-delete-all">
              Delete All
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="filter-select"
          >
            <option value="all">All</option>
            <option value="lead">Lead</option>
            <option value="not_lead">Not Lead</option>
            <option value="sale">Sale</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Min Confidence:</label>
          <select
            value={filters.minConfidence}
            onChange={(e) => setFilters({ ...filters, minConfidence: Number(e.target.value) })}
            className="filter-select"
          >
            <option value={0}>All (0%+)</option>
            <option value={50}>Medium (50%+)</option>
            <option value={70}>High (70%+)</option>
            <option value={90}>Very High (90%+)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Limit:</label>
          <select
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}
            className="filter-select"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {leads.length > 0 && (
          <div className="filter-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={selectedLeads.size === leads.length}
                onChange={toggleSelectAll}
              />
              Select All
            </label>
          </div>
        )}
      </div>

      {/* Leads List */}
      {leads.length === 0 ? (
        <div className="no-data">
          <h3>No leads found</h3>
          <p>Configure your lead detection criteria and start the scanner</p>
        </div>
      ) : (
        <div className="leads-list">
          {leads.map((lead) => (
            <div key={lead.id} className={`lead-card ${selectedLeads.has(lead.id) ? 'selected' : ''}`}>
              <div className="lead-header">
                <div className="lead-header-left">
                  <input
                    type="checkbox"
                    checked={selectedLeads.has(lead.id)}
                    onChange={() => toggleSelectLead(lead.id)}
                    className="lead-checkbox"
                  />
                  <div className="confidence-badge" style={{ backgroundColor: getConfidenceColor(lead.confidence_score) }}>
                    {lead.confidence_score}%
                  </div>
                  {lead.lead_status && lead.lead_status !== 'lead' && (
                    <div className="status-badge" style={{ borderColor: getStatusColor(lead.lead_status) }}>
                      {lead.lead_status === 'sale' ? 'Sale' : 'Not Lead'}
                    </div>
                  )}
                </div>
                <div className="lead-meta">
                  {new Date(lead.detected_at).toLocaleString()}
                </div>
              </div>

              <div className="lead-content">
                <div className="lead-message">
                  <strong>Message:</strong>
                  <p>{lead.messages?.message || 'N/A'}</p>
                </div>

                <div className="lead-reasoning">
                  <strong>Why this is a lead:</strong>
                  <p>{lead.reasoning}</p>
                </div>

                {lead.matched_criteria && lead.matched_criteria.length > 0 && (
                  <div className="matched-criteria">
                    <strong>Matched criteria:</strong>
                    <div className="criteria-tags">
                      {lead.matched_criteria.map((criterion, idx) => (
                        <span key={idx} className="criterion-tag">{criterion}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="lead-actions">
                <button
                  onClick={() => handleUpdateStatus(lead.id, 'lead')}
                  className={`btn-status ${lead.lead_status === 'lead' ? 'active' : ''}`}
                  disabled={lead.lead_status === 'lead'}
                >
                  Lead
                </button>
                <button
                  onClick={() => handleUpdateStatus(lead.id, 'not_lead')}
                  className={`btn-status ${lead.lead_status === 'not_lead' ? 'active' : ''}`}
                  disabled={lead.lead_status === 'not_lead'}
                >
                  Not Lead
                </button>
                <button
                  onClick={() => handleUpdateStatus(lead.id, 'sale')}
                  className={`btn-status ${lead.lead_status === 'sale' ? 'active' : ''}`}
                  disabled={lead.lead_status === 'sale'}
                >
                  Sale
                </button>
                <button
                  onClick={() => handleDeleteLead(lead.id)}
                  className="btn-delete-single"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Leads;
