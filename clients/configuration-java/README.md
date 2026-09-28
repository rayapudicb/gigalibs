# GigaLibs Configuration Java client

`ConfigurationManifestClient` is the dependency-free Java 11 boundary for the strict v1 Configuration
Studio runtime-manifest response. It decodes the language-neutral manifest emitted by the TypeScript
compiler without importing or executing TypeScript, JavaScript, generated Node code or a browser runtime.

The decoder fails closed on duplicate or unknown JSON properties, unsupported contract/compiler versions,
invalid keys and timestamps, field/component mismatches, resource-limit overflow, invalid section/list/
condition references and disagreement between the response and manifest checksums. Compilation,
authorization and submitted-value validation remain server responsibilities.

`ConfigurationManifestHttpClient` adds the Java 11 network boundary. It requires HTTPS outside explicit
loopback development/certification, uses the JVM trust store and hostname verification, never follows
redirects, sends the bearer only in the authorization header, accepts only a 200 JSON response and reads at
most two megabytes before invoking the strict decoder. Error bodies and bearer values are never printed.

Run the cross-language certification after the TypeScript packages have been built:

```text
CONFIGURATION_JAVA_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-java-client-result.json \
  pnpm certify:configuration-java-client
```

The offline certification compiles with `--release 11 -Xlint:all -Werror`, decodes a real 13-field compiler
manifest and runs hostile fixtures. The Configuration Studio disposable HTTP certification separately
compiles both Java sources and uses the network client against the real local API and one-run bearer. It
also proves invalid-token denial, non-loopback cleartext refusal, redirect refusal, media-type validation
and response-size enforcement. Both runs remove generated class files before recording aggregate evidence.
Target-profile TLS/trust-chain behavior, Android or Spring integration, UI rendering, either deployment
profile and independent client/API acceptance remain open.
