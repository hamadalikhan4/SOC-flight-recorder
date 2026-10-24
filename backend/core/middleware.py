"""HTTP middleware used by the Flight Recorder API."""

from fastapi import FastAPI, Request
from fastapi.responses import Response


def install_http_middleware(
    app: FastAPI,
) -> None:
    """Install request-size and security-header middleware."""

    @app.middleware("http")
    async def security_middleware(
        request: Request,
        call_next,
    ):
        settings = request.app.state.settings

        if request.method in {
            "POST",
            "PATCH",
            "PUT",
        }:
            parts = []
            size = 0

            async for chunk in request.stream():
                size += len(chunk)

                if (
                    size >
                    settings.max_request_bytes
                ):
                    return Response(
                        "Request too large",
                        status_code=413,
                    )

                parts.append(chunk)

            request._body = b"".join(parts)

        response = await call_next(
            request
        )

        response.headers[
            "X-Content-Type-Options"
        ] = "nosniff"

        response.headers[
            "Cache-Control"
        ] = "no-store"

        return response