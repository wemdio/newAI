import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// User ID management (temporary - in production this would come from auth)
const USER_ID_KEY = 'telegram_scanner_user_id';

export const getUserId = () => {
  return localStorage.getItem(USER_ID_KEY) || '00000000-0000-0000-0000-000000000001';
};

export const setUserId = (userId) => {
  localStorage.setItem(USER_ID_KEY, userId);
};

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add user ID to all requests
api.interceptors.request.use((config) => {
  config.headers['x-user-id'] = getUserId();
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
