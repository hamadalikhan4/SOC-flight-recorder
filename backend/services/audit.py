"""Audit logging service."""

from ..repositories.audit import (
    insert_audit,
)


def write_audit(
    db,
    timestamp: str,
    actor: str,
    action: str,
    resource: str,
    detail: str = "",
) -> None:
    insert_audit(
        db,
        timestamp=timestamp,
        actor=actor,
        action=action,
        resource=resource,
        detail=detail,
    )