"""Incident investigation and evidence routes."""

from fastapi import (
    APIRouter,
    Depends,
    Query,
)

from fastapi.responses import Response

from ...core.config import RecorderSettings
from ...core.security import require_admin
from ...core.utils import (
    utc_now,
    to_iso,
)

from ...db import Database
from ...models import Disposition

from ...repositories.incidents import (
    list_incidents,
    update_incident_status,
)

from ...services.audit import (
    write_audit,
)

from ...services.evidence import (
    build_evidence_package,
)

from ...services.incidents import (
    decode_event_rows,
    get_incident,
    recording_metadata,
    recording_window_rows,
)

from ..dependencies import (
    get_database,
    get_settings,
)


router = APIRouter(
    prefix="/api/v1/incidents",
    tags=["Analyst"],
    dependencies=[
        Depends(require_admin)
    ],
)


# ---------------------------------------------------------------------------
# Incident inventory
# ---------------------------------------------------------------------------

@router.get("")
def incidents(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),

    offset: int = Query(
        default=0,
        ge=0,
    ),

    database: Database = Depends(
        get_database
    ),
):
    captured = to_iso(
        utc_now()
    )

    with database.connect() as db:
        rows = list_incidents(
            db,
            limit=limit,
            offset=offset,
        )

    return [
        recording_metadata(
            dict(row),
            captured,
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Incident details
# ---------------------------------------------------------------------------

@router.get("/{ident}")
def details(
    ident: str,

    database: Database = Depends(
        get_database
    ),

    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    with database.connect() as db:
        item = get_incident(
            db,
            ident,
        )

        rows = recording_window_rows(
            db,
            item,
            settings.export_event_limit,
        )

    item = recording_metadata(
        item,
        to_iso(
            utc_now()
        ),
    )

    events = decode_event_rows(
        rows
    )

    item["event_count"] = len(
        events
    )

    item["events"] = events

    item["known_gaps"] = [
        event
        for event in events
        if (
            event.get(
                "category"
            )
            == "health"
        )
    ]

    return item


# ---------------------------------------------------------------------------
# Process tree
# ---------------------------------------------------------------------------

@router.get(
    "/{ident}/process-tree"
)
def process_tree(
    ident: str,

    database: Database = Depends(
        get_database
    ),

    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    with database.connect() as db:
        item = get_incident(
            db,
            ident,
        )

        rows = recording_window_rows(
            db,
            item,
            settings.export_event_limit,
        )

    events = decode_event_rows(
        rows
    )

    nodes = {}

    for event in events:
        if (
            event.get(
                "category"
            )
            == "process"
            and event.get(
                "process_guid"
            )
        ):
            nodes.setdefault(
                event["process_guid"],
                event,
            )

    edges = []
    missing = []

    for guid, event in nodes.items():
        parent = event.get(
            "parent_guid"
        )

        if (
            parent
            and parent != guid
            and parent in nodes
        ):
            edges.append(
                {
                    "parent": parent,
                    "child": guid,
                }
            )

        elif parent:
            missing.append(
                {
                    "process_guid":
                        guid,

                    "missing_parent_guid":
                        parent,
                }
            )

    return {
        "endpoint_id":
            item["endpoint_id"],

        "nodes":
            list(
                nodes.values()
            ),

        "edges":
            edges,

        "unresolved_parents":
            missing,

        "scope": (
            "recording window only; "
            "PID reuse never creates an edge"
        ),
    }


# ---------------------------------------------------------------------------
# Incident disposition
# ---------------------------------------------------------------------------

@router.patch("/{ident}")
def disposition(
    ident: str,
    body: Disposition,

    database: Database = Depends(
        get_database
    ),
):
    captured = to_iso(
        utc_now()
    )

    with database.connect() as db:
        # Confirms the incident exists.
        get_incident(
            db,
            ident,
        )

        update_incident_status(
            db,
            incident_id=ident,
            status=body.status,
        )

        write_audit(
            db,
            captured,
            "analyst",
            "incident."
            + body.status,
            ident,
            body.note,
        )

    return {
        "id": ident,
        "status": body.status,
    }


# ---------------------------------------------------------------------------
# Evidence export
# ---------------------------------------------------------------------------

@router.get(
    "/{ident}/evidence"
)
def evidence(
    ident: str,

    database: Database = Depends(
        get_database
    ),

    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    exported_at = to_iso(
        utc_now()
    )

    with database.connect() as db:
        db.execute(
            "BEGIN"
        )

        item = get_incident(
            db,
            ident,
        )

        item = recording_metadata(
            item,
            exported_at,
        )

        rows = recording_window_rows(
            db,
            item,
            settings.export_event_limit,
        )

        events = decode_event_rows(
            rows
        )

        package = build_evidence_package(
            item,
            events,
            exported_at,
        )

    # Record evidence generation separately after
    # the package has been successfully built.
    with database.connect() as db:
        write_audit(
            db,
            exported_at,
            "analyst",
            "evidence.export",
            ident,
            f"{len(events)} events",
        )

    return Response(
        package,
        media_type="application/zip",
        headers={
            "Content-Disposition":
                (
                    'attachment; '
                    f'filename="evidence-{ident}.zip"'
                )
        },
    )