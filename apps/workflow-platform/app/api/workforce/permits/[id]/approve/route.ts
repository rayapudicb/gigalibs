import { unavailableCapability } from '@/lib/unavailable-capability';

export const runtime = 'nodejs';

// Contained 2026-09-28 (WI-OI-083 security finding, owner-approved). The unreviewed implementation (commit
// 808b8d2, lib/workforce-safety-service.ts) ran SQL against module schemas through the superuser control-plane role, and
// this route checked no permission. It stays unavailable (session required, no business action) until the D2 review
// rebuilds it through the module API and signed gateway with RBAC.
export const POST = () => unavailableCapability();
