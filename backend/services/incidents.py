"""Shared incident and recording-window services."""

import json

from fastapi import HTTPException

from ..repositories.incidents import (
    find_incident,
    select_window_events,
)


def get_incident(
    db,
    incident_id: str,
) -> dict:
    row = find_incident(
        db,
        incident_id,
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    return dict(row)


def recording_metadata(
    incident: dict,
    current_time_iso: str,
) -> dict:
    incident["window_state"] = (
        "collecting"
        if (
            current_time_iso
            < incident["window_end"]
        )
        else
        "window_elapsed"
    )

    incident["coverage"] = (
        "unknown: elapsed window does not "
        "guarantee complete telemetry"
    )

    return incident


def recording_window_rows(
    db,
    incident: dict,
    event_limit: int,
):
    rows = select_window_events(
        db,
        endpoint_id=
            incident[
                "endpoint_id"
            ],
        window_start=
            incident[
                "window_start"
            ],
        window_end=
            incident[
                "window_end"
            ],
        limit=
            event_limit + 1,
    )

    if (
        len(rows)
        > event_limit
    ):
        raise HTTPException(
            status_code=413,
            detail=(
                "Recording exceeds the lab release "
                f"limit of {event_limit} events; "
                "use paginated event queries"
            ),
        )

    return rows


def decode_event_rows(
    rows,
) -> list[dict]:
    return [
        json.loads(
            row["payload"]
        )
        for row in rows
    ]