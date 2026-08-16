import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/axios';

interface Company {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  company: Company | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [company, setCompany] = useState<Company | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      const storedToken = localStorage.getItem('companyToken');
      const storedCompany = localStorage.getItem('companyData');

      if (storedToken && storedCompany) {
        try {
          await api.get('/company/me');
          setToken(storedToken);
          setCompany(JSON.parse(storedCompany));
        } catch (err) {
          localStorage.removeItem('companyToken');
          localStorage.removeItem('companyData');
          setToken(null);
          setCompany(null);
        }
      } else {
        setToken(null);
        setCompany(null);
      }
      setIsLoading(false);
    };

    void verifySession();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post('/company/login', { email, password });
    const { token: newToken, company: companyData } = response.data;
    localStorage.setItem('companyToken', newToken);
    localStorage.setItem('companyData', JSON.stringify(companyData));
    setToken(newToken);
    setCompany(companyData);
  };

  const logout = () => {
    localStorage.removeItem('companyToken');
    localStorage.removeItem('companyData');
    setToken(null);
    setCompany(null);
  };

  return (
    <AuthContext.Provider value={{ company, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
