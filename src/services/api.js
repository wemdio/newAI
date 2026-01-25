import axios from 'axios';
import supabase from '../supabaseClient';

// Auto-detect production URL based on current domain
const getApiBaseUrl = () => {
  // 1. Priority: Environment variable (set in Timeweb Dashboard)
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL;
    console.log('Using configured API URL:', url);
    return url;
  }
  
  // 2. Local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Using localhost API URL');
    return 'http://localhost:3000/api';
  }

  // 3. Production fallback (relative path if API is on same domain)
  // But in your case, API is on a different domain/subdomain usually.
  // Let's try to guess based on common Timeweb patterns or fail gracefully.
  
  console.warn('WARNING: VITE_API_URL is not set! API calls might fail.');
  
  // If we are on telegram-scanner.ru, we might want to use api.telegram-scanner.ru or similar
  // But better to just log error and return something
  return '/api'; // Try relative path as last resort
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add Supabase Auth token to all requests
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      // Use user ID and email from Supabase Auth
      config.headers['x-user-id'] = session.user.id;
      config.headers['x-user-email'] = session.user.email;
    }
  } catch (e) {
    console.error('Error getting session for API request:', e);
  }
  
  return config;
});

// Response interceptor for debugging
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Request Failed:', {
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      status: error.response?.status,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

// Configuration API
export const configApi = {
  get: () => api.get('/config'),
  create: (data) => api.post('/config', data),
  update: (data) => api.put('/config', data),
  delete: () => api.delete('/config'),
};

// Leads API
export const leadsApi = {
  getAll: (params) => api.get('/leads', { params }),
  getById: (id) => api.get(`/leads/${id}`),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  deleteAll: () => api.delete('/leads/all'),
  deleteBulk: (leadIds) => api.delete('/leads/bulk', { data: { lead_ids: leadIds } }),
  postToTelegram: (id) => api.post(`/leads/${id}/post-telegram`),
};

// Analytics API
export const analyticsApi = {
  dashboard: (days = 30) => api.get('/analytics/dashboard', { params: { days } }),
  usage: (startDate, endDate) => api.get('/analytics/usage', {
    params: { start_date: startDate, end_date: endDate }
  }),
  performance: (days = 30) => api.get('/analytics/performance', { params: { days } }),
};

// Scanner API
export const scannerApi = {
  status: () => api.get('/scanner/status'),
  start: () => api.post('/scanner/start'),
  stop: () => api.post('/scanner/stop'),
  manualScan: () => api.post('/scanner/manual-scan'),
};

// Messaging API
export const messagingApi = {
  // Account management
  getAccounts: () => api.get('/messaging/accounts'),
  addAccount: (data) => api.post('/messaging/accounts', data),
  updateAccount: (id, data) => api.put(`/messaging/accounts/${id}`, data),
  deleteAccount: (id) => api.delete(`/messaging/accounts/${id}`),
  pauseAccount: (id, paused) => api.post(`/messaging/accounts/${id}/pause`, { paused }),
  
  // Stats
  getStats: () => api.get('/messaging/stats'),
};

// Audit API
export const auditApi = {
  run: (data) => api.post('/audit/run', data)
};

// Contacts API
export const contactsApi = {
  getAll: (params) => api.get('/contacts', { params }),
  getOne: (id) => api.get(`/contacts/${id}`),
  getStats: () => api.get('/contacts/stats'),
  aggregate: (data) => api.post('/contacts/aggregate', data),
  updateData: (data) => api.post('/contacts/update-data', data),
  normalize: (data) => api.post('/contacts/normalize', data),
  recalculateIndustry: (data) => api.post('/contacts/recalculate-industry', data),
  enrich: (data) => api.post('/contacts/enrich', data),
  resetEnrichment: () => api.post('/contacts/reset-enrichment'),
  checkAdmin: () => api.get('/contacts/admin/check'),
  delete: (id) => api.delete(`/contacts/${id}`),
};

export default api;
