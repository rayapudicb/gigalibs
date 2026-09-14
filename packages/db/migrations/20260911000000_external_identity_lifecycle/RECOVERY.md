# External identity lifecycle migration recovery

Work item: WI-OI-013

This forward migration preserves every existing issuer/subject binding and classifies it as `ACTIVE`. It
adds lifecycle state and replaces the configuration/user uniqueness rule with an index while retaining the
global issuer/subject uniqueness boundary.

Before applying, take a database backup and record counts grouped by configuration and user. After applying,
verify that every prior identity is `ACTIVE`, `revokedAt` is null, `updatedAt` is populated and the total
binding count is unchanged. Exercise one revocation/reactivation and confirm session revocation plus an
append-only `external_identity` audit record.

There is no approved destructive down migration. If deployment fails before application nodes use the new
fields, restore the pre-migration backup. After any node has written lifecycle state, roll forward: revoke an
unsafe binding, correct an inconsistent row within an approved maintenance change, or deploy a corrective
migration. Do not drop lifecycle columns or recreate the old uniqueness index because doing so can discard
historical bindings created after an issuer/client change.
