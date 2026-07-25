import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  clearStoredToken,
  fetchSession,
  getStoredToken,
  launchLogin,
  signOut as apiSignOut,
  type SessionUser,
} from './auth';
import { clearAllChatSessions } from './chat-storage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getStoredToken();
    if (!token) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    const session = await fetchSession(token);
    if (session) {
      setUser(session);
      setStatus('authenticated');
    } else {
      await clearStoredToken();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      const token = await launchLogin();
      const session = await fetchSession(token);
      if (!session) {
        await clearStoredToken();
        throw new Error('Signed in, but the session could not be loaded.');
      }
      setUser(session);
      setStatus('authenticated');
    } catch (e) {
      setUser(null);
      setStatus('unauthenticated');
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  }, []);

  const signOut = useCallback(async () => {
    const token = await getStoredToken();
    try {
      if (token) await apiSignOut(token);
    } finally {
      // Always drop local state, even if the revoke call failed: leaving a
      // cached transcript behind after "sign out" would be worse.
      await clearStoredToken();
      await clearAllChatSessions();
      setUser(null);
      setError(null);
      setStatus('unauthenticated');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, user, error, signIn, signOut, refresh: load }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
