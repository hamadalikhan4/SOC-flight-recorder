"""Application-level configuration for the SOC Flight Recorder."""

from dataclasses import dataclass


RULE_ID = "DET-PS-014"

RULE_NAME = "Office application spawned PowerShell"

RULE_SEVERITY = "high"

RULE_TECHNIQUE = "T1059.001"

RULE_CATEGORY = "process"


OFFICE_PARENT_IMAGES = frozenset(
    {
        "winword.exe",
        "excel.exe",
        "powerpnt.exe",
        "outlook.exe",
    }
)


POWERSHELL_IMAGES = frozenset(
    {
        "powershell.exe",
        "pwsh.exe",
    }
)


DEFAULT_PRE_SECONDS = 600

DEFAULT_POST_SECONDS = 300

MAX_REQUEST_BYTES = 2 * 1024 * 1024

EXPORT_EVENT_LIMIT = 10_000


@dataclass(frozen=True)
class RecorderSettings:
    """Runtime settings attached to the FastAPI application."""

    pre_seconds: int = DEFAULT_PRE_SECONDS
    post_seconds: int = DEFAULT_POST_SECONDS
    max_request_bytes: int = MAX_REQUEST_BYTES
    export_event_limit: int = EXPORT_EVENT_LIMIT

    rule_id: str = RULE_ID
    rule_name: str = RULE_NAME
    rule_severity: str = RULE_SEVERITY
    rule_technique: str = RULE_TECHNIQUE
    rule_category: str = RULE_CATEGORY

    def validate(self) -> None:
        if not 0 <= self.pre_seconds <= 3600:
            raise ValueError(
                "pre_seconds must be between 0 and 3600"
            )

        if not 0 <= self.post_seconds <= 1800:
            raise ValueError(
                "post_seconds must be between 0 and 1800"
            )

        if self.max_request_bytes <= 0:
            raise ValueError(
                "max_request_bytes must be positive"
            )

        if self.export_event_limit <= 0:
            raise ValueError(
                "export_event_limit must be positive"
            )