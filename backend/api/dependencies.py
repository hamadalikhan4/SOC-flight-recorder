"""Shared FastAPI dependencies."""

from fastapi import Request

from ..db import Database
from ..core.config import RecorderSettings


def get_database(
    request: Request,
) -> Database:
    """Return the application database instance."""

    return request.app.state.database


def get_settings(
    request: Request,
) -> RecorderSettings:
    """Return runtime recorder settings."""

    return request.app.state.settings