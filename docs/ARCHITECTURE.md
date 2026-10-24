# Architecture and guarantees

## Endpoint data path

Sysmon records to its Windows event channel. A fixed PowerShell reader returns XML in ascending record order. Python normalizes named XML fields, assigns an epoch-bound event ID and commits selected events plus the checkpoint in one SQLite transaction. The agent uploads batches from its persistent outbox. It acknowledges only a response naming the exact submitted event IDs. Network failures retain the queue for retries.

SQLite is used deliberately for the first single-machine lab release. Agent and backend databases are distinct. The agent uses only Python's standard library; it does not import the backend or FastAPI.

## Server data path

FastAPI validates an explicitly versioned, size-bounded schema. A device token identifies the endpoint; payloads cannot override that identity. The database transaction inserts events and runs one rule. Retrying the same event is idempotent; reusing an event ID with different content fails the whole batch. Incidents, events and audit entries are durable.

A process graph is constrained to one endpoint and recording window. Edges link process GUIDs, not PIDs. Unknown parents stay unresolved. A parent outside the window may exist but is not inferred. The graph is evidence supplied by the endpoint, not independent proof of an event's authenticity.

## Detection semantics

`DET-PS-014` requires a process event with a process GUID whose image basename is `powershell.exe` or `pwsh.exe`, and whose parent image basename is Word, Excel, PowerPoint or Outlook. It creates a high-severity review candidate with ATT&CK `T1059.001`. It does not establish malicious intent or use AI. There is no suppression/tuning editor yet. The local pinning condition mirrors the server rule; configurable remote rule distribution is not implemented.

## Time and evidence

All validated timestamps are timezone-aware UTC with fixed microsecond serialization. Events over five minutes into the future are rejected to surface clock errors. Old events are allowed for delayed delivery. Evidence is exported from a consistent database read transaction; each file has a SHA-256 manifest entry. Exports intentionally exclude device secrets.

A network failure alone does not imply a data gap because the queue persists. Observable source log reset/rollover creates a health event. Complete gap detection is impossible here; coverage is always reported as unknown rather than estimated. An event-source reset that cannot be distinguished from retention remains a limitation.

## Delivery semantics

Transport is at least once; database identity makes repeat insertion idempotent. The product does not promise exactly-once delivery across arbitrary disk failure, host compromise or upstream log loss. Agent polling is a lab implementation, not a high-throughput native event subscription. Benchmarks and a long-running service are required before claims about resource overhead.

## Sources consulted

- Microsoft Sysmon: https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon
- FastAPI security primitives: https://fastapi.tiangolo.com/reference/security/
- FastAPI testing: https://fastapi.tiangolo.com/tutorial/testing/
