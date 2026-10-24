"""SOC Flight Recorder application factory."""

from pathlib import Path

from fastapi import (
    FastAPI,
    HTTPException,
)

from fastapi.staticfiles import (
    StaticFiles,
)

from .db import Database

from .core.config import (
    RecorderSettings,
)

from .core.middleware import (
    install_http_middleware,
)


# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

from .api.routes.overview import (
    router as overview_router,
)

from .api.routes.endpoints import (
    router as endpoints_router,
)

from .api.routes.agent import (
    router as agent_router,
)

from .api.routes.events import (
    router as events_router,
)

from .api.routes.incidents import (
    router as incidents_router,
)

from .api.routes.recordings import (
    router as recordings_router,
)

from .api.routes.policy import (
    router as policy_router,
)

from .api.routes.audit import (
    router as audit_router,
)


def create_app(
    db_path,
    admin_token,
    pre_seconds=600,
    post_seconds=300,
):
    """
    Create and configure the SOC Flight Recorder application.

    Existing database contents are preserved.
    """

    if len(admin_token) < 32:
        raise ValueError(
            "Admin token must contain at least 32 characters"
        )

    settings = RecorderSettings(
        pre_seconds=pre_seconds,
        post_seconds=post_seconds,
    )

    settings.validate()

    database = Database(
        db_path
    )

    app = FastAPI(
        title="SOC Flight Recorder",
        version="0.1.0",
        description=(
            "Working lab release. "
            "Use the analyst token in Authorize. "
            "Agent routes require a device token."
        ),
    )

    # ------------------------------------------------------------------
    # Runtime state
    # ------------------------------------------------------------------

    app.state.database = database
    app.state.admin_token = admin_token
    app.state.settings = settings

    # ------------------------------------------------------------------
    # Middleware
    # ------------------------------------------------------------------

    install_http_middleware(
        app
    )

    # ------------------------------------------------------------------
    # API routes
    # ------------------------------------------------------------------

    app.include_router(
        overview_router
    )

    app.include_router(
        endpoints_router
    )

    app.include_router(
        agent_router
    )

    app.include_router(
        events_router
    )

    app.include_router(
        incidents_router
    )

    app.include_router(
        recordings_router
    )

    app.include_router(
        policy_router
    )

    app.include_router(
        audit_router
    )

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    @app.get(
        "/health",
        tags=["System"],
    )
    def health():
        return {
            "status": "ok",
            "version": "0.1.0",
        }

    # ------------------------------------------------------------------
    # Dashboard
    # ------------------------------------------------------------------

    frontend_directory = (
        Path(__file__)
        .resolve()
        .parents[1]
        / "frontend"
    )

    if frontend_directory.is_dir():
        app.mount(
            "/dashboard",

            StaticFiles(
                directory=str(
                    frontend_directory
                ),
                html=True,
            ),

            name="dashboard",
        )

    else:

        @app.get(
            "/dashboard/",
            include_in_schema=False,
        )
        def dashboard_not_installed():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Dashboard files are missing. "
                    "Create frontend/index.html "
                    "in the project root, then restart the backend."
                ),
            )

    return app