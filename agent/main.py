"""Run with python -m agent.main --config runtime/agent.json."""

import argparse
import hashlib
import json
import logging
import os
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .buffer import Buffer
from .client import Client
from .normalize import normalize


LOG = logging.getLogger("flight-recorder")


def utc_now():
    return datetime.now(timezone.utc).isoformat(
        timespec="microseconds"
    )


def health_event(epoch, message):
    timestamp = utc_now()

    return {
        "event_id": hashlib.sha256(
            (
                epoch +
                timestamp +
                message
            ).encode()
        ).hexdigest(),
        "timestamp": timestamp,
        "category": "health",
        "source_record_id": 0,
        "source_epoch": epoch,
        "target": message[:4096],
        "provider": "FlightRecorder",
        "synthetic": False,
    }


def flush(buffer, client):
    count = 0

    # Bound each cycle so a backlog does not permanently
    # starve collection.
    for _ in range(20):
        batch = buffer.pending()

        if not batch:
            break

        result = client.request(
            "/api/v1/agent/events",
            {
                "schema_version": 1,
                "events": batch,
            },
        )

        expected = {
            event["event_id"]
            for event in batch
        }

        acknowledged = result.get(
            "accepted_ids",
            [],
        )

        if set(acknowledged) != expected:
            raise RuntimeError(
                "Backend did not acknowledge the exact "
                "batch; retained for retry"
            )

        buffer.acknowledge(
            acknowledged
        )

        count += len(
            acknowledged
        )

    return count


def telemetry_state(
    last_record_id,
    latest_record_id,
):
    """
    Describe how close the Spectra collector is to the
    newest Sysmon record.

    This is record-position lag, not a guarantee that every
    Sysmon record represents a Spectra telemetry event.
    """

    if latest_record_id is None:
        return "unknown"

    lag = max(
        0,
        latest_record_id -
        last_record_id,
    )

    if lag == 0:
        return "caught_up"

    if lag <= 100:
        return "near_realtime"

    return "catching_up"


def collector_metrics(buffer):
    last_record_id = int(
        buffer.get(
            "record_id",
            "0",
        )
    )

    latest_raw = buffer.get(
        "latest_record_id"
    )

    oldest_raw = buffer.get(
        "oldest_record_id"
    )

    latest_record_id = (
        int(latest_raw)
        if latest_raw
        else None
    )

    oldest_record_id = (
        int(oldest_raw)
        if oldest_raw
        else None
    )

    if latest_record_id is None:
        record_lag = None
    else:
        record_lag = max(
            0,
            latest_record_id -
            last_record_id,
        )

    return {
        "last_record_id": last_record_id,
        "latest_record_id": latest_record_id,
        "oldest_record_id": oldest_record_id,
        "record_lag": record_lag,
        "telemetry_state": telemetry_state(
            last_record_id,
            latest_record_id,
        ),
        "last_collection_at": buffer.get(
            "last_collection_at"
        ),
        "last_collection_count": int(
            buffer.get(
                "last_collection_count",
                "0",
            )
        ),
    }


def store_collection_metrics(
    buffer,
    latest,
    oldest,
    event_count,
):
    with buffer.db:
        buffer.put(
            "latest_record_id",
            str(latest),
        )

        buffer.put(
            "oldest_record_id",
            str(oldest),
        )

        buffer.put(
            "last_collection_at",
            utc_now(),
        )

        buffer.put(
            "last_collection_count",
            str(event_count),
        )


