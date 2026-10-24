"""Detection-rule helpers."""

from ..core.config import (
    OFFICE_PARENT_IMAGES,
    POWERSHELL_IMAGES,
)


def executable_name(
    value: str | None,
) -> str:
    """Return a normalized executable basename."""

    if not value:
        return ""

    return (
        value.replace("\\", "/")
        .rsplit("/", 1)[-1]
        .lower()
    )


def matches_office_powershell_rule(
    event,
) -> bool:
    """
    Detect an Office application spawning PowerShell.

    This matches recorded executable names only.
    It does not verify executable file identity cryptographically.
    """

    return (
        event.category == "process"
        and bool(event.process_guid)
        and executable_name(
            event.image
        )
        in POWERSHELL_IMAGES
        and executable_name(
            event.parent_image
        )
        in OFFICE_PARENT_IMAGES
    )