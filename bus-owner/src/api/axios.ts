import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('companyToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const hasCompanySession = Boolean(localStorage.getItem('companyToken'));

    if (hasCompanySession && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('companyToken');
      localStorage.removeItem('companyData');
      window.location.href = '/#/login';
    }
    return Promise.reject(error);
  }
);

export default api;
