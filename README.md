# SOC Flight Recorder

**v0.1.0 — working Windows-first lab release**

A persistent endpoint recorder and investigation backend that answers: **what happened before this alert?**

This source implements the first working engineering milestone behind the earlier Spectra prototype. It has a real FastAPI API, a durable SQLite outbox, a Windows Sysmon collector, one deterministic detection, process correlation and hashed evidence export. **The hosted prototype is still separate and is not connected to this backend.** This release is operated through Swagger or the included command-line scripts.

## What works

- Analyst-authenticated device enrollment with a unique, revocable device token.
- Agent tokens scoped to ingestion/heartbeat; they cannot read analyst APIs or choose another device's identity.
- Sysmon XML normalization for process creation (1), network connection (3), selected file creation (11), and DNS queries (22).
- Persistent checkpoints; checkpoint and event insertion commit together.
- SQLite outbox, bounded batches, exact acknowledgments, retry deduplication and restart recovery.
- Rolling local buffer; locally detected recording windows are protected from automatic pruning.
- Office-to-PowerShell detection (`DET-PS-014`), with `T1059.001` metadata.
- Persistent incidents, pre/post windows, filtered event queries and GUID-based process graphs.
- Disclosure of unresolved process parents, detected log resets and rollovers; no invented coverage percentage.
- Incident resolution/reopening with required analyst notes and a persistent audit log.
- ZIP evidence packages plus an independent SHA-256 verifier.
- Harmless, explicitly synthetic replay through the same ingestion API.

## Fastest start on Windows (no Sysmon needed for replay)

Install Python 3.12, extract this folder and open PowerShell **inside `soc-flight-recorder`**.

Terminal 1:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m scripts.init_lab
.\.venv\Scripts\python.exe -m scripts.run_server
```

Keep Terminal 1 running. Open Terminal 2 in the same folder:

```powershell
.\.venv\Scripts\python.exe -m scripts.replay
.\.venv\Scripts\python.exe -m scripts.inspect_lab
.\.venv\Scripts\python.exe -m scripts.verify_evidence runtime\replay-evidence.zip
```

Expected result: **7 events, 1 incident, 4 process nodes, 3 parent-child edges**, and a verified evidence ZIP. Re-running replay sends no already-acknowledged events and creates no duplicate incident. It never executes an attack, creates a macro, or contacts the sample destination.

Open **http://127.0.0.1:8000/docs**, click **Authorize**, and paste the analyst token from the locally generated `runtime/server.json`. To view that token locally:

```powershell
(Get-Content runtime\server.json | ConvertFrom-Json).admin_token
```

Keep the token private; do not include it in screenshots, Git, or chat. Swagger's UI assets may require Internet access; `scripts.inspect_lab` works without those assets. Health checks and the API itself do not need Internet access after dependencies are installed.

## Linux/macOS replay

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m scripts.init_lab
.venv/bin/python -m scripts.run_server
```

In another terminal: `.venv/bin/python -m scripts.replay`.

## Real Windows collection

Follow [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md). Live collection requires an installed/configured Microsoft Sysmon service and permission to read its Operational log. **The real Windows event-log path has not been executed in the Linux build environment.** Its parser, checkpoint logic and reset/rollover handling have automated tests with representative XML and mocked collection results.

## Investigation API

| Endpoint | Purpose | Credential |
|---|---|---|
| `GET /health` | Service health | None |
| `POST /api/v1/endpoints` | Enroll a device; return its token once | Analyst |
| `GET /api/v1/endpoints` | Fleet and heartbeats | Analyst |
| `POST /api/v1/endpoints/{id}/revoke` | Revoke device ingestion access | Analyst |
| `POST /api/v1/agent/events` | Submit up to 200 normalized events | Device |
| `POST /api/v1/agent/heartbeat` | Collector health and queue size | Device |
| `GET /api/v1/events` | Filter by endpoint, category, process GUID and text | Analyst |
| `GET /api/v1/incidents` | List incidents | Analyst |
| `GET /api/v1/incidents/{id}` | Recording-window events and known gaps | Analyst |
| `GET /api/v1/incidents/{id}/process-tree` | Process nodes, edges and missing parents | Analyst |
| `PATCH /api/v1/incidents/{id}` | Resolve/reopen with an analyst note | Analyst |
| `GET /api/v1/incidents/{id}/evidence` | Download an evidence ZIP | Analyst |
| `GET /api/v1/audit` | Paginated analyst/action history | Analyst |

The OpenAPI contract is included in [docs/openapi.json](docs/openapi.json). All identifiers in the API are generated dynamically; use values returned by your own instance.

## Recording semantics

Default recording window: **600 seconds before and 300 seconds after the triggering event**. The server receives selected telemetry continuously. An incident references a time interval; late-arriving events within that interval appear in subsequent investigations and exports. Every export is a point-in-time snapshot with its own manifest. `window_elapsed` means time has passed, **not** that collection is complete.

The agent keeps acknowledged ordinary events until its rolling retention cutoff; it never automatically removes unacknowledged events or events in pinned windows. Its default cap is **100,000 events or 64 MiB of logical JSON payload**, whichever is reached first. SQLite indexes, free pages and journal files add disk usage; this is not a physical filesystem quota. On exhaustion it stops advancing the collection checkpoint and reports an error instead of silently dropping queued data. Long outages can still outlast Sysmon's own retention.

The backend keeps received data until manually administered; automatic backend retention is **not implemented**. Do not run this unattended as a production archive. Investigation/export windows over 10,000 events fail explicitly; paginated event queries remain available. This first release prioritizes correctness over fleet scale.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

See [docs/VALIDATION.md](docs/VALIDATION.md) for executed tests and limitations. Dependency versions used for testing are recorded in `requirements-tested.txt`; `requirements-dev.txt` pins direct development dependencies.

## Project layout

- `backend/`: validated event contract, FastAPI routes, detection and SQLite persistence.
- `agent/`: Sysmon XML reader/parser, local buffer and authenticated HTTP client.
- `scripts/`: credential initialization, server runner, enrollment, replay and export verification.
- `config/`: narrowly scoped lab Sysmon configuration.
- `tests/`: backend, persistence, security-boundary, buffer and parser tests.
- `docs/`: architecture, Windows setup, security boundaries, API contract and roadmap.
- `runtime/`: generated credentials, databases and evidence; excluded from Git and this distribution.

## Status and next milestones

This is **not a production EDR**. There is no real isolation, quarantine, remote shell, enterprise login, signed updater or tamper-resistant evidence vault. Planned milestones are [documented here](docs/ROADMAP.md). The next product step is connecting the existing investigation interface to these APIs after validating the Windows collection path.
