"""Endpoint agent ingestion routes."""

import uuid

from datetime import timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from ...core.config import (
    RecorderSettings,
)

from ...core.security import (
    require_agent,
)

from ...core.utils import (
    utc_now,
    to_iso,
    canonical_json,
)

from ...db import Database

from ...models import (
    Batch,
    Heartbeat,
)

from ...repositories.endpoints import (
    update_heartbeat,
    update_last_seen,
)

from ...repositories.events import (
    find_event_payload,
    insert_event,
)

from ...repositories.incidents import (
    insert_incident,
)

from ...services.audit import (
    write_audit,
)

from ...services.detection import (
    matches_office_powershell_rule,
)

from ..dependencies import (
    get_database,
    get_settings,
)


router = APIRouter(
    prefix="/api/v1/agent",
    tags=["Agent"],
)


@router.post("/heartbeat")
def heartbeat(
    body: Heartbeat,

    endpoint_id: str = Depends(
        require_agent
    ),

    database: Database = Depends(
        get_database
    ),
):
    captured = to_iso(
        utc_now()
    )

    heartbeat_payload = (
        canonical_json(
            body.model_dump()
        )
    )

    with database.connect() as db:
        update_heartbeat(
            db,
            endpoint_id=
                endpoint_id,
            last_seen=
                captured,
            heartbeat=
                heartbeat_payload,
        )

    return {
        "accepted": True
    }


@router.post("/events")
def ingest(
    body: Batch,

    endpoint_id: str = Depends(
        require_agent
    ),

    database: Database = Depends(
        get_database
    ),

    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    inserted = 0
    created = []

    with database.connect() as db:
        for event in body.events:
            current_time = utc_now()

            if (
                event.timestamp
                >
                current_time
                + timedelta(
                    minutes=5
                )
            ):
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Event timestamp exceeds "
                        "allowed future clock skew"
                    ),
                )

            payload = event.model_dump(
                mode="json"
            )

            payload["timestamp"] = (
                to_iso(
                    event.timestamp
                )
            )

            encoded = canonical_json(
                payload
            )

            existing = find_event_payload(
                db,
                endpoint_id=
                    endpoint_id,
                event_id=
                    event.event_id,
            )

            if existing:
                if (
                    existing["payload"]
                    != encoded
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Event ID reused with different content; "
                            "entire batch rolled back"
                        ),
                    )

                continue

            received_at = to_iso(
                utc_now()
            )

            insert_event(
                db,

                endpoint_id=
                    endpoint_id,

                event_id=
                    event.event_id,

                timestamp=
                    to_iso(
                        event.timestamp
                    ),

                category=
                    event.category,

                process_guid=
                    event.process_guid,

                parent_guid=
                    event.parent_guid,

                payload=
                    encoded,

                received_at=
                    received_at,
            )

            inserted += 1

            if (
                matches_office_powershell_rule(
                    event
                )
            ):
                incident_id = str(
                    uuid.uuid4()
                )

                created_at = to_iso(
                    utc_now()
                )

                insert_incident(
                    db,

                    incident_id=
                        incident_id,

                    endpoint_id=
                        endpoint_id,

                    trigger_event_id=
                        event.event_id,

                    rule_id=
                        settings.rule_id,

                    process_guid=
                        event.process_guid,

                    title=
                        settings.rule_name,

                    severity=
                        settings.rule_severity,

                    technique=
                        settings.rule_technique,

                    triggered_at=
                        to_iso(
                            event.timestamp
                        ),

                    window_start=
                        to_iso(
                            event.timestamp
                            - timedelta(
                                seconds=
                                    settings.pre_seconds
                            )
                        ),

                    window_end=
                        to_iso(
                            event.timestamp
                            + timedelta(
                                seconds=
                                    settings.post_seconds
                            )
                        ),

                    created_at=
                        created_at,
                )

                created.append(
                    incident_id
                )

                write_audit(
                    db,
                    created_at,
                    endpoint_id,
                    "incident.created",
                    incident_id,
                    settings.rule_id,
                )

        update_last_seen(
            db,

            endpoint_id=
                endpoint_id,

            last_seen=
                to_iso(
                    utc_now()
                ),
        )

    return {
        "accepted_ids": [
            event.event_id
            for event in body.events
        ],

        "inserted":
            inserted,

        "duplicates":
            len(body.events)
            - inserted,

        "incident_ids":
            created,
    }