# Development milestones

| Milestone | Status | Exit condition |
|---|---|---|
| Persistent backend and agent outbox | Implemented | Ingestion, retry, restart and authorization tests pass |
| Windows Sysmon integration | Implemented, Windows validation pending | Real events 1/3/11/22 captured and inspected; restart/rollover exercised on Windows |
| Detection-to-evidence replay | Verified | Seven replay events produce one incident, four process nodes, three edges and verified evidence |
| Live investigation UI | Next | Connect the existing prototype's fleet, timeline, process tree and export controls to authenticated APIs |
| Identity and access | Planned | Individual users, roles, audited enrollment and credential rotation |
| Agent service and telemetry health | Planned | Windows service lifecycle, signed packaging, benchmarks and reliable health reporting |
| Retention and scale | Planned | Tested retention of pinned recordings, quotas, PostgreSQL migration and background export jobs |
| Enterprise hardening | Planned | TLS/device certificates, encrypted storage, protected audit history and security review |
| Controlled response | Planned | Authenticated, approved, reversible actions with a tested failure model |
| Linux support | Planned | Native event source with the same tested normalization contract |

Do not represent planned items as delivered capabilities. v0.1.0 is a working engineering foundation, not a finished enterprise EDR.
