"""Event persistence and threat-hunting query operations."""

import json

from ..services.self_noise import (
    classify_collector_activity,
)


# =========================================================
# Event persistence
# =========================================================

def find_event_payload(
    db,
    *,
    endpoint_id: str,
    event_id: str,
):
    return db.execute(
        """
        SELECT payload
        FROM events
        WHERE endpoint_id=?
          AND event_id=?
        """,
        (
            endpoint_id,
            event_id,
        ),
    ).fetchone()


def insert_event(
    db,
    *,
    endpoint_id: str,
    event_id: str,
    timestamp: str,
    category: str,
    process_guid: str | None,
    parent_guid: str | None,
    payload: str,
    received_at: str,
) -> None:

    db.execute(
        """
        INSERT INTO events(
            endpoint_id,
            event_id,
            timestamp,
            category,
            process_guid,
            parent_guid,
            payload,
            received_at
        )
        VALUES(?,?,?,?,?,?,?,?)
        """,
        (
            endpoint_id,
            event_id,
            timestamp,
            category,
            process_guid,
            parent_guid,
            payload,
            received_at,
        ),
    )


# =========================================================
# Milestone 7B — Collector activity filtering
# =========================================================

def _collector_tagged(
    payload: str,
) -> int:
    """
    SQLite-compatible classifier.

    Returns:
        1: recognized collector activity
        0: not recognized

    This uses exactly the same classifier as the hunting
    assessment so the result count and returned items
    cannot disagree because of separate classification
    implementations.

    Stored event payloads are never modified.
    """

    event = json.loads(
        payload
    )

    assessment = classify_collector_activity(
        event
    )

    return int(
        assessment["tagged"] is True
    )


def _register_collector_classifier(
    db,
) -> None:
    """
    Register a deterministic SQLite function on this
    database connection.

    No schema migration, new table or event rewrite
    is required.
    """

    db.create_function(
        "spectra_collector_tagged",
        1,
        _collector_tagged,
        deterministic=True,
    )


# =========================================================
# Hunting filter builder
# =========================================================

def _build_event_filters(
    *,
    endpoint_id: str | None,
    category: str | None,
    process_guid: str | None,
    event_id: str | None,
    query: str,
    start_time: str | None,
    end_time: str | None,
    source: str | None,
    collector_activity: str = "all",
):
    """
    Build parameterized WHERE conditions for telemetry
    hunting.

    No user-supplied value is interpolated directly
    into SQL.

    Collector filtering is applied inside SQLite,
    before pagination.
    """

    clauses = []
    params = []

    # -----------------------------------------------------
    # Endpoint
    # -----------------------------------------------------

    if endpoint_id:
        clauses.append(
            "endpoint_id=?"
        )

        params.append(
            endpoint_id
        )

    # -----------------------------------------------------
    # Category
    # -----------------------------------------------------

    if category:
        clauses.append(
            "category=?"
        )

        params.append(
            category
        )

    # -----------------------------------------------------
    # Process GUID
    # -----------------------------------------------------

    if process_guid:
        clauses.append(
            "process_guid=?"
        )

        params.append(
            process_guid.lower()
        )

    # -----------------------------------------------------
    # Exact event ID
    # -----------------------------------------------------

    if event_id:
        clauses.append(
            "event_id=?"
        )

        params.append(
            event_id
        )

    # -----------------------------------------------------
    # Free-text telemetry search
    # -----------------------------------------------------

    if query.strip():
        clauses.append(
            """
            instr(
                lower(payload),
                lower(?)
            ) > 0
            """
        )

        params.append(
            query.strip()
        )

    # -----------------------------------------------------
    # Time range
    # -----------------------------------------------------

    if start_time:
        clauses.append(
            "timestamp>=?"
        )

        params.append(
            start_time
        )

    if end_time:
        clauses.append(
            "timestamp<=?"
        )

        params.append(
            end_time
        )

    # -----------------------------------------------------
    # Real endpoint versus replay telemetry
    # -----------------------------------------------------

    if source == "replay":
        clauses.append(
            """
            COALESCE(
                json_extract(
                    payload,
                    '$.synthetic'
                ),
                0
            ) = 1
            """
        )

    elif source == "endpoint":
        clauses.append(
            """
            COALESCE(
                json_extract(
                    payload,
                    '$.synthetic'
                ),
                0
            ) = 0
            """
        )

    # -----------------------------------------------------
    # Milestone 7B — Collector self-noise
    # -----------------------------------------------------

    if collector_activity == "hide":

        clauses.append(
            """
            spectra_collector_tagged(
                payload
            ) = ?
            """
        )

        params.append(
            0
        )

    elif collector_activity == "only":

        clauses.append(
            """
            spectra_collector_tagged(
                payload
            ) = ?
            """
        )

        params.append(
            1
        )

    elif collector_activity != "all":

        raise ValueError(
            "collector_activity must be "
            "'all', 'hide', or 'only'"
        )

    # -----------------------------------------------------
    # Build WHERE
    # -----------------------------------------------------

    where = (
        " WHERE "
        + " AND ".join(
            clauses
        )
        if clauses
        else ""
    )

    return where, params


