import { prisma } from '@gigalibs/db';
import { refreshLifetimeSeconds } from './mobile-credentials.js';

// WI-OI-120cf: removes mobile sign-in state nothing can use any more. The sessions themselves stay (they are the
// platform's session record); what goes is: MFA challenges an hour past their expiry, switch outcomes past theirs, and
// retired refresh-token hashes of sessions that have ended or that are older than a refresh token's lifetime (a token
// that old can no longer be presented as a reuse worth catching). The audit log keeps every event.

const CHALLENGE_GRACE_SECONDS = 3_600;

export interface MobileRetentionOutcome {
  readonly challenges: number;
  readonly switchOutcomes: number;
  readonly retiredRefreshTokens: number;
}

export async function pruneMobileAuthState(now = new Date()): Promise<MobileRetentionOutcome> {
  const challenges = await prisma.mobileMfaChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - CHALLENGE_GRACE_SECONDS * 1_000) } },
  });
  const switchOutcomes = await prisma.mobileSwitchOutcome.deleteMany({ where: { expiresAt: { lt: now } } });
  const retiredRefreshTokens = await prisma.mobileRetiredRefreshToken.deleteMany({
    where: {
      OR: [
        { retiredAt: { lt: new Date(now.getTime() - refreshLifetimeSeconds() * 1_000) } },
        { session: { session: { status: { not: 'ACTIVE' } } } },
      ],
    },
  });
  return { challenges: challenges.count, switchOutcomes: switchOutcomes.count, retiredRefreshTokens: retiredRefreshTokens.count };
}
