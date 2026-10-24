"""Endpoint enrollment and fleet management routes."""

import hashlib
import json
import secrets
import uuid

from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
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
from ...models import Enroll

from ...repositories.endpoints import (
    create_endpoint,
    list_endpoints,
    revoke_endpoint,
)

from ...services.audit import (
    write_audit,
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


@router.post(
    "/endpoints",
    status_code=201,
)
def enroll(
    body: Enroll,

    database: Database = Depends(
        get_database
    ),

    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    ident = str(
        uuid.uuid4()
    )

    token = (
        secrets.token_urlsafe(
            32
        )
    )

    captured = to_iso(
        utc_now()
    )

    token_hash = hashlib.sha256(
        token.encode()
    ).hexdigest()

    with database.connect() as db:
        create_endpoint(
            db,
            endpoint_id=ident,
            hostname=body.hostname,
            platform=body.platform,
            token_hash=token_hash,
            created_at=captured,
        )

        write_audit(
            db,
            captured,
            "analyst",
            "endpoint.enroll",
            ident,
            body.hostname,
        )

    return {
        "endpoint_id":
            ident,

        "agent_token":
            token,

        "pre_seconds":
            settings.pre_seconds,

        "post_seconds":
            settings.post_seconds,
    }


@router.get("/endpoints")
def endpoints(
    database: Database = Depends(
        get_database
    ),
):
    with database.connect() as db:
        rows = list_endpoints(
            db
        )

    result = []

    captured = utc_now()

    for row in rows:
        value = dict(row)

        value["heartbeat"] = (
            json.loads(
                value["heartbeat"]
            )
            if value["heartbeat"]
            else None
        )

        age = (
            (
                captured
                - datetime.fromisoformat(
                    value["last_seen"]
                )
            ).total_seconds()

            if value["last_seen"]
            else None
        )

        value["status"] = (
            "revoked"
            if value["revoked"]

            else "never_seen"
            if age is None

            else "online"
            if age < 90

            else "offline"
        )

        result.append(
            value
        )

    return result


@router.post(
    "/endpoints/{ident}/revoke"
)
def revoke(
    ident: str,

    database: Database = Depends(
        get_database
    ),
):
    captured = to_iso(
        utc_now()
    )

    with database.connect() as db:
        changed = revoke_endpoint(
            db,
            ident,
        )

        if not changed:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Endpoint not found"
                ),
            )

        write_audit(
            db,
            captured,
            "analyst",
            "endpoint.revoke",
            ident,
        )

    return {
        "revoked": True
    }