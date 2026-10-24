"""Authentication helpers for analyst and endpoint requests."""

import hashlib
import hmac

from fastapi import (
    Depends,
    HTTPException,
    Request,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

from ..repositories.endpoints import (
    find_active_endpoint_by_token_hash,
)


bearer = HTTPBearer(
    auto_error=False
)


def require_admin(
    request: Request,

    auth: HTTPAuthorizationCredentials
    | None = Depends(bearer),
) -> str:
    if auth is None:
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid analyst credentials"
            ),
            headers={
                "WWW-Authenticate":
                    "Bearer"
            },
        )

    admin_token = (
        request.app.state
        .admin_token
    )

    if not hmac.compare_digest(
        auth.credentials,
        admin_token,
    ):
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid analyst credentials"
            ),
            headers={
                "WWW-Authenticate":
                    "Bearer"
            },
        )

    return "analyst"


def require_agent(
    request: Request,

    auth: HTTPAuthorizationCredentials
    | None = Depends(bearer),
) -> str:
    if auth is None:
        raise HTTPException(
            status_code=401,
            detail=(
                "Device credentials required"
            ),
        )

    token_hash = hashlib.sha256(
        auth.credentials.encode()
    ).hexdigest()

    database = (
        request.app.state
        .database
    )

    with database.connect() as db:
        row = (
            find_active_endpoint_by_token_hash(
                db,
                token_hash,
            )
        )

    if row is None:
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid or revoked device token"
            ),
        )

    return row["id"]