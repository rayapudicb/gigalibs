import { Lock } from 'lucide-react';
import Link from 'next/link';

type ModuleReadiness = 'REVIEW' | 'CONTAINED';

interface UnavailableCapabilityProps {
  title?: string;
  readiness?: ModuleReadiness;
  summary?: string;
  availableForTesting?: readonly string[];
  blockedActions?: readonly string[];
}

export function CapabilityStatus({
  title = 'This capability is unavailable',
  readiness = 'CONTAINED',
  summary = 'Business records and actions are unavailable here while this capability is being completed.',
  availableForTesting = [],
  blockedActions = [],
}: UnavailableCapabilityProps) {
  return (
    <section className="min-h-full bg-[#f7f8fa] p-6 lg:p-10" aria-labelledby="capability-unavailable">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span
              title="Not available"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-500"
            >
              <Lock className="h-4 w-4" />
            </span>
          </div>
          <h1 id="capability-unavailable" className="mt-4 text-3xl font-semibold text-zinc-950">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">{summary}</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-base font-semibold text-zinc-950">Available to inspect now</h2>
            {availableForTesting.length > 0 ? (
              <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
                {availableForTesting.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-zinc-600">Module scope and readiness information.</p>
            )}
          </article>

          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-base font-semibold text-amber-950">Actions still blocked</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-amber-900">
              {blockedActions.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <span>{item}</span>
                </li>
              ))}
              <li className="flex gap-3 font-medium">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-600" />
                <span>No business action has been performed from this screen.</span>
              </li>
            </ul>
          </article>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white" href="/modules">
            View all modules
          </Link>
          <Link className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800" href="/ap">
            Open certified finance UAT
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function UnavailableCapability() {
  return <CapabilityStatus />;
}
