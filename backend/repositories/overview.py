"""Database queries used by the operations overview."""


def get_overview_totals(db) -> dict:
    event_totals = dict(
        db.execute(
            """
            SELECT
                COUNT(*) AS events,

                COALESCE(
                    SUM(
                        COALESCE(
                            json_extract(
                                payload,
                                '$.synthetic'
                            ),
                            0
                        ) = 1
                    ),
                    0
                ) AS replay_events

            FROM events
            """
        ).fetchone()
    )

    incident_totals = dict(
        db.execute(
            """
            SELECT
                COUNT(*) AS incidents,

                COALESCE(
                    SUM(status='open'),
                    0
                ) AS open_incidents,

                COALESCE(
                    SUM(
                        status='open'
                        AND severity IN (
                            'high',
                            'critical'
                        )
                    ),
                    0
                ) AS high_priority

            FROM incidents
            """
        ).fetchone()
    )

    event_totals.update(
        incident_totals
    )

    return event_totals


def list_event_categories(db):
    return db.execute(
        """
        SELECT
            category,
            COUNT(*) AS count

        FROM events

        GROUP BY category
        ORDER BY count DESC
        """
    ).fetchall()


def get_activity_counts(
    db,
    *,
    start: str,
    end: str,
) -> dict[str, int]:
    rows = db.execute(
        """
        SELECT
            substr(
                received_at,
                1,
                13
            ) AS hour,

            COUNT(*) AS count

        FROM events

        WHERE
            received_at>=?
            AND received_at<=?

        GROUP BY hour
        """,
        (
            start,
            end,
        ),
    ).fetchall()

    return {
        row["hour"]:
            row["count"]

        for row in rows
    }


def list_recent_open_incidents(
    db,
    limit: int = 5,
):
    return db.execute(
        """
        SELECT
            i.*,
            e.hostname,

            json_extract(
                t.payload,
                '$.synthetic'
            ) AS synthetic

        FROM incidents i

        JOIN endpoints e
            ON e.id=i.endpoint_id

        LEFT JOIN events t
            ON t.endpoint_id=i.endpoint_id
            AND t.event_id=i.trigger_event_id

        WHERE i.status='open'

        ORDER BY
            i.triggered_at DESC,
            i.id

        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def list_recent_audit_records(
    db,
    limit: int = 5,
):
    return db.execute(
        """
        SELECT *
        FROM audit
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()