# Self-contained Compose profile

The profile starts empty PostgreSQL, ordered migrations, API, web BFF, and worker. Copy `.env.example` to
an ignored `.env`, replace every value, URL-encode database passwords, configure a real HTTPS OIDC issuer
and event receiver, then run from this directory:

```text
docker compose --env-file .env up --build
```

The web port binds only to loopback. The profile does not bundle an identity provider, email/payment
provider, TLS proxy, backups, or monitoring, and is not a certified production topology merely because it
starts. Preserve the named volume and follow migration `RECOVERY.md` for upgrades.
