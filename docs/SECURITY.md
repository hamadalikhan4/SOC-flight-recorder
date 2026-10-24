# Security boundaries — v0.1.0

This distribution is a single-tenant lab service. The server runner is intentionally loopback-only. The collector requires verified HTTPS for non-loopback destinations and does not follow redirects carrying its credential.

Implemented: unique enrollment tokens; stored device-token hashes; analyst/device scope separation; explicit revocation; strict event schema; bounded incoming body and batch sizes; parameterized SQLite queries; retry conflict detection; action audit entries; secret-free exports; generated runtime files excluded from source distribution.

Not implemented: individual analyst identities, password login, MFA, RBAC beyond analyst/device separation, mutual TLS/device certificates, certificate rotation, rate limiting, per-device backend storage quotas, encrypted databases, tamper resistance, signed updates/policies, automatic server retention, distributed workers or automated response. The shared analyst token grants all analyst privileges. Revocation prevents future requests but is not a cancellation mechanism for an already-running request.

An administrator or malware controlling an endpoint can alter its telemetry or steal its token. Hashes only detect later byte changes relative to a trusted manifest; they cannot prove source authenticity, collection completeness or legal chain of custody. Audit entries in SQLite can be changed by anyone with database write access.

Event metadata may contain personal data, command-line secrets and internal addresses. Deploy only in a lab where collection is authorized. Protect the runtime directory using OS permissions and disk encryption as appropriate. Review retention before expanding collection. Data-volume limits are engineering controls, not a claim that this server withstands hostile traffic.

The supplied Windows collector does not terminate processes, isolate devices, capture keystrokes, execute received commands or install persistence. It runs in the foreground. A production response engine requires a separately reviewed authorization/approval design.

Before remotely hosting: add TLS termination, deployment authentication and ingress controls; replace the shared analyst token; configure OS secrets and database protection; add capacity limits and retention; conduct Windows collection, performance and security review. The provided runner is not a deployment guide.
