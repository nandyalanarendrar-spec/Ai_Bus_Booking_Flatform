import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
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
