# Deployment artifacts

The same reviewed module version will be packaged for suite mode, customer-cloud Helm, a documented
self-contained Compose profile, and customer-provided PostgreSQL schema mode. Development Dockerfiles,
Compose, and a digest-pinned-image Helm chart now exist; no OCI image has been published or certified.

All profiles require explicit OIDC, PostgreSQL, secret references, storage, email, public URLs, encryption,
and observability settings. Missing required configuration fails closed; no default password, tenant,
provider, or business data is allowed. Compose is a loopback evaluation/small-profile reference; production
requires TLS ingress, secret-manager injection, managed backups, monitoring, and measured capacity.
