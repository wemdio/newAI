import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://liavhyhyzqadilfmicba.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM'
);

// Auto-detect production URL based on current domain
const getApiBaseUrl = () => {
  // If VITE_API_URL is set during build, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // If running on Timeweb Cloud (*.twc1.net), use production backend
  if (window.location.hostname.includes('twc1.net')) {
    return 'https://wemdio-parserandscanner-40d8.twc1.net/api';
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
