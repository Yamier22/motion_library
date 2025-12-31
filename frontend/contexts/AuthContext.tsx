'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    let token: string | null = null;
    try {
      token = localStorage.getItem('token');
    } catch (e) {
      // localStorage might not be available (e.g., in Cursor's built-in browser)
      console.warn('localStorage not available:', e);
      setIsLoading(false);
      setIsAuthenticated(false);
      return;
    }

    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      await authApi.verify();
      setIsAuthenticated(true);
    } catch (error) {
      try {
        localStorage.removeItem('token');
      } catch (e) {
        console.warn('Failed to remove token from localStorage:', e);
      }
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (password: string) => {
    try {
      const response = await authApi.login(password);
      try {
        localStorage.setItem('token', response.access_token);
      } catch (e) {
        console.warn('Failed to save token to localStorage:', e);
        // If localStorage is not available, we can't persist the session
        // But we can still set authenticated state for current session
        console.warn('Session will not persist across page reloads');
      }
      setIsAuthenticated(true);
      router.push('/dashboard');
    } catch (error) {
      throw new Error('Invalid password');
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem('token');
    } catch (e) {
      console.warn('Failed to remove token from localStorage:', e);
    }
    setIsAuthenticated(false);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
