# AR API application

Standalone NestJS API under active WI-OI-019 implementation. The foundation provides fail-closed runtime
configuration, remote-JWKS OIDC verification, tenant/permission context, PostgreSQL health checks and
tenant-scoped transactions. It implements setup, customers, draft create/revise/read/list, and atomic issue.
List endpoints use bounded keyset pagination; mutating creation/issue commands are idempotent and draft
updates require the latest ETag.

The API never accepts tenant scope from the body/header, never falls back to memory or fixtures, and will
refuse to start with a superuser/BYPASSRLS database role. The draft contract is
`../../contracts/openapi.yaml`.
