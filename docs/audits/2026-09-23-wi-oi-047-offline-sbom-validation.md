# WI-OI-047 offline SBOM validation

Date: 2026-09-23  
Scope: The three exact local images certified in `phase-a-20260923T103641Z`  
Result: Offline integrity passed with coverage gaps; vulnerability verdict pending

## Outcome

The three local Docker image IDs match `images.json` and `phase-a-closure.json`. Each stored CycloneDX
1.5 SBOM parses as JSON, its SHA-256 matches `supply-chain-summary.json`, and its component count matches
the original certification record. This proves evidence integrity and binding to the exact local images;
it does not prove absence of vulnerabilities.

| Image | Exact image ID | Components | Versioned | Unknown version | PURL present | License evidence present |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| migrations | `sha256:5742649e57f5586c295dbd1dc381d975c713266a9673b57854dfb6e967e59f83` | 586 | 580 | 6 | 586 | 563 |
| API | `sha256:d34b1dfbeb0b5409f9420c09da723905586e543b0d1d4ed4a56a61b22b753aee` | 552 | 547 | 5 | 552 | 517 |
| web | `sha256:495a0553bbf3e35e52006eb67991a2f856d4a054e18957aa81c93775ad545a12` | 736 | 603 | 133 | 736 | 691 |

The exact SBOM hashes are:

- migrations: `81b12b993fe614af3ac626d3e6d77d3d6ea4e3c2ebadd9eb85190f4017206a2a`;
- API: `093359ab4364653dde823717872b0399cc7d09c05b72fc971c0fbaf88ab323cf`; and
- web: `dcbc735764a2e85b36a38412e18928b289580ed0a87abebed6be237f8aa4b3f0`.

## Coverage findings

- Every component has a package URL, which supports later scanner correlation.
- Migrations has 6 unknown-version entries, API has 5 and web has 133. The web entries are predominantly
  packages bundled into Next.js, including built-in React, Webpack and server-runtime components. These
  entries reduce matching confidence and must not be interpreted as vulnerability-free.
- Embedded license evidence is absent for 23 migrations, 35 API and 45 web entries. This is a request for
  license review or SBOM enrichment, not proof that those packages lack licenses.
- No image, SBOM or component was changed by this validation.

## Vulnerability scanner boundary

Docker Scout 1.18.3 is installed. On 2026-09-23 Chinni babu Rayapudo explicitly authorized package and
image metadata transmission for the three certified images to Docker services, excluding source code,
credentials and production data. Each of the three scoped CVE commands then stopped before analysis
because Docker Scout is not authenticated. No SARIF evidence was created. The state is
`BLOCKED_DOCKER_AUTHENTICATION`; no vulnerability pass is claimed.

The local operator/Security reviewer may either:

1. sign in to Docker directly using Docker Desktop or a least-privilege Docker access token, then rerun
   the already authorized scans; or
2. provide an approved fully offline vulnerability database/scanner and record its database identity and
   freshness.

The agent must not request, receive or store the operator's Docker password or token.

Either route must retain findings, suppressions, fix availability and the exact image IDs. A tool result is
evidence for, not a substitute for, the named human Security decision.
