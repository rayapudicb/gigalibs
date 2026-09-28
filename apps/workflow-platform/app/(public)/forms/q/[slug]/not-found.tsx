import Link from 'next/link';

export default function PublicFormNotFound() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Form Not Available</h2>
      <p className="mt-2 text-sm text-slate-600">
        This form or questionnaire link does not exist, has expired, or is currently unpublished.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}
