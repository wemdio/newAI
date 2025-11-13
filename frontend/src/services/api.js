import axios from 'axios';
import supabase from '../supabaseClient';

// Auto-detect production URL based on current domain
const getApiBaseUrl = () => {
  // If VITE_API_URL is set during build, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Production domain
  if (window.location.hostname === 'telegram-scanner.ru') {
    return 'https://wemdio-newai-1b73.twc1.net/api';
  }
  
  // Timeweb Cloud fallback (*.twc1.net)
  if (window.location.hostname.includes('twc1.net')) {
    return 'https://wemdio-newai-1b73.twc1.net/api';
  }
  
  // Default to localhost for local development
  return 'http://localhost:3000/api';
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
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user) {
    // Use user ID from Supabase Auth
    config.headers['x-user-id'] = session.user.id;
  }
  
  return config;
});

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

export default api;
