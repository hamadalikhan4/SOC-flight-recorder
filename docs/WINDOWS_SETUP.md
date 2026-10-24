# Windows collection setup

Use a Windows lab device you administer. Start with the backend and recorder on the same device; this release's runner listens only on loopback. Replay does not require Sysmon; real collection does.

## 1. Install and configure Sysmon

Obtain Sysmon directly from Microsoft:
https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon

The official documentation describes events 1, 3, 11 and 22 and the `Microsoft-Windows-Sysmon/Operational` channel. Network collection must be enabled in the Sysmon configuration; do not assume default settings include it.

The supplied `config/sysmon-lab.xml` records process, DNS and network metadata and file creations under `C:\Lab\` only. Review it before use. It is a **lab configuration**, not a tuned fleet-wide policy. It may record sensitive command lines and destinations.

From an administrator PowerShell, using the actual location of your downloaded Sysmon executable:

```powershell
New-Item -ItemType Directory -Path C:\Lab -Force
.\Sysmon64.exe -s
.\Sysmon64.exe -i C:\path\to\soc-flight-recorder\config\sysmon-lab.xml
```

Read and accept Microsoft's license if prompted. The `-s` output shows the schema supported by your installed Sysmon; the example configuration uses schema 4.90. If Sysmon is already installed, **inspect and preserve the existing policy first**. Do not replace an organization-managed policy with this sample. On your own lab installation, apply an approved configuration with `-c` instead of reinstalling.

Verify collection:

```powershell
Get-WinEvent -LogName Microsoft-Windows-Sysmon/Operational -MaxEvents 5 |
    Select-Object TimeCreated, Id, RecordId
```

The account running the recorder must be allowed to read this channel. The collector invokes `agent/read_sysmon.ps1`; the host's PowerShell execution policy must permit that script. It does not bypass the policy. Use your normal administrator-approved signing/authorization process if execution is blocked.

## 2. Enroll the endpoint

With the backend already running and the virtual environment installed, run from the project root:

```powershell
.\.venv\Scripts\python.exe -m scripts.enroll --hostname "$env:COMPUTERNAME"
```

This creates `runtime/agent.json` with its own device credential. The agent **does not need `runtime/server.json` or an analyst token**. Enrollment refuses to overwrite an existing configuration. To re-enroll, revoke the former device token first, then specify a new `--out` filename and a new buffer path.

On Windows, restrict the runtime folder's access to the account running the service and the administrators who manage it. Python's POSIX file mode is not a Windows ACL. For a personal lab, inspect the existing ACL with `icacls runtime` and use Windows folder Security settings to remove unintended access. Keep databases and credentials out of synced/public folders.

## 3. Start the recorder

In a separate terminal in the project root:

```powershell
.\.venv\Scripts\python.exe -m agent.main --config runtime\agent.json
```

For a one-cycle diagnostic:

```powershell
.\.venv\Scripts\python.exe -m agent.main --config runtime\agent.json --once
```

A collection/delivery error makes `--once` exit with a nonzero status. The continuously running collector logs failures and retries. Stop with Ctrl+C; queued events remain on disk.

## 4. Generate harmless real telemetry

```powershell
Resolve-DnsName example.com
Set-Content C:\Lab\flight-recorder-test.txt "Harmless recorder verification"
```

These operations should produce appropriate events if your Sysmon policy collects them. They do **not** intentionally trigger the Office-to-PowerShell rule. Use the included synthetic replay to verify that rule without running a macro or malicious document.

Inspect the fleet and events with Swagger or `python -m scripts.inspect_lab`. Device identity returned by enrollment is authoritative; hostnames are display labels. Live and replay devices are distinct, and replay events carry `synthetic: true`.

## Troubleshooting

| Symptom | Check |
|---|---|
| Channel not found | Sysmon installation/service and Operational channel |
| Access denied | Rights to read the channel and local runtime directory |
| No network events | NetworkConnect policy is enabled |
| No file events | Test file is under `C:\Lab\` |
| Upload unauthorized | Correct device token; it has not been revoked |
| HTTP URL rejected | Only loopback HTTP is accepted; remote endpoints require verified HTTPS |
| Buffer full | Review stored/pinned windows and disk budget; no automatic destructive cleanup is provided |
| Recording lacks earlier activity | Agent start time, source log retention, delayed collection or a detected gap |

Multi-device TLS deployment and a Windows service installer are later milestones. Do not expose this lab backend directly to the Internet.
