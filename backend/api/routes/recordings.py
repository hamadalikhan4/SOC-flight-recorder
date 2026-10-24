"""Recording inventory routes."""

from fastapi import (
    APIRouter,
    Depends,
    Query,
)

from ...core.config import (
    RecorderSettings,
)

from ...core.security import (
    require_admin,
)

from ...core.utils import (
    utc_now,
    to_iso,
)

from ...db import Database

from ...repositories.recordings import (
    count_recordings,
    list_recordings,
    list_recent_evidence_exports,
)

from ..dependencies import (
    get_database,
    get_settings,
)


router = APIRouter(
    prefix="/api/v1",
    tags=["Analyst"],
    dependencies=[
        Depends(require_admin)
    ],
)


@router.get("/recordings")
def recordings(
    q: str = Query(
        default="",
        max_length=200,
    ),

    endpoint_id: str | None = None,

    window_state: str = Query(
        default="",
        pattern=(
            "^(collecting|window_elapsed)?$"
        ),
    ),

    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),

    offset: int = Query(
        default=0,
        ge=0,
    ),

    database: Database = Depends(
        get_database
    ),

    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    captured = to_iso(
        utc_now()
    )

    with database.connect() as db:
        db.execute(
            "BEGIN"
        )

        total = count_recordings(
            db,
            query=q,
            endpoint_id=endpoint_id,
            window_state=window_state,
            captured_at=captured,
        )

        rows = list_recordings(
            db,
            query=q,
            endpoint_id=endpoint_id,
            window_state=window_state,
            captured_at=captured,
            limit=limit,
            offset=offset,
        )

        exports = [
            dict(row)

            for row in (
                list_recent_evidence_exports(
                    db,
                    limit=10,
                )
            )
        ]

    items = []

    for row in rows:
        item = dict(row)

        item["window_state"] = (
            "collecting"
            if (
                item["window_end"]
                > captured
            )
            else
            "window_elapsed"
        )

        item["coverage"] = (
            "unknown"
        )

        item["export_available"] = (
            item["event_count"]
            <=
            settings.export_event_limit
        )

        items.append(
            item
        )

    return {
        "items":
            items,

        "total":
            total,

        "limit":
            limit,

        "offset":
            offset,

        "captured_at":
            captured,

        "recent_exports":
            exports,

        "export_event_limit":
            settings.export_event_limit,

        "scope": (
            "Incident windows over retained endpoint events. "
            "Windows may overlap. Exports are generated on demand; "
            "ZIPs are not archived on this server."
        ),
    }