import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '../lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  userEmail: string;
  userId: string;
  role: string;
  /** Cliente al que está atado un usuario `client_viewer`; `null` para admin/operator. */
  clientId: string | null;
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [role, setRole] = useState<string>('operator');
  const [clientId, setClientId] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(true);

  useEffect(() => {
    // Raw fetch — bypasses the api.ts 401 auto-redirect that would cause
    // an infinite reload loop while the user is not yet authenticated.
    fetch('/api/v1/portal/me', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('not authenticated');
        return res.json() as Promise<{ userId: string; username?: string; role: string; clientId?: string | null; token?: string }>;
      })
      .then(data => {
        setIsAuthenticated(true);
        setUserEmail(data.username || data.userId);
        setUserId(data.userId);
        setRole(data.role);
        setClientId(data.clientId ?? null);
        if (data.token) {
          sessionStorage.setItem('stc_ws_token', data.token);
        }
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }
    
    // Save token for WS fallback (browsers on Vercel)
    if (data.token) {
      sessionStorage.setItem('stc_ws_token', data.token);
    }

    // Volver a consultar /me para obtener el rol y el ID real del usuario recién autenticado
    try {
      const meRes = await fetch('/api/v1/portal/me', { credentials: 'include' });
      if (meRes.ok) {
        const meData = await meRes.json() as { userId: string; username?: string; role: string; clientId?: string | null };
        setUserId(meData.userId);
        setRole(meData.role);
        setClientId(meData.clientId ?? null);
        setUserEmail(meData.username || meData.userId);
      } else {
        setUserEmail(username);
      }
    } catch {
      setUserEmail(username);
    }

    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/portal/logout').catch(() => {});
    sessionStorage.removeItem('stc_ws_token');
    setIsAuthenticated(false);
    setUserEmail('');
    setUserId('');
    setRole('operator');
    setClientId(null);
    window.location.replace('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, userId, role, clientId, checking, login, logout }}>
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
