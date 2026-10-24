"""Explainable threat-hunting heuristics.

These signals prioritize telemetry for analyst review.
They are not automatic incident verdicts and do not establish
that malicious activity occurred.
"""

from __future__ import annotations

from typing import Any

from ..core.config import (
    OFFICE_PARENT_IMAGES,
    POWERSHELL_IMAGES,
)

from .self_noise import (
    classify_collector_activity,
)


SHELL_IMAGES = {
    *POWERSHELL_IMAGES,
    "cmd.exe",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
}


SCRIPT_OR_LOLBIN_IMAGES = {
    "powershell.exe",
    "pwsh.exe",
    "cmd.exe",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
    "rundll32.exe",
    "regsvr32.exe",
    "certutil.exe",
    "bitsadmin.exe",
    "wmic.exe",
}


UNUSUAL_PARENT_IMAGES = {
    *OFFICE_PARENT_IMAGES,
    "acrord32.exe",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
}


USER_WRITABLE_MARKERS = (
    "\\users\\",
    "/users/",
    "\\appdata\\",
    "/appdata/",
    "\\temp\\",
    "/temp/",
    "\\downloads\\",
    "/downloads/",
    "\\programdata\\",
    "/programdata/",
)


POWERSHELL_ENCODING_MARKERS = (
    "-encodedcommand",
    "-enc ",
    "frombase64string",
)


POWERSHELL_EXECUTION_MARKERS = (
    "invoke-expression",
    "iex(",
    "iex ",
)


DOWNLOAD_MARKERS = (
    "downloadstring",
    "invoke-webrequest",
    "start-bitstransfer",
    "new-object net.webclient",
    "system.net.webclient",
    " iwr ",
    " curl ",
    " wget ",
)


def _basename(value: Any) -> str:
    if not value:
        return ""

    return (
        str(value)
        .replace("\\", "/")
        .rsplit("/", 1)[-1]
        .lower()
    )


def _text(event: dict) -> str:
    fields = (
        event.get("command_line"),
        event.get("target"),
        event.get("image"),
        event.get("parent_image"),
    )

    return " ".join(
        str(value)
        for value in fields
        if value
    ).lower()


def _contains_any(
    value: str,
    markers,
) -> bool:
    return any(
        marker in value
        for marker in markers
    )


def _signal(
    signal_id: str,
    title: str,
    reason: str,
    weight: int,
) -> dict:
    return {
        "id": signal_id,
        "title": title,
        "reason": reason,
        "weight": weight,
    }


