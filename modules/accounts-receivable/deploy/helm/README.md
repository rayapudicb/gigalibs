# Helm chart

Development customer-cloud chart for replicated web/API/worker deployments, a pre-install/upgrade migration
job, non-root/read-only security contexts, service account, disruption budgets, TLS ingress, resource bounds,
and external Secret references. All image repositories and immutable digests are required at render time.

Operators must provision PostgreSQL login roles and grant them the canonical API/worker group memberships.
Autoscaling, NetworkPolicy tailored to the target CNI, monitoring/alerts, backup hooks, topology spread, and
safe-rollout evidence remain required before a deployment mode can be certified.
