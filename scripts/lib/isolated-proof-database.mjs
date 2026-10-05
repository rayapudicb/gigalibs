// Database selection for the finance proof scripts (WI-OI-120a).
//
// These proofs insert books, journals, tenants and roles. They used to fall back to the local instance on port 5440,
// which is now the owner's UAT instance, so `pnpm verify` silently wrote proof data into it (WI-OI-119 P1-16). A proof
// now runs only against a database that is named explicitly in PROOF_DATABASE_URL and is not the UAT instance.

export const NOT_RUN_EXIT_CODE = 78; // EX_CONFIG: the step was not run, which is neither a pass nor a failure.

const UAT_INSTANCE_PORT = '5440';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

/** Why a URL may not be used for a proof, or null when it may. */
export function proofDatabaseRefusal(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'PROOF_DATABASE_URL is not a valid URL.';
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return 'PROOF_DATABASE_URL must be a PostgreSQL URL.';
  if (LOCAL_HOSTS.has(parsed.hostname) && (parsed.port || '5432') === UAT_INSTANCE_PORT) {
    return 'PROOF_DATABASE_URL points at the UAT instance (port 5440); proofs never write there.';
  }
  return null;
}

/** Returns the isolated proof database URL, or exits with NOT_RUN_EXIT_CODE explaining why the proof did not run. */
export function isolatedProofDatabaseUrl(proofName) {
  const url = process.env.PROOF_DATABASE_URL;
  if (!url) {
    console.log(
      `NOT RUN: ${proofName} needs PROOF_DATABASE_URL, an isolated PostgreSQL 16 database. It never uses the UAT ` +
        'instance.',
    );
    process.exit(NOT_RUN_EXIT_CODE);
  }
  const refusal = proofDatabaseRefusal(url);
  if (refusal) {
    console.log(`NOT RUN: ${proofName}: ${refusal}`);
    process.exit(NOT_RUN_EXIT_CODE);
  }
  return url;
}
