// WI-OI-121f: the former script enabled every module for every tenant and granted
// wildcard permissions to every member. It must never contact or mutate a database.
console.error(
  'REFUSED: blanket tenant feature/entitlement/permission grants are disabled. ' +
  'Use an approved, exact-target provisioning work item with independent review.',
);
process.exitCode = 1;
