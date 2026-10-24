"""Endpoint persistence operations."""


def find_active_endpoint_by_token_hash(
    db,
    token_hash: str,
):
    return db.execute(
        """
        SELECT id
        FROM endpoints
        WHERE token_hash=?
          AND revoked=0
        """,
        (token_hash,),
    ).fetchone()


def create_endpoint(
    db,
    *,
    endpoint_id: str,
    hostname: str,
    platform: str,
    token_hash: str,
    created_at: str,
) -> None:
    db.execute(
        """
        INSERT INTO endpoints(
            id,
            hostname,
            platform,
            token_hash,
            created_at
        )
        VALUES(?,?,?,?,?)
        """,
        (
            endpoint_id,
            hostname,
            platform,
            token_hash,
            created_at,
        ),
    )


def list_endpoints(db):
    return db.execute(
        """
        SELECT
            id,
            hostname,
            platform,
            revoked,
            created_at,
            last_seen,
            heartbeat
        FROM endpoints
        ORDER BY created_at DESC
        """
    ).fetchall()


def revoke_endpoint(
    db,
    endpoint_id: str,
) -> int:
    return db.execute(
        """
        UPDATE endpoints
        SET revoked=1
        WHERE id=?
        """,
        (endpoint_id,),
    ).rowcount


def update_heartbeat(
    db,
    *,
    endpoint_id: str,
    last_seen: str,
    heartbeat: str,
) -> None:
    db.execute(
        """
        UPDATE endpoints
        SET
            last_seen=?,
            heartbeat=?
        WHERE id=?
        """,
        (
            last_seen,
            heartbeat,
            endpoint_id,
        ),
    )


def update_last_seen(
    db,
    *,
    endpoint_id: str,
    last_seen: str,
) -> None:
    db.execute(
        """
        UPDATE endpoints
        SET last_seen=?
        WHERE id=?
        """,
        (
            last_seen,
            endpoint_id,
        ),
    )