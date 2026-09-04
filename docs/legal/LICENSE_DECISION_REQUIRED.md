# Project license decision required

Status: release blocker for the public repository

The repository does not yet have a project-wide license. Public GitHub visibility alone does not make
the source open source and does not grant reuse rights.

Before the first public push, a named human owner must choose and approve:

- the source-code license and copyright holder;
- whether the SaaS/control-plane code and independently deployable modules use the same license;
- the contribution terms and whether a CLA or DCO is required;
- the policy for third-party reference implementations and generated clients; and
- the commercial licensing path, if dual licensing is intended.

Invoice Ninja 5 must not be copied into GigaLibs for the planned hosted SaaS. The local reference source
uses Elastic License 2.0, whose managed-service restriction conflicts with that delivery model. Product
ideas may be independently specified; code, assets, protected branding, and license-gated behavior must
not be copied.