def assess_event(
    event: dict,
) -> dict:
    """
    Produce deterministic analyst-priority signals.

    The score is not a probability of compromise.

    Collector classification is additional metadata,
    not a scoring exemption.

    The source event is not modified or discarded.
    """

    signals = []

    category = str(
        event.get("category") or ""
    ).lower()

    image = _basename(
        event.get("image")
    )

    parent_image = _basename(
        event.get("parent_image")
    )

    text = _text(
        event
    )

    raw_image = str(
        event.get("image") or ""
    ).lower()

    # ---------------------------------------------------------
    # Office -> shell
    # ---------------------------------------------------------

    if (
        category == "process"
        and parent_image in OFFICE_PARENT_IMAGES
        and image in SHELL_IMAGES
    ):
        signals.append(
            _signal(
                "office_to_shell",
                "Office application spawned a shell",
                (
                    f"{parent_image or 'Office process'} "
                    f"started {image or 'a shell process'}."
                ),
                75,
            )
        )

    # ---------------------------------------------------------
    # Encoded PowerShell
    # ---------------------------------------------------------

    if (
        image in POWERSHELL_IMAGES
        and _contains_any(
            text,
            POWERSHELL_ENCODING_MARKERS,
        )
    ):
        signals.append(
            _signal(
                "encoded_powershell",
                "Encoded PowerShell command",
                (
                    "The recorded PowerShell command contains "
                    "an encoded-command or Base64 decoding indicator."
                ),
                45,
            )
        )

    # ---------------------------------------------------------
    # Dynamic PowerShell execution
    # ---------------------------------------------------------

    if (
        image in POWERSHELL_IMAGES
        and _contains_any(
            text,
            POWERSHELL_EXECUTION_MARKERS,
        )
    ):
        signals.append(
            _signal(
                "powershell_dynamic_execution",
                "Dynamic PowerShell execution pattern",
                (
                    "The recorded command contains an "
                    "Invoke-Expression style execution pattern."
                ),
                35,
            )
        )

    # ---------------------------------------------------------
    # Download-oriented PowerShell
    # ---------------------------------------------------------

    if (
        image in POWERSHELL_IMAGES
        and _contains_any(
            text,
            DOWNLOAD_MARKERS,
        )
    ):
        signals.append(
            _signal(
                "powershell_download",
                "PowerShell download behavior",
                (
                    "The recorded command contains a network "
                    "download-oriented PowerShell pattern."
                ),
                35,
            )
        )

    # ---------------------------------------------------------
    # Shell-associated network activity
    # ---------------------------------------------------------

    if (
        category == "network"
        and image in SCRIPT_OR_LOLBIN_IMAGES
    ):
        signals.append(
            _signal(
                "shell_network",
                "Shell-associated network activity",
                (
                    f"A {image} event contains recorded "
                    "network activity."
                ),
                25,
            )
        )

    # ---------------------------------------------------------
    # Shell-associated DNS activity
    # ---------------------------------------------------------

    if (
        category == "dns"
        and image in SCRIPT_OR_LOLBIN_IMAGES
    ):
        signals.append(
            _signal(
                "shell_dns",
                "Shell-associated DNS activity",
                (
                    f"A {image} event contains recorded "
                    "DNS activity."
                ),
                20,
            )
        )

    # ---------------------------------------------------------
    # Process launched from user-writable path
    # ---------------------------------------------------------

    if (
        category == "process"
        and raw_image
        and _contains_any(
            raw_image,
            USER_WRITABLE_MARKERS,
        )
    ):
        signals.append(
            _signal(
                "user_writable_execution",
                "Execution from user-writable location",
                (
                    "The executable path is recorded under a "
                    "commonly user-writable location."
                ),
                30,
            )
        )

    # ---------------------------------------------------------
    # Unusual parent -> script/shell relationship
    # ---------------------------------------------------------

    if (
        category == "process"
        and parent_image in UNUSUAL_PARENT_IMAGES
        and image in SCRIPT_OR_LOLBIN_IMAGES
        and not (
            parent_image in OFFICE_PARENT_IMAGES
            and image in SHELL_IMAGES
        )
    ):
        signals.append(
            _signal(
                "unusual_parent_child",
                "Unusual parent-child relationship",
                (
                    f"{parent_image} started {image}. "
                    "This relationship may warrant review."
                ),
                40,
            )
        )

    # ---------------------------------------------------------
    # Sort existing hunting signals
    # ---------------------------------------------------------

    signals.sort(
        key=lambda item: item["weight"],
        reverse=True,
    )

    score = min(
        100,
        sum(
            item["weight"]
            for item in signals
        ),
    )

    # ---------------------------------------------------------
    # Preserve existing classification thresholds
    # ---------------------------------------------------------

    if score >= 70:
        level = "high_signal"
        label = "High signal"

    elif score >= 30:
        level = "needs_review"
        label = "Needs review"

    else:
        level = "context_only"
        label = "Context only"

    # ---------------------------------------------------------
    # Milestone 7B: Spectra collector classification
    #
    # This adds metadata only.
    #
    # It does NOT:
    # - change the hunting score
    # - suppress detections
    # - delete events
    # - modify the original event
    # ---------------------------------------------------------

    collector_activity = classify_collector_activity(
        event
    )

    return {
        "score": score,
        "level": level,
        "label": label,
        "signals": signals,

        "collector_activity": collector_activity,

        "disclaimer": (
            "Deterministic hunting heuristic only. "
            "This is not a malicious/benign verdict."
        ),
    }