# =========================================================
# Count matching events
# =========================================================

def count_events(
    db,
    *,
    endpoint_id: str | None = None,
    category: str | None = None,
    process_guid: str | None = None,
    event_id: str | None = None,
    query: str = "",
    start_time: str | None = None,
    end_time: str | None = None,
    source: str | None = None,
    collector_activity: str = "all",
) -> int:
    """
    Count events matching the current hunting filters.

    The collector filter is applied before COUNT(*),
    ensuring the total matches the selected visibility
    mode.
    """

    if collector_activity != "all":

        _register_collector_classifier(
            db
        )

    where, params = _build_event_filters(
        endpoint_id=endpoint_id,
        category=category,
        process_guid=process_guid,
        event_id=event_id,
        query=query,
        start_time=start_time,
        end_time=end_time,
        source=source,
        collector_activity=collector_activity,
    )

    row = db.execute(
        (
            "SELECT COUNT(*) "
            "FROM events"
            + where
        ),
        params,
    ).fetchone()

    return int(
        row[0]
    )


# =========================================================
# Retrieve matching events
# =========================================================

def query_events(
    db,
    *,
    endpoint_id: str | None = None,
    category: str | None = None,
    process_guid: str | None = None,
    event_id: str | None = None,
    query: str = "",
    start_time: str | None = None,
    end_time: str | None = None,
    source: str | None = None,
    collector_activity: str = "all",
    offset: int = 0,
    limit: int = 100,
    order: str = "asc",
) -> list[dict]:
    """
    Search retained telemetry using analyst hunting
    filters.

    Collector filtering happens in SQLite before LIMIT
    and OFFSET, preserving accurate pagination.

    Results contain normalized event payloads plus
    server-side endpoint and receipt metadata.
    """

    if collector_activity != "all":

        _register_collector_classifier(
            db
        )

    where, params = _build_event_filters(
        endpoint_id=endpoint_id,
        category=category,
        process_guid=process_guid,
        event_id=event_id,
        query=query,
        start_time=start_time,
        end_time=end_time,
        source=source,
        collector_activity=collector_activity,
    )

    direction = (
        "DESC"
        if order == "desc"
        else "ASC"
    )

    sql = (
        """
        SELECT
            endpoint_id,
            event_id,
            timestamp,
            category,
            process_guid,
            parent_guid,
            payload,
            received_at

        FROM events
        """
        + where
        + f"""
        ORDER BY
            timestamp {direction},
            event_id {direction}

        LIMIT ? OFFSET ?
        """
    )

    rows = db.execute(
        sql,
        [
            *params,
            limit,
            offset,
        ],
    ).fetchall()

    results = []

    for row in rows:

        payload = json.loads(
            row["payload"]
        )

        # Add server-side metadata without modifying
        # the original event stored in SQLite.

        payload["endpoint_id"] = (
            row["endpoint_id"]
        )

        payload["received_at"] = (
            row["received_at"]
        )

        results.append(
            payload
        )

    return results