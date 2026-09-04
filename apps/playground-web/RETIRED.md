# Retired prototype — not an application runtime

This directory is retained only as migration reference for previously explored UI capabilities.

It is deliberately non-executable:

- the package has no `dev`, `build`, `start`, `preview`, or test runtime scripts;
- the Vite HTML entry point has been removed;
- no production controller, image, Helm chart, route, CI build, or workspace task may depend on it;
- its historical source records and simulation controls are not product data and must not be copied into a tenant, seed, API, or replacement screen.

The production replacement is `apps/workflow-platform`. A capability may move there only after its source, persistence, classification, authorization, audit, error state and acceptance tests are implemented with authoritative data.
