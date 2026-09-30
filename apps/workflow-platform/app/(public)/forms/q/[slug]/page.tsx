import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Contained 2026-09-30 (D2 review of 808b8d2, owner-approved): public questionnaires are unavailable until the forms
// are rebuilt on the governed forms engine with permissions, size and rate limits (WI-OI-108).
export default function PublicFormPage() {
  notFound();
}
