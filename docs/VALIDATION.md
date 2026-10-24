# Validation report

Build date: 11 September 2026. Environment: Linux, Python 3.12.

## Executed

- 30 automated test cases passed.
- Live Uvicorn server and stdlib HTTP client replay: 7 newly delivered events, 1 incident, 4 process nodes and 3 edges.
- Second replay: 0 newly delivered events; the existing incident was reused.
- Exported ZIP passed independent SHA-256 verification for both artifacts.
- All Python files compiled successfully.

The automated tests exercise cross-endpoint separation, analyst/device authorization, token revocation, conflicting duplicates and rollback, out-of-order arrivals, process PID reuse, clock/schema/body-size validation, event filters, incident disposition, audit records, buffer restart and pruning, byte/event capacity rollback, failed upload preservation, Sysmon XML normalization, source reset/rollover handling and rejection of tampered exports.

Two dependency deprecation warnings occurred in the test client's httpx/AnyIO integration. They did not affect results; future dependency upgrades should re-run the suite.

## Not validated

- Actual Windows Sysmon installation, PowerShell execution policy and event-log permissions.
- Real Windows source-event arrival, collection throughput, CPU/RAM footprint or long-duration behavior.
- Browser UI interaction or integration of the earlier hosted prototype.
- Remote TLS deployment, production security, load testing and multi-host operation.

Do not infer operational or production readiness from unit/integration success alone. The next validation gate is real collection on a Windows lab endpoint.
