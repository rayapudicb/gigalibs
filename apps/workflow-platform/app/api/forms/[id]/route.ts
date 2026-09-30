import { unavailableCapability } from '@/lib/unavailable-capability';

export const runtime = 'nodejs';

// Contained 2026-09-30 (D2 review of the unreviewed commit 808b8d2, owner-approved; .pi/work/D2-review-808b8d2.md).
// The forms routes checked only for a session (no permission or entitlement), had no same-origin check on changes, and
// the public submission had no size or rate limit. They answer unavailable (session required, no business action)
// until the forms are rebuilt on the governed forms engine with permissions (WI-OI-108). Stored forms and submissions
// are kept.
export const GET = () => unavailableCapability();
export const PATCH = () => unavailableCapability();
export const DELETE = () => unavailableCapability();
