# Configuration datamodel alignment recovery

Work item: WI-OI-039

The canonical Prisma datamodel now declares the actor foreign keys, database defaults, update actions and
reviewed physical index names already created by the Configuration Studio migrations. This forward
migration adds the one missing non-unique activation lookup index; it does not alter business records or
remove an integrity constraint.

Apply through the normal migration job with a bounded lock and statement timeout. On a large activation
table, measure index-build duration against the deployment window before promotion. Verify the index is
valid and that a clean migration replay produces an empty Prisma physical-schema diff.

There is no approved down migration. If index construction cannot complete inside the accepted deployment
window, halt before starting the new artifact and use a reviewed forward migration with an approved online
index-build procedure. Dropping database constraints or defaults to make an ORM diff disappear is not an
accepted recovery path.
