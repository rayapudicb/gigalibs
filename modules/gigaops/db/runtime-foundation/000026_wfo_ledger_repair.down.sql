-- WI-OI-120a: removes only this migration's own ledger row; rows 20-25 describe objects that still exist.
DELETE FROM gigalibs_workforce.schema_migrations WHERE version = 26;
