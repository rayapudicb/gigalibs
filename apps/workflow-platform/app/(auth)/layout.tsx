import { AuthAtmosphere } from '@/components/auth/AuthAtmosphere';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-zinc-950">
      <AuthAtmosphere />
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white shadow-lg shadow-blue-500/10">
            G
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">GigaLibs</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Operations intelligence
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.1)]" />
          Secure workspace access
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1440px] items-center gap-12 px-5 pb-10 pt-28 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
        <section className="hidden max-w-2xl lg:block">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[28px] border border-blue-100 bg-white/80 shadow-[0_30px_90px_rgba(37,99,235,0.15)] backdrop-blur-xl">
            <div className="auth-spring-mark" />
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
            One operational universe
          </p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-zinc-950 xl:text-6xl">
            Every business flow, moving in concert.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-zinc-500">
            Enter a governed workspace for workflows, finance operations, integrations, evidence and
            tenant administration.
          </p>
          <div className="mt-9 flex flex-wrap gap-2">
            {['Tenant isolated', 'Auditable', 'Human governed'].map((item) => (
              <span
                key={item}
                className="rounded-full border border-zinc-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-zinc-600 backdrop-blur"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-[460px] rounded-[28px] border border-white/90 bg-white/90 p-2 shadow-[0_30px_100px_rgba(24,24,27,0.12)] backdrop-blur-2xl">
          <div className="rounded-[22px] border border-zinc-100 bg-white p-3 sm:p-5">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
