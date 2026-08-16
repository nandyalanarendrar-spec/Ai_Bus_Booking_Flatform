/// <reference types="vite/client" />
import axios from 'axios';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized responses to clear expired tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and user on authentication error
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const adminToken = localStorage.getItem('adminToken');
      if (adminToken) {
        localStorage.removeItem('adminToken');
      }
      // Optional: redirect to login if not already there
      if (!window.location.hash.includes('/login') && !window.location.hash.includes('/admin/login')) {
        window.location.hash = '/login';
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
