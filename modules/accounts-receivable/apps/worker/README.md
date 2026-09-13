# AR worker application

The implemented worker claims committed outbox events through a least-privileged PostgreSQL group role and
delivers CloudEvents-compatible JSON to a configured HTTPS receiver. Requests use HMAC-SHA256 signatures,
stable event IDs, bounded timeouts, leased claims, exponential retries, and durable dead-letter state.

Delivery is at least once: consumers must deduplicate by event ID. PDF/email/payment/reconciliation/export
jobs remain planned and are not implemented by this worker yet.
