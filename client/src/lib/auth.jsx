import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return; }
    try {
      const { user } = await api('/auth/me');
      setUser(user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token); setUser(user);
    return user;
  };
  const register = async (data) => {
    const { token, user } = await api('/auth/register', { method: 'POST', body: data });
    setToken(token); setUser(user);
    return user;
  };
  const logout = () => { setToken(null); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

export function homeFor(user) {
  if (!user) return '/';
  if (user.role === 'donor') return '/donor';
  if (user.role === 'admin') return '/admin';
  return '/browse';
}
