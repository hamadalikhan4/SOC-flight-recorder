"""
Identify likely Spectra-generated endpoint activity.

Classification is derived from retained event metadata.

Important:
- Never discard or modify the original event.
- Never suppress an alert based only on this classifier.
- Never identify an event as collector activity merely
  because it involves PowerShell, Python or localhost.
- Classification is heuristic, not cryptographic proof
  of process identity.
"""

from __future__ import annotations

import re
from typing import Any


POWERSHELL_IMAGES = {
    "powershell.exe",
    "pwsh.exe",
}

PYTHON_IMAGES = {
    "python.exe",
    "pythonw.exe",
    "py.exe",
}


# Match a PowerShell invocation of the specific
# Spectra collector script.
#
# Supports:
# -File D:\soc-flight-recorder\agent\read_sysmon.ps1
# -File "D:\my lab\agent\read_sysmon.ps1"

SYSMON_READER_PATTERN = re.compile(
    r"""
    (?:^|\s)
    -file
    \s+
    (?:
        "[^"]*[\\/]agent[\\/]read_sysmon\.ps1"
        |
        '[^']*[\\/]agent[\\/]read_sysmon\.ps1'
        |
        [^\s"']*[\\/]agent[\\/]read_sysmon\.ps1
    )
    (?=\s|$)
    """,
    re.IGNORECASE | re.VERBOSE,
)


# Match:
#
# python.exe -m agent.main
# python.exe -m agent.main --config runtime\agent.json

AGENT_MODULE_PATTERN = re.compile(
    r"(?:^|\s)-m\s+agent\.main(?=\s|$)",
    re.IGNORECASE,
)


def basename(value: Any) -> str:
    if not value:
        return ""

    return (
        str(value)
        .replace("\\", "/")
        .rsplit("/", 1)[-1]
        .lower()
    )


def classification(
    tagged: bool = False,
    kind: str | None = None,
    reason: str = "",
) -> dict:
    return {
        "tagged": tagged,
        "kind": kind,
        "reason": reason,
    }


def classify_collector_activity(
    event: dict,
) -> dict:
    """
    Identify directly recognizable Spectra process events.

    This function does not modify the input event.

    Only process-creation records with specific command
    signatures are tagged in this initial implementation.
    """

    if event.get("synthetic"):
        return classification()

    category = str(
        event.get("category") or ""
    ).lower()

    if category != "process":
        return classification()

    image = basename(
        event.get("image")
    )

    command_line = str(
        event.get("command_line") or ""
    )

    # --------------------------------------------------
    # Spectra Sysmon reader
    # --------------------------------------------------

    if (
        image in POWERSHELL_IMAGES
        and SYSMON_READER_PATTERN.search(command_line)
    ):
        return classification(
            tagged=True,
            kind="sysmon_reader",
            reason=(
                "Process command line matches the "
                "Spectra Sysmon collection script."
            ),
        )

    # --------------------------------------------------
    # Spectra Python agent
    # --------------------------------------------------

    if (
        image in PYTHON_IMAGES
        and AGENT_MODULE_PATTERN.search(command_line)
    ):
        return classification(
            tagged=True,
            kind="spectra_agent",
            reason=(
                "Process command line matches the "
                "Spectra endpoint agent module."
            ),
        )

    return classification()