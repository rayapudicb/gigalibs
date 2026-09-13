# AR domain

Framework-independent customer-invoice rules for WI-OI-019. The first slice implements bounded decimal
quantity parsing, integer-minor-unit calculations, ISO currency/date validation, and invoice-number
formatting. It imports no web framework, database client, provider, or other business module.

This package is only one part of the product. It is not production certification without the API,
PostgreSQL transaction, UI, worker/outbox, authorization, audit, deployment, and G5 evidence.
