"""Versioned, size-bounded event contract shared with endpoint clients."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )


class Event(StrictModel):
    event_id: str = Field(
        min_length=16,
        max_length=128,
        pattern=r"^[a-zA-Z0-9_-]+$",
    )

    timestamp: datetime

    category: Literal[
        "process",
        "network",
        "dns",
        "file",
        "health",
    ]

    process_guid: str | None = Field(
        default=None,
        max_length=128,
    )

    parent_guid: str | None = Field(
        default=None,
        max_length=128,
    )

    process_id: int | None = Field(
        default=None,
        ge=0,
    )

    image: str = Field(
        default="",
        max_length=2048,
    )

    parent_image: str = Field(
        default="",
        max_length=2048,
    )

    command_line: str = Field(
        default="",
        max_length=16384,
    )

    user: str = Field(
        default="",
        max_length=512,
    )

    target: str = Field(
        default="",
        max_length=4096,
    )

    source_record_id: int = Field(
        ge=0
    )

    source_epoch: str = Field(
        min_length=1,
        max_length=128,
    )

    provider: str = Field(
        default="Microsoft-Windows-Sysmon",
        max_length=128,
    )

    synthetic: bool = False

    @field_validator(
        "timestamp"
    )
    @classmethod
    def utc_timestamp(
        cls,
        value,
    ):
        if value.tzinfo is None:
            raise ValueError(
                "timestamp must have a timezone"
            )

        return value.astimezone(
            timezone.utc
        )

    @field_validator(
        "process_guid",
        "parent_guid",
    )
    @classmethod
    def normalize_guid(
        cls,
        value,
    ):
        return (
            value.lower()
            if value
            else None
        )


class Batch(StrictModel):
    schema_version: Literal[1] = 1

    events: list[Event] = Field(
        min_length=1,
        max_length=200,
    )


class Enroll(StrictModel):
    hostname: str = Field(
        min_length=1,
        max_length=128,
    )

    platform: Literal[
        "windows",
        "replay",
    ] = "windows"


class Heartbeat(StrictModel):
    """
    Endpoint collector health information.

    Older clients remain compatible because all new
    Milestone 7A fields have defaults.
    """

    queued_events: int = Field(
        ge=0
    )

    buffer_events: int = Field(
        ge=0
    )

    # Last Sysmon record successfully checkpointed
    # by the Spectra collector.
    last_record_id: int = Field(
        ge=0
    )

    # Newest record currently visible in the
    # local Sysmon Operational log.
    latest_record_id: int | None = Field(
        default=None,
        ge=0,
    )

    # Oldest record still available in the
    # local Sysmon Operational log.
    oldest_record_id: int | None = Field(
        default=None,
        ge=0,
    )

    # Position difference between the newest
    # Sysmon record and Spectra's checkpoint.
    #
    # This is collector record-position lag,
    # not necessarily an exact count of
    # security events awaiting ingestion.
    record_lag: int | None = Field(
        default=None,
        ge=0,
    )

    telemetry_state: Literal[
        "unknown",
        "caught_up",
        "near_realtime",
        "catching_up",
    ] = "unknown"

    # UTC timestamp of the most recent successful
    # Sysmon collection cycle.
    last_collection_at: str | None = Field(
        default=None,
        max_length=64,
    )

    # Number of raw Sysmon records returned during
    # the most recent collection cycle.
    last_collection_count: int = Field(
        default=0,
        ge=0,
    )

    collector_status: Literal[
        "running",
        "replay",
        "error",
    ]

    message: str = Field(
        default="",
        max_length=1024,
    )

    @field_validator(
        "last_collection_at"
    )
    @classmethod
    def validate_collection_time(
        cls,
        value,
    ):
        if value is None:
            return None

        try:
            parsed = datetime.fromisoformat(
                value.replace(
                    "Z",
                    "+00:00",
                )
            )

        except ValueError as exc:
            raise ValueError(
                "last_collection_at must be "
                "an ISO 8601 timestamp"
            ) from exc

        if parsed.tzinfo is None:
            raise ValueError(
                "last_collection_at must "
                "include a timezone"
            )

        return value


class Disposition(StrictModel):
    status: Literal[
        "open",
        "resolved",
    ]

    note: str = Field(
        min_length=1,
        max_length=2000,
    )