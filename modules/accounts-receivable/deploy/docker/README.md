# OCI images

Development Dockerfiles build non-root `ar-web`, `ar-api`, `ar-worker`, and ordered migration images from
the repository root. Runtime images do not include working credentials or customer data. Base images are
overridable build arguments; release automation must replace mutable tags with approved digests.

No release image has been built or published. Release images still require SBOM, vulnerability policy,
signature, provenance, malware/license review, and runtime hardening evidence.
