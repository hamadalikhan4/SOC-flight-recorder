"""Backend audit trail routes."""

from fastapi import (
    APIRouter,
    Depends,
    Query,
)

from ...core.security import (
    require_admin,
)

from ...db import Database

from ...repositories.audit import (
    list_audit,
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


@router.get("/audit")
def audit(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),

    offset: int = Query(
        default=0,
        ge=0,
    ),

    q: str = Query(
        default="",
        max_length=200,
    ),

    action: str = Query(
        default="",
        max_length=100,
    ),

    database: Database = Depends(
        get_database
    ),
):
    with database.connect() as db:
        rows = list_audit(
            db,
            limit=limit,
            offset=offset,
            query=q,
            action=action,
        )

    return [
        dict(row)
        for row in rows
    ]