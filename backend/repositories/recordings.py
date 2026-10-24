"""Recording inventory database operations."""


def _recording_filter(
    *,
    query: str,
    endpoint_id: str | None,
    window_state: str,
    captured_at: str,
):
    clauses = [
        "1=1"
    ]

    params = []

    if query.strip():
        clauses.append(
            (
                "instr("
                "lower("
                "i.title || ' ' || "
                "i.id || ' ' || "
                "e.hostname || ' ' || "
                "i.rule_id"
                "),"
                "lower(?)"
                ")>0"
            )
        )

        params.append(
            query.strip()
        )

    if endpoint_id:
        clauses.append(
            "i.endpoint_id=?"
        )

        params.append(
            endpoint_id
        )

    if window_state:
        if (
            window_state ==
            "collecting"
        ):
            clauses.append(
                "i.window_end>?"
            )

        else:
            clauses.append(
                "i.window_end<=?"
            )

        params.append(
            captured_at
        )

    return (
        " AND ".join(
            clauses
        ),
        params,
    )


def count_recordings(
    db,
    *,
    query: str,
    endpoint_id: str | None,
    window_state: str,
    captured_at: str,
) -> int:
    where, params = (
        _recording_filter(
            query=query,
            endpoint_id=endpoint_id,
            window_state=window_state,
            captured_at=captured_at,
        )
    )

    return db.execute(
        (
            "SELECT COUNT(*) "
            "FROM incidents i "
            "JOIN endpoints e "
            "ON e.id=i.endpoint_id "
            "WHERE "
            + where
        ),
        params,
    ).fetchone()[0]


def list_recordings(
    db,
    *,
    query: str,
    endpoint_id: str | None,
    window_state: str,
    captured_at: str,
    limit: int,
    offset: int,
):
    where, params = (
        _recording_filter(
            query=query,
            endpoint_id=endpoint_id,
            window_state=window_state,
            captured_at=captured_at,
        )
    )

    return db.execute(
        """
        SELECT
            i.*,
            e.hostname,

            (
                SELECT COUNT(*)

                FROM events v

                WHERE
                    v.endpoint_id=i.endpoint_id
                    AND v.timestamp>=i.window_start
                    AND v.timestamp<=i.window_end
            ) AS event_count,

            (
                SELECT COUNT(*)

                FROM events v

                WHERE
                    v.endpoint_id=i.endpoint_id
                    AND v.timestamp>=i.window_start
                    AND v.timestamp<=i.window_end
                    AND v.category='health'
            ) AS health_count,

            (
                SELECT
                    json_extract(
                        v.payload,
                        '$.synthetic'
                    )

                FROM events v

                WHERE
                    v.endpoint_id=i.endpoint_id
                    AND v.event_id=i.trigger_event_id
            ) AS synthetic,

            (
                SELECT MAX(timestamp)

                FROM audit

                WHERE
                    action='evidence.export'
                    AND resource=i.id
            ) AS last_export_at

        FROM incidents i

        JOIN endpoints e
            ON e.id=i.endpoint_id

        WHERE
        """
        + where
        + (
            " ORDER BY "
            "i.triggered_at DESC,"
            "i.id "
            "LIMIT ? OFFSET ?"
        ),
        [
            *params,
            limit,
            offset,
        ],
    ).fetchall()


def list_recent_evidence_exports(
    db,
    limit: int = 10,
):
    return db.execute(
        """
        SELECT
            a.id,
            a.timestamp,
            a.resource,
            a.detail,
            i.title,
            e.hostname

        FROM audit a

        LEFT JOIN incidents i
            ON i.id=a.resource

        LEFT JOIN endpoints e
            ON e.id=i.endpoint_id

        WHERE
            a.action='evidence.export'

        ORDER BY
            a.id DESC

        LIMIT ?
        """,
        (limit,),
    ).fetchall()