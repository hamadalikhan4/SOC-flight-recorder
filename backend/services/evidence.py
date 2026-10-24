"""Evidence package generation service."""

import hashlib
import io
import zipfile

from ..core.utils import canonical_json


EVIDENCE_LIMITATIONS = [
    "Hashes verify bytes, not source authenticity.",
    (
        "Window coverage is unknown; delayed events may "
        "appear in later exports."
    ),
    "No file content or memory images collected.",
]


def build_evidence_package(
    incident: dict,
    events: list[dict],
    exported_at: str,
) -> bytes:
    """
    Build an in-memory evidence ZIP.

    The archive contains:
    - incident.json
    - events.json
    - manifest.json

    SHA-256 hashes describe the packaged artifact bytes.
    """

    artifacts = {
        "incident.json": incident,
        "events.json": events,
    }

    manifest = {
        "algorithm": "SHA-256",
        "exported_at": exported_at,
        "limitations": list(
            EVIDENCE_LIMITATIONS
        ),
        "files": [],
    }

    stream = io.BytesIO()

    with zipfile.ZipFile(
        stream,
        "w",
        zipfile.ZIP_DEFLATED,
    ) as archive:

        for name, value in artifacts.items():
            data = canonical_json(
                value
            ).encode(
                "utf-8"
            )

            archive.writestr(
                name,
                data,
            )

            manifest["files"].append(
                {
                    "name": name,
                    "bytes": len(data),
                    "sha256": hashlib.sha256(
                        data
                    ).hexdigest(),
                }
            )

        archive.writestr(
            "manifest.json",
            canonical_json(
                manifest
            ),
        )

    return stream.getvalue()