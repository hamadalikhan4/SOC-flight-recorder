"""Analyst telemetry exploration and threat-hunting routes."""

from datetime import datetime
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)

from ...core.security import (
    require_admin,
)

from ...core.utils import (
    to_iso,
)

from ...db import Database

from ...repositories.events import (
    count_events,
    query_events,
)

from ...services.hunting import (
    assess_event,
)

from ..dependencies import (
    get_database,
)


router = APIRouter(
    prefix="/api/v1",
    tags=["Analyst"],
    dependencies=[
        Depends(require_admin)
    ],
)


@router.get("/events")
def events(

    # =====================================================
    # Endpoint filters
    # =====================================================

    endpoint_id: str | None = Query(
        default=None,
        description=(
            "Optional endpoint ID. "
            "Omit to hunt across all endpoints."
        ),
    ),

    category: str | None = Query(
        default=None,
        description=(
            "Exact normalized event category."
        ),
    ),

    process_guid: str | None = Query(
        default=None,
        description=(
            "Exact normalized process GUID."
        ),
    ),

    event_id: str | None = Query(
        default=None,
        max_length=200,
        description=(
            "Exact source event identifier."
        ),
    ),

    # =====================================================
    # Free-text search
    # =====================================================

    q: str = Query(
        default="",
        max_length=200,
        description=(
            "Free-text search across the "
            "normalized event payload."
        ),
    ),

    # =====================================================
    # Time range
    # =====================================================

    start_time: datetime | None = Query(
        default=None,
        description=(
            "Inclusive event timestamp lower bound."
        ),
    ),

    end_time: datetime | None = Query(
        default=None,
        description=(
            "Inclusive event timestamp upper bound."
        ),
    ),

    # =====================================================
    # Source
    # =====================================================

    source: Literal[
        "endpoint",
        "replay",
    ] | None = Query(
        default=None,
        description=(
            "Filter real endpoint telemetry "
            "or synthetic replay events."
        ),
    ),

    # =====================================================
    # Milestone 7B — Collector self-noise filtering
    # =====================================================

    collector_activity: Literal[
        "all",
        "hide",
        "only",
    ] = Query(
        default="all",
        description=(
            "Collector activity visibility. "
            "'all' returns every matching event; "
            "'hide' excludes recognized collector activity; "
            "'only' returns recognized collector activity. "
            "Events remain stored regardless of this filter."
        ),
    ),

    # =====================================================
    # Sort and pagination
    # =====================================================

    order: Literal[
        "asc",
        "desc",
    ] = Query(
        default="asc",
        description=(
            "Timestamp ordering."
        ),
    ),

    offset: int = Query(
        default=0,
        ge=0,
    ),

    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),

    database: Database = Depends(
        get_database
    ),
):

    # =====================================================
    # Validate time range
    # =====================================================

    if (
        start_time is not None
        and end_time is not None
        and start_time > end_time
    ):

        raise HTTPException(
            status_code=422,
            detail=(
                "start_time must be before "
                "or equal to end_time"
            ),
        )

    # =====================================================
    # Normalize time fields
    # =====================================================

    start_iso = (
        to_iso(start_time)
        if start_time
        else None
    )

    end_iso = (
        to_iso(end_time)
        if end_time
        else None
    )

    # =====================================================
    # Normalize process GUID
    # =====================================================

    normalized_guid = (
        process_guid
        .strip()
        .lower()
        if process_guid
        else None
    )

    # =====================================================
    # Execute count and query in one database snapshot
    # =====================================================

    with database.connect() as db:

        db.execute(
            "BEGIN"
        )

        total = count_events(
            db,

            endpoint_id=endpoint_id,

            category=category,

            process_guid=normalized_guid,

            event_id=event_id,

            query=q,

            start_time=start_iso,

            end_time=end_iso,

            source=source,

            collector_activity=collector_activity,
        )

        items = query_events(
            db,

            endpoint_id=endpoint_id,

            category=category,

            process_guid=normalized_guid,

            event_id=event_id,

            query=q,

            start_time=start_iso,

            end_time=end_iso,

            source=source,

            collector_activity=collector_activity,

            offset=offset,

            limit=limit,

            order=order,
        )

    # =====================================================
    # Attach hunting assessments
    # =====================================================

    for item in items:

        item["hunting"] = assess_event(
            item
        )

    # =====================================================
    # API response
    # =====================================================

    return {

        "items":
            items,

        "total":
            total,

        "offset":
            offset,

        "limit":
            limit,

        "has_more":
            offset
            + len(items)
            < total,

        "order":
            order,

        "filters": {

            "endpoint_id":
                endpoint_id,

            "category":
                category,

            "process_guid":
                normalized_guid,

            "event_id":
                event_id,

            "q":
                q,

            "start_time":
                start_iso,

            "end_time":
                end_iso,

            "source":
                source,

            "collector_activity":
                collector_activity,
        },

        "hunting_notice": (
            "Signal labels are deterministic analyst-priority "
            "heuristics, not malicious/benign verdicts. "
            "Collector classification is heuristic and affects "
            "search visibility only, not retained evidence "
            "or incident detection."
        ),
    }