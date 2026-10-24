"""Audit-trail persistence operations."""


def insert_audit(
    db,
    *,
    timestamp: str,
    actor: str,
    action: str,
    resource: str,
    detail: str = "",
) -> None:
    db.execute(
        """
        INSERT INTO audit(
            timestamp,
            actor,
            action,
            resource,
            detail
        )
        VALUES(?,?,?,?,?)
        """,
        (
            timestamp,
            actor,
            action,
            resource,
            detail,
        ),
    )


def list_audit(
    db,
    *,
    limit: int,
    offset: int,
    query: str = "",
    action: str = "",
):
    clauses = []
    params = []

    if query.strip():
        clauses.append(
            """
            instr(
                lower(
                    actor || ' ' ||
                    action || ' ' ||
                    resource || ' ' ||
                    detail
                ),
                lower(?)
            ) > 0
            """
        )

        params.append(
            query.strip()
        )

    if action.strip():
        clauses.append(
            "action=?"
        )

        params.append(
            action.strip()
        )

    where = (
        " WHERE "
        + " AND ".join(
            clauses
        )
        if clauses
        else ""
    )

    return db.execute(
        (
            "SELECT * "
            "FROM audit"
            + where
            + " ORDER BY id DESC "
              "LIMIT ? OFFSET ?"
        ),
        [
            *params,
            limit,
            offset,
        ],
    ).fetchall()