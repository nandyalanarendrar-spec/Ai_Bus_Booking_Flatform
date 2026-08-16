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
  const token = localStorage.getItem('ownerToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes('/owner/login');
    if (!isLoginEndpoint && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('ownerToken');
      localStorage.removeItem('ownerData');
      window.location.href = '/#/login';
    }
    return Promise.reject(error);
  }
);


export default api;
