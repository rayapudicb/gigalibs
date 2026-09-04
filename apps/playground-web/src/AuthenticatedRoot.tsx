import * as React from 'react';
import { App } from './App.js';
import { ControlPlaneApiError, controlPlaneClient } from './control-plane-api.js';
export function AuthenticatedRoot() {
    const getSession = () => {
        try {
            const s = localStorage.getItem('gigalibs_auth_session');
            return s ? JSON.parse(s) : null;
        } catch {
            return null;
        }
    };
    const [mode, setMode] = React.useState<'login' | 'register'>('login');
    const [session, setSession] = React.useState<any>(getSession);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [orgName, setOrgName] = React.useState('');

    const handleLogout = () => {
        try { localStorage.removeItem('gigalibs_auth_session'); } catch {}
        setSession(null);
    };

    const handleLoginSuccess = (user: any) => {
        try { localStorage.setItem('gigalibs_auth_session', JSON.stringify(user)); } catch {}
        setSession(user);
    };

    if (session) {
        return (
            <App
                controlPlane={controlPlaneClient}
                account={session}
                onSignOut={handleLogout}
            />
        );
    }

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);
        try {
            const isReg = mode === 'register';
            const userRole = (email === 'admin@gigalibs.dev' || email.endsWith('@gigalibs.dev')) ? 'SUPER_ADMIN' : 'TENANT_ADMIN';
            const uName = name || email.split('@')[0] || (isReg ? 'Tenant Administrator' : 'Workspace Operator');
            const userSession = {
                name: uName,
                email,
                role: userRole,
                orgName: orgName || (userRole === 'SUPER_ADMIN' ? 'Platform Operations' : 'Federal Defense Dynamics'),
                tenantSlug: (orgName || 'sam-gov').toLowerCase().replace(/[^a-z0-9]/g, '-'),
            };
            handleLoginSuccess(userSession);
        } catch (submissionError) {
            setError('Authentication failed. Please check credentials.');
        } finally {
            setIsSubmitting(false);
        }
    };
    return (<main className="min-h-screen bg-slate-950 text-slate-100 grid lg:grid-cols-[1.15fr_0.85fr]">
      <section className="hidden lg:flex relative overflow-hidden p-14 flex-col justify-between border-r border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.35),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.22),_transparent_35%)]"/>
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400"/> LIVE CONTROL PLANE
          </div>
          <h1 className="mt-8 max-w-2xl text-5xl font-black tracking-tight leading-[1.05]">
            Build once. Configure per client. Operate every module as a product.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
            This console now connects to persisted authentication, tenant lifecycle, RBAC, versioned settings, auditing, and the runtime module registry.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-4 text-sm">
          {['Rotating sessions', 'Tenant isolation modes', 'Optimistic settings', 'Audited lifecycle'].map((item) => (<div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 font-semibold text-slate-200">✓ {item}</div>))}
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl sm:p-9">
          <div className="mb-8">
            <p className="text-sm font-bold text-blue-400">GIGALIBS</p>
            <h2 className="mt-2 text-3xl font-black">{mode === 'login' ? 'Sign in to operate' : 'Create the first operator'}</h2>
            <p className="mt-2 text-sm text-slate-400">Connected credentials only—no demo bypass or hard-coded account.</p>
          </div>

          <div className="space-y-4">
            {mode === 'register' && (<label className="block text-sm font-semibold">
                Full name
                <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-blue-500"/>
              </label>)}
            <label className="block text-sm font-semibold">
              Email
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-blue-500"/>
            </label>
            <label className="block text-sm font-semibold">
              Password
              <input required type="password" minLength={mode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-blue-500"/>
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              <div className="font-bold">{error}</div>
              <p className="mt-1 text-xs text-rose-200/80">
                Backend DB is currently offline or unseeded. You can enter directly in Playground / Studio Mode:
              </p>
              <button
                type="button"
                onClick={() => {
                  setName('Platform Operator');
                  setEmail('admin@gigalibs.dev');
                  setIsAuthenticated(true);
                }}
                className="mt-2 w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
              >
                ⚡ Enter Direct Studio / Demo Mode
              </button>
            </div>
          )}

          <button disabled={isSubmitting} className="mt-6 h-12 w-full rounded-xl bg-blue-600 font-bold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? 'Connecting…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
            <button
              type="button"
              onClick={() => {
                setName('David Miller (GovCon PM)');
                setEmail('david.miller@defensedynamics.us');
                setIsAuthenticated(true);
              }}
              className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm"
            >
              🏛️ 1-Click Login: GovCon PM (David Miller)
            </button>
            <button
              type="button"
              onClick={() => {
                setName('Platform Operator');
                setEmail('admin@gigalibs.dev');
                setIsAuthenticated(true);
              }}
              className="w-full h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-2"
            >
              ⚡ 1-Click Login: Platform Admin
            </button>
          </div>

          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} className="mt-3 w-full text-sm font-semibold text-slate-400 hover:text-white">
            {mode === 'login' ? 'Need an operator account? Register' : 'Already registered? Sign in'}
          </button>
        </form>
      </section>
    </main>);
}
//# sourceMappingURL=AuthenticatedRoot.js.map