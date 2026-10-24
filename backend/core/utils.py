"""Small shared backend utility helpers."""

import json
from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime."""

    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    """Normalize a datetime into UTC ISO-8601 format."""

    return value.astimezone(
        timezone.utc
    ).isoformat(
        timespec="microseconds"
    )


def canonical_json(value) -> str:
    """Serialize data into stable canonical JSON."""

    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )