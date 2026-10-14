// WI-OI-120aj (its Security review M4, 2026-10-14): the former script added 'communications-textfly' to every tenant's features and a PLATFORM_OVERRIDE entitlement, in every database it
// could reach, including the UAT database through the local .env (the same path as the old enable-all-features, see
// WI-OI-120al). It must never contact or mutate a database.
console.error(
  'REFUSED: blanket tenant feature/entitlement/permission grants are disabled. ' +
  'Use an approved, exact-target provisioning work item with independent review.',
);
process.exitCode = 1;
