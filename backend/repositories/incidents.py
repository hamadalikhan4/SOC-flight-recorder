"""Incident persistence operations."""


def find_incident(
    db,
    incident_id: str,
):
    return db.execute(
        """
        SELECT *
        FROM incidents
        WHERE id=?
        """,
        (incident_id,),
    ).fetchone()


def list_incidents(
    db,
    *,
    limit: int,
    offset: int,
):
    return db.execute(
        """
        SELECT *
        FROM incidents
        ORDER BY triggered_at DESC
        LIMIT ?
        OFFSET ?
        """,
        (
            limit,
            offset,
        ),
    ).fetchall()


def insert_incident(
    db,
    *,
    incident_id: str,
    endpoint_id: str,
    trigger_event_id: str,
    rule_id: str,
    process_guid: str,
    title: str,
    severity: str,
    technique: str,
    triggered_at: str,
    window_start: str,
    window_end: str,
    created_at: str,
) -> None:
    db.execute(
        """
        INSERT INTO incidents(
            id,
            endpoint_id,
            trigger_event_id,
            rule_id,
            process_guid,
            title,
            severity,
            technique,
            triggered_at,
            window_start,
            window_end,
            created_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            incident_id,
            endpoint_id,
            trigger_event_id,
            rule_id,
            process_guid,
            title,
            severity,
            technique,
            triggered_at,
            window_start,
            window_end,
            created_at,
        ),
    )


def update_incident_status(
    db,
    *,
    incident_id: str,
    status: str,
) -> None:
    db.execute(
        """
        UPDATE incidents
        SET status=?
        WHERE id=?
        """,
        (
            status,
            incident_id,
        ),
    )


def select_window_events(
    db,
    *,
    endpoint_id: str,
    window_start: str,
    window_end: str,
    limit: int,
):
    return db.execute(
        """
        SELECT *
        FROM events
        WHERE endpoint_id=?
          AND timestamp>=?
          AND timestamp<=?
        ORDER BY timestamp,event_id
        LIMIT ?
        """,
        (
            endpoint_id,
            window_start,
            window_end,
            limit,
        ),
    ).fetchall()