import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '../lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  userEmail: string;
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [checking, setChecking] = useState<boolean>(true);

  useEffect(() => {
    api.get<{ userId: string; role: string }>('/portal/me')
      .then(data => {
        setIsAuthenticated(true);
        setUserEmail(data.userId);
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/v1/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Credenciales inválidas');
    }
    setIsAuthenticated(true);
    setUserEmail(username);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/portal/logout').catch(() => {});
    setIsAuthenticated(false);
    setUserEmail('');
    window.location.replace('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
