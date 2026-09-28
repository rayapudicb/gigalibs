console.error(
  [
    'The fabricated development control-plane daemon is disabled.',
    'Run the real local API through infra/compose/compose.yaml instead.',
    'Mock auth tokens, default tenants, wildcard permissions, and empty-success API fallbacks are prohibited.',
  ].join(' '),
);

process.exitCode = 1;
