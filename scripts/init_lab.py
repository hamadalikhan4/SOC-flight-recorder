"""Generate unique local credentials; never overwrite an existing setup."""
import json
import os
import secrets
from pathlib import Path

def main():
    directory = Path('runtime')
    directory.mkdir(mode=0o700, exist_ok=True)
    target = directory/'server.json'
    if target.exists():
        print('Existing runtime/server.json retained. No credentials changed.')
        return
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump({'admin_token': secrets.token_urlsafe(48), 'db_path':'runtime/server.db',
                   'host':'127.0.0.1', 'port':8000, 'pre_seconds':600, 'post_seconds':300}, f, indent=2)
    print('Created runtime/server.json. Keep this file private. Start: python -m scripts.run_server')

if __name__ == '__main__':
    main()
