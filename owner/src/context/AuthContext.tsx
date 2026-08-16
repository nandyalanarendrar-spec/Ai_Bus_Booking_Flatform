import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/axios';

interface Owner {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  owner: Owner | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedToken = localStorage.getItem('ownerToken');
    const storedOwner = localStorage.getItem('ownerData');
    
    if (storedToken && storedOwner) {
      setToken(storedToken);
      setOwner(JSON.parse(storedOwner));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await api.post('/owner/login', {
        email: normalizedEmail,
        password,
      });

      const newToken = response.data?.token || response.data?.accessToken || response.data?.jwt;
      const ownerData = response.data?.owner || response.data?.user || response.data?.data?.owner;

      if (!newToken || !ownerData) {
        throw new Error('Invalid login response from server');
      }
      
      localStorage.setItem('ownerToken', newToken);
      localStorage.setItem('ownerData', JSON.stringify(ownerData));
      
      setToken(newToken);
      setOwner(ownerData);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('ownerToken');
    localStorage.removeItem('ownerData');
    setToken(null);
    setOwner(null);
  };

  return (
    <AuthContext.Provider value={{ owner, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
