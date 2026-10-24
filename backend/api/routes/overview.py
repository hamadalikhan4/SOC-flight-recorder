"""Analyst operations overview routes."""

from datetime import timedelta

from fastapi import (
    APIRouter,
    Depends,
)

from ...core.security import (
    require_admin,
)

from ...core.utils import (
    utc_now,
    to_iso,
)

from ...db import Database

from ...repositories.overview import (
    get_activity_counts,
    get_overview_totals,
    list_event_categories,
    list_recent_audit_records,
    list_recent_open_incidents,
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


@router.get("/overview")
def overview(
    database: Database = Depends(
        get_database
    ),
):
    captured = utc_now()

    start = (
        captured.replace(
            minute=0,
            second=0,
            microsecond=0,
        )
        - timedelta(
            hours=23
        )
    )

    start_iso = to_iso(
        start
    )

    captured_iso = to_iso(
        captured
    )

    with database.connect() as db:
        db.execute(
            "BEGIN"
        )

        totals = (
            get_overview_totals(
                db
            )
        )

        categories = [
            dict(row)
            for row in (
                list_event_categories(
                    db
                )
            )
        ]

        activity = (
            get_activity_counts(
                db,
                start=start_iso,
                end=captured_iso,
            )
        )

        recent_incidents = [
            dict(row)
            for row in (
                list_recent_open_incidents(
                    db,
                    limit=5,
                )
            )
        ]

        recent_audit = [
            dict(row)
            for row in (
                list_recent_audit_records(
                    db,
                    limit=5,
                )
            )
        ]

    buckets = []

    for index in range(24):
        bucket_time = (
            start
            + timedelta(
                hours=index
            )
        )

        bucket_iso = to_iso(
            bucket_time
        )

        buckets.append(
            {
                "hour":
                    bucket_iso,

                "count":
                    activity.get(
                        bucket_iso[:13],
                        0,
                    ),
            }
        )

    return {
        "captured_at":
            captured_iso,

        "totals":
            totals,

        "categories":
            categories,

        "activity":
            buckets,

        "recent_incidents":
            recent_incidents,

        "recent_audit":
            recent_audit,

        "scope": (
            "All retained records, including synthetic replay. "
            "Activity counts server receipt times."
        ),
    }