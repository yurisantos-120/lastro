'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, Network, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AuthUser, LocalAuthRole } from '@/services/auth/auth-types';

type AuthState =
  | { status: 'loading'; user: null; message: string }
  | { status: 'unauthenticated'; user: null; message: string }
  | { status: 'authenticated'; user: AuthUser; message: string };

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  loginPending: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type PublicUser = AuthUser;

function safeMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'object' || value === null || !('message' in value)) return fallback;
  const message = (value as { message?: unknown }).message;
  return typeof message === 'string' && message.length < 300 ? message.replace(/OpusLog/gi, 'Lastro') : fallback;
}

function validUser(value: unknown): value is PublicUser {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Partial<AuthUser>;
  return Number.isSafeInteger(user.id)
    && Number.isSafeInteger(user.glpiUserId)
    && typeof user.username === 'string'
    && typeof user.name === 'string'
    && (user.role === 'viewer' || user.role === 'operator' || user.role === 'admin')
    && user.active === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, message: '' });
  const [loginPending, setLoginPending] = useState(false);
  const handledUnauthorized = useRef(false);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível verificar a sessão. Tente novamente.');
      const body = await response.json() as { user?: unknown };
      if (body.user === null) {
        handledUnauthorized.current = false;
        setState({ status: 'unauthenticated', user: null, message: '' });
      } else if (validUser(body.user)) {
        handledUnauthorized.current = false;
        setState({ status: 'authenticated', user: body.user, message: '' });
      } else {
        throw new Error('A resposta de sessão do servidor foi inesperada.');
      }
    } catch (error) {
      setState({ status: 'loading', user: null, message: error instanceof Error ? error.message : 'Falha ao verificar a sessão.' });
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadSession();
    });
    return () => { active = false; };
  }, [loadSession]);

  const login = useCallback(async (username: string, password: string) => {
    setLoginPending(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json().catch(() => null) as { user?: unknown } | null;
      if (!response.ok) {
        setState({ status: 'unauthenticated', user: null, message: safeMessage(body, 'Não foi possível entrar.') });
        return false;
      }
      if (!body || !validUser(body.user)) {
        setState({ status: 'unauthenticated', user: null, message: 'A resposta de login do servidor foi inesperada.' });
        return false;
      }
      setState({ status: 'authenticated', user: body.user, message: '' });
      handledUnauthorized.current = false;
      return true;
    } catch {
      setState({ status: 'unauthenticated', user: null, message: 'Não foi possível acessar o serviço de autenticação.' });
      return false;
    } finally {
      setLoginPending(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      // The endpoint clears the HttpOnly cookie even when revocation reports an error.
      setState({
        status: 'unauthenticated',
        user: null,
        message: response.ok ? '' : 'Sessão local encerrada. Não foi possível confirmar a revogação no servidor.',
      });
    } catch {
      setState((current) => current.status === 'authenticated'
        ? { ...current, message: 'Não foi possível confirmar o encerramento da sessão. Verifique sua conexão e tente novamente.' }
        : current);
    }
  }, []);

  const request = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, { ...init, credentials: 'same-origin' });
    if (response.status === 401 && !handledUnauthorized.current) {
      handledUnauthorized.current = true;
      setState({ status: 'unauthenticated', user: null, message: 'Sua sessão expirou. Entre novamente.' });
    }
    return response;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    login,
    logout,
    request,
    loginPending,
  }), [state, login, logout, request, loginPending]);

  return <AuthContext.Provider value={value}>
    {state.status === 'loading'
      ? <SessionLoading message={state.message} retry={() => {
        setState({ status: 'loading', user: null, message: '' });
        void loadSession();
      }} />
      : state.status === 'unauthenticated'
        ? <LoginScreen message={state.message} login={login} pending={loginPending} />
        : children}
  </AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa ser usado dentro de AuthProvider.');
  return context;
}

const roleNames: Record<LocalAuthRole, string> = {
  viewer: 'Visualização',
  operator: 'Operação',
  admin: 'Administrador',
};

export function UserSession({ compact = false }: { compact?: boolean }) {
  const { user, logout, message } = useAuth();
  if (!user) return null;
  return <div className="flex min-w-0 flex-col items-end gap-1">
    <div className={`flex min-w-0 items-center gap-2 ${compact ? '' : 'rounded-xl border border-slate-200 bg-white px-3 py-2'}`}>
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-100 text-[#e85b20]" aria-hidden="true">
        <span className="text-sm font-semibold">{user.name.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'U'}</span>
      </div>
      <div className="min-w-0">
        <p className="max-w-40 truncate text-xs font-semibold text-slate-800">{user.name}</p>
        <p className="text-[11px] text-slate-500">{roleNames[user.role]}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => void logout()} className="ml-1 shrink-0" aria-label="Sair do Lastro">
        <LogOut className="size-4" /><span className="hidden sm:inline">Sair</span>
      </Button>
    </div>
    {message && <p role="alert" className="max-w-full text-right text-xs text-red-700">{message}</p>}
  </div>;
}

