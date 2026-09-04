/**
 * @gigalibs/auth-react
 *
 * React authentication context, hooks, and pre-built accessible UI components:
 * SignInForm and useAuth() backed by a required authentication API.
 *
 * @module
 */

import * as React from 'react';
import {
  AuthResponseSchema,
  type LoginWithEmailDto,
  type RegisterWithEmailDto,
} from '@gigalibs/contracts';

export interface AuthContextType {
  user: { id: string; email: string; name?: string } | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (dto: LoginWithEmailDto) => Promise<void>;
  register: (dto: RegisterWithEmailDto) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{
  apiUrl: string;
  children: React.ReactNode;
}> = ({ apiUrl, children }) => {
  if (!apiUrl.trim()) throw new Error('AuthProvider requires an API URL.');
  const normalizedApiUrl = apiUrl.replace(/\/+$/, '');
  const [token, setToken] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<{ id: string; email: string; name?: string } | null>(null);

  const authenticate = async (
    path: 'login' | 'register',
    dto: LoginWithEmailDto | RegisterWithEmailDto,
  ) => {
    const response = await fetch(`${normalizedApiUrl}/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : `Authentication request failed with status ${response.status}.`;
      throw new Error(message);
    }
    const parsedTokens = AuthResponseSchema.safeParse(await response.json());
    if (!parsedTokens.success) {
      throw new Error('Authentication service returned an invalid token contract.');
    }
    const contextResponse = await fetch(`${normalizedApiUrl}/auth/context`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${parsedTokens.data.accessToken}`,
      },
    });
    if (!contextResponse.ok) {
      throw new Error(`Authenticated session context failed with status ${contextResponse.status}.`);
    }
    const context = requireUserContext(await contextResponse.json());
    setToken(parsedTokens.data.accessToken);
    setUser(context.user);
  };

  const login = async (dto: LoginWithEmailDto) => {
    await authenticate('login', dto);
  };

  const register = async (dto: RegisterWithEmailDto) => {
    await authenticate('register', dto);
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${normalizedApiUrl}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

function requireUserContext(value: unknown): { user: { id: string; email: string; name?: string } } {
  if (!value || typeof value !== 'object' || !('user' in value)) {
    throw new Error('Authentication context response is incomplete.');
  }
  const user = value.user;
  if (!user || typeof user !== 'object' || !('id' in user) || !('email' in user)) {
    throw new Error('Authentication context response does not contain a user.');
  }
  if (typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email) {
    throw new Error('Authentication context contains an invalid user identity.');
  }
  const name = 'name' in user ? user.name : undefined;
  if (name != null && typeof name !== 'string') {
    throw new Error('Authentication context contains an invalid user name.');
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      ...(typeof name === 'string' ? { name } : {}),
    },
  };
}

export const useAuth = (): AuthContextType => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const SignInForm: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const { login } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ email, password });
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm w-full mx-auto p-6 bg-white rounded-2xl shadow-xl border border-slate-200">
      <div>
        <h2 className="text-xl font-black text-slate-900">Sign In to GigaLibs</h2>
        <p className="text-xs text-slate-500 mt-0.5">Enter your account credentials</p>
      </div>

      {error && <div className="p-3 text-xs bg-red-50 text-red-600 rounded-lg">{error}</div>}

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In →'}
      </button>
    </form>
  );
};
