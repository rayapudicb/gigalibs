# Deployment artifacts

The same reviewed module version will be packaged for suite mode, customer-cloud Helm, a documented
self-contained Compose profile, and customer-provided PostgreSQL schema mode. No artifact exists yet.

All profiles require explicit OIDC, PostgreSQL, secret references, storage, email, public URLs, encryption,
and observability settings. Missing required configuration fails closed; no default password, tenant,
provider, or business data is allowed.