def collect(buffer):
    after = int(
        buffer.get(
            "record_id",
            "0",
        )
    )

    epoch = buffer.get(
        "epoch"
    )

    if not epoch:
        epoch = str(
            uuid.uuid4()
        )

        with buffer.db:
            buffer.put(
                "epoch",
                epoch,
            )

    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-File",
            str(
                Path(__file__).with_name(
                    "read_sysmon.ps1"
                )
            ),
            "-After",
            str(after),
            "-Limit",
            "100",
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8-sig",
        timeout=30,
    )

    payload = json.loads(
        result.stdout
    )

    latest = int(
        payload["Latest"]
    )

    oldest = int(
        payload["Oldest"]
    )

    raw_events = payload.get(
        "Events",
        [],
    )

    # Save the current Sysmon boundaries immediately.
    # This allows heartbeat reporting even when no selected
    # telemetry event is returned in this cycle.
    store_collection_metrics(
        buffer,
        latest,
        oldest,
        len(raw_events),
    )

    # A lower latest record ID or changed anchor time
    # indicates a new log generation.
    anchor = buffer.get(
        "anchor"
    )

    returned_anchor = payload.get(
        "Anchor"
    )

    changed = (
        after
        and (
            latest < after
            or (
                anchor
                and returned_anchor
                and datetime.fromisoformat(
                    anchor
                )
                != datetime.fromisoformat(
                    returned_anchor
                )
            )
        )
    )

    if changed:
        epoch = str(
            uuid.uuid4()
        )

        buffer.append(
            [
                health_event(
                    epoch,
                    (
                        "Sysmon log reset detected; "
                        "continuity cannot be guaranteed"
                    ),
                )
            ],
            0,
            {
                "epoch": epoch,
                "anchor": "",
            },
        )

        return

    if (
        after
        and oldest > after + 1
    ):
        # Retain a gap report and move just before the
        # oldest available record.
        buffer.append(
            [
                health_event(
                    epoch,
                    (
                        "Sysmon rollover: "
                        f"checkpoint {after}, "
                        f"oldest available {oldest}"
                    ),
                )
            ],
            oldest - 1,
            {
                "anchor": "",
            },
        )

        return

    events = []

    for xml in raw_events:
        event = normalize(
            xml,
            epoch,
        )

        if event is not None:
            events.append(
                event
            )

    if events:
        checkpoint = events[-1][
            "source_record_id"
        ]

        # The raw System timestamp identifies a checkpoint
        # even after a log clear.
        import xml.etree.ElementTree as ET
        from .normalize import NS

        raw_time = (
            ET.fromstring(
                raw_events[-1]
            )
            .find(
                "e:System/e:TimeCreated",
                NS,
            )
            .get(
                "SystemTime"
            )
        )

        buffer.append(
            events,
            checkpoint,
            {
                "anchor": raw_time,
            },
        )

    # No selected events:
    # do not move beyond an unverified checkpoint.


def build_heartbeat(
    buffer,
    status,
    message,
):
    heartbeat = {
        **buffer.counts(),
        **collector_metrics(buffer),
        "collector_status": status,
        "message": message,
    }

    return heartbeat


def run():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--config",
        default="runtime/agent.json",
    )

    parser.add_argument(
        "--once",
        action="store_true",
    )

    args = parser.parse_args()

    if os.name != "nt":
        parser.error(
            "Live collection requires Windows; "
            "use python -m scripts.replay "
            "for cross-platform testing"
        )

    config = json.loads(
        Path(
            args.config
        ).read_text()
    )

    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s "
            "%(levelname)s "
            "%(message)s"
        ),
    )

    client = Client(
        config["server_url"],
        config["agent_token"],
    )

    buffer = Buffer(
        config.get(
            "buffer_path",
            "runtime/buffer.db",
        ),
        config.get(
            "pre_seconds",
            600,
        ),
        config.get(
            "post_seconds",
            300,
        ),
        config.get(
            "max_events",
            100000,
        ),
        config.get(
            "max_bytes",
            67108864,
        ),
    )

    bound = buffer.get(
        "endpoint_id"
    )

    if (
        bound
        and bound != config["endpoint_id"]
    ):
        buffer.close()

        raise SystemExit(
            "Buffer belongs to another endpoint; "
            "choose a fresh buffer_path"
        )

    with buffer.db:
        buffer.put(
            "endpoint_id",
            config["endpoint_id"],
        )

    delay = 2

    try:
        while True:
            status = "running"
            message = ""

            try:
                # Drain already-persisted data first;
                # collect even when transport fails.
                try:
                    flush(
                        buffer,
                        client,
                    )

                except Exception as exc:
                    LOG.warning(
                        (
                            "Upload unavailable (%s); "
                            "records remain queued"
                        ),
                        type(exc).__name__,
                    )

                buffer.prune()

                collect(
                    buffer
                )

                flush(
                    buffer,
                    client,
                )

                delay = 2

            except Exception as exc:
                status = "error"

                message = (
                    f"{type(exc).__name__}: "
                    "collection or delivery "
                    "needs review"
                )

                LOG.error(
                    (
                        "%s. Check Sysmon access, "
                        "buffer capacity and "
                        "server connectivity."
                    ),
                    message,
                )

                delay = min(
                    delay * 2,
                    30,
                )

            try:
                heartbeat = build_heartbeat(
                    buffer,
                    status,
                    message,
                )

                client.request(
                    "/api/v1/agent/heartbeat",
                    heartbeat,
                )

            except Exception:
                LOG.warning(
                    "Heartbeat not delivered"
                )

            if args.once:
                if status == "error":
                    raise SystemExit(
                        1
                    )

                break

            time.sleep(
                delay
            )

    except KeyboardInterrupt:
        LOG.info(
            "Recorder stopped; "
            "queued records retained"
        )

    finally:
        buffer.close()


if __name__ == "__main__":
    run()