"""Read-only server policy and configuration routes."""

from fastapi import (
    APIRouter,
    Depends,
)

from ...core.config import (
    OFFICE_PARENT_IMAGES,
    POWERSHELL_IMAGES,
    RecorderSettings,
)

from ...core.security import (
    require_admin,
)

from ..dependencies import (
    get_settings,
)


router = APIRouter(
    prefix="/api/v1",
    tags=["Analyst"],
    dependencies=[
        Depends(require_admin)
    ],
)


@router.get("/policy")
def policy(
    settings: RecorderSettings = Depends(
        get_settings
    ),
):
    return {
        "mode":
            "Read-only server configuration",

        "pre_seconds":
            settings.pre_seconds,

        "post_seconds":
            settings.post_seconds,

        "export_event_limit":
            settings.export_event_limit,

        "max_request_bytes":
            settings.max_request_bytes,

        "rule": {
            "id":
                settings.rule_id,

            "name":
                settings.rule_name,

            "category":
                settings.rule_category,

            "parent_images":
                sorted(
                    OFFICE_PARENT_IMAGES
                ),

            "child_images":
                sorted(
                    POWERSHELL_IMAGES
                ),

            "requires_process_guid":
                True,
        },

        "limitations": [
            (
                "These settings describe this server, "
                "not the active Sysmon configuration."
            ),
            (
                "Endpoint policy distribution "
                "is not implemented."
            ),
            (
                "Recording coverage remains unknown "
                "even after the window ends."
            ),
        ],
    }