function SessionLoading({ message, retry }: { message: string; retry: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[#f4f6f8] p-5 text-[#17202a]">
    <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-[#ff6b2c] text-white"><Network className="size-6" /></div>
      <h1 className="text-lg font-semibold">Lastro</h1>
      <p role={message ? 'alert' : 'status'} className="mt-2 text-sm text-slate-500">{message || 'Verificando sua sessão…'}</p>
      {message && <Button type="button" variant="outline" className="mt-4" onClick={retry}><RefreshCw className="size-4" />Tentar novamente</Button>}
    </section>
  </main>;
}

function LoginScreen({ message, login, pending }: {
  message: string;
  login: (username: string, password: string) => Promise<boolean>;
  pending: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedPassword = password;
    setPassword('');
    await login(username, submittedPassword);
  }

  return <main className="grid min-h-screen place-items-center bg-[#f4f6f8] p-4 text-[#17202a] dark:bg-[#08111e] sm:p-6 lg:p-10">
    <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#111d2c] md:min-h-[580px] md:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative isolate hidden overflow-hidden bg-[#101b2a] p-8 text-white md:flex md:flex-col md:justify-between lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 size-80 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-12 size-80 rounded-full border border-[#ff6b2c]/20" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-14 right-12 size-40 rounded-full bg-[#ff6b2c]/[0.07] blur-2xl" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#ff6b2c] shadow-lg shadow-orange-950/20"><Network className="size-6" aria-hidden="true" /></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-300">Eidos</p><p className="text-xl font-semibold tracking-tight">Lastro</p></div>
        </div>
        <div className="relative z-10 max-w-sm py-12">
          <div className="mb-6 h-1 w-10 rounded-full bg-[#ff6b2c]" />
          <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">Gestão e suporte em um mesmo lugar.</h1>
          <p className="mt-5 text-sm leading-7 text-slate-300 lg:text-base">Documentação, infraestrutura, diagnósticos e chamados conectados em um único fluxo.</p>
        </div>
        <p className="relative z-10 text-xs text-slate-400">Eidos · Operação conectada</p>
      </aside>

      <div className="flex min-w-0 flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:px-16">
        <div className="mb-9 flex items-center gap-3 md:hidden">
          <div className="grid size-10 place-items-center rounded-xl bg-[#ff6b2c] text-white"><Network className="size-5" aria-hidden="true" /></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500 dark:text-slate-400">Eidos</p><p className="text-lg font-semibold text-[#17202a] dark:text-slate-100">Lastro</p></div>
        </div>

        <div className="mb-8">
          <div className="mb-5 h-1 w-10 rounded-full bg-[#ff6b2c]" />
          <h2 className="text-2xl font-semibold tracking-tight text-[#17202a] dark:text-white sm:text-3xl">Acesse sua conta</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Entre com seu usuário e senha para continuar.</p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <label htmlFor="opuslog-username" className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Usuário</span>
            <span className="relative block">
              <UserRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" />
              <Input id="opuslog-username" name="username" autoComplete="username" autoCapitalize="none" required maxLength={128} value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} className="h-12 rounded-xl border-slate-200 bg-white pl-11 text-sm shadow-none transition-colors focus-visible:border-[#e85b20] focus-visible:ring-[#e85b20]/20 dark:border-slate-700 dark:bg-[#0b1522] dark:text-slate-100 dark:placeholder:text-slate-500" />
            </span>
          </label>
          <label htmlFor="opuslog-password" className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Senha</span>
            <span className="relative block">
              <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" />
              <Input id="opuslog-password" name="password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" required maxLength={512} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} className="h-12 rounded-xl border-slate-200 bg-white pl-11 pr-12 text-sm shadow-none transition-colors focus-visible:border-[#e85b20] focus-visible:ring-[#e85b20]/20 dark:border-slate-700 dark:bg-[#0b1522] dark:text-slate-100 dark:placeholder:text-slate-500" />
              <button type="button" aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={passwordVisible} aria-controls="opuslog-password" onClick={() => setPasswordVisible((visible) => !visible)} disabled={pending} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-[#ff6b2c] disabled:pointer-events-none disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                {passwordVisible ? <EyeOff aria-hidden="true" className="size-[18px]" /> : <Eye aria-hidden="true" className="size-[18px]" />}
              </button>
            </span>
          </label>
          {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{message}</p>}
          <Button type="submit" disabled={pending || !username.trim() || !password} className="h-12 w-full rounded-xl bg-[#ff6b2c] font-semibold text-[#101b2a] shadow-sm shadow-orange-900/10 transition-colors hover:bg-[#e85b20] disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Autenticando…</> : <><ShieldCheck className="size-4" aria-hidden="true" />Entrar</>}
          </Button>
          <p className="pt-2 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Sua senha é validada pelo GLPI e não é armazenada pelo Lastro.</p>
        </form>
      </div>
    </section>
  </main>;
}
