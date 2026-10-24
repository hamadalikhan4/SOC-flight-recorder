import json
import ipaddress
from pathlib import Path

import uvicorn

from backend.app import create_app


CONFIG_PATH = Path("runtime/server.json")


def validate_host(host: str, allow_lan: bool) -> None:
    """
    Keep loopback safe by default.

    LAN exposure must be explicitly enabled with:
        "allow_lan": true

    Public IP bindings are rejected by this home-lab runner.
    """

    if host in {
        "127.0.0.1",
        "::1",
        "localhost"
    }:
        return

    if not allow_lan:
        raise SystemExit(
            "Remote/LAN binding is disabled. "
            'Set "allow_lan": true in runtime/server.json '
            "only for a trusted private LAN."
        )

    # 0.0.0.0 is allowed only after explicit LAN opt-in.
    # Windows Firewall should restrict inbound access
    # to the Private profile / LocalSubnet.
    if host == "0.0.0.0":
        return

    try:
        address = ipaddress.ip_address(host)
    except ValueError as exc:
        raise SystemExit(
            "For LAN mode, use a private IP address "
            "or 0.0.0.0 instead of a hostname."
        ) from exc

    if address.is_loopback:
        return

    if not address.is_private:
        raise SystemExit(
            "Refusing to bind Spectra to a public IP address. "
            "Use a private home/LAN address."
        )


def main():
    if not CONFIG_PATH.exists():
        raise SystemExit(
            f"Server configuration not found: {CONFIG_PATH}"
        )

    config = json.loads(
        CONFIG_PATH.read_text(
            encoding="utf-8"
        )
    )

    host = str(
        config.get(
            "host",
            "127.0.0.1"
        )
    ).strip()

    port = int(
        config.get(
            "port",
            8000
        )
    )

    allow_lan = bool(
        config.get(
            "allow_lan",
            False
        )
    )

    validate_host(
        host,
        allow_lan
    )

    app = create_app(
        config["db_path"],
        config["admin_token"],
        config.get(
            "pre_seconds",
            600
        ),
        config.get(
            "post_seconds",
            300
        )
    )

    mode = (
        "LAN DEMO"
        if host not in {
            "127.0.0.1",
            "::1",
            "localhost"
        }
        else "LOCAL"
    )

    print()
    print("=" * 62)
    print("Spectra Flight Recorder")
    print(f"Mode : {mode}")
    print(f"Host : {host}")
    print(f"Port : {port}")

    if mode == "LAN DEMO":
        print()
        print(
            "WARNING: LAN mode uses plain HTTP. "
            "Use only on a trusted private home network."
        )
        print(
            "Do not configure router port forwarding "
            "or expose this service to the Internet."
        )

    print("=" * 62)
    print()

    uvicorn.run(
        app,
        host=host,
        port=port,
        access_log=False
    )


if __name__ == "__main__":
    main()