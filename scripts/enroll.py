import argparse
import json
import os
import socket
from pathlib import Path
from agent.client import Client

def main():
    parser = argparse.ArgumentParser(description='Analyst-side device enrollment. Transfer only the generated agent configuration to the endpoint.')
    parser.add_argument('--server', default='http://127.0.0.1:8000')
    parser.add_argument('--hostname', default=socket.gethostname())
    parser.add_argument('--out', default='runtime/agent.json')
    args = parser.parse_args()
    target = Path(args.out)
    if target.exists():
        parser.error('Output exists; choose another filename rather than replacing device identity')
    config = json.loads(Path('runtime/server.json').read_text())
    result = Client(args.server, config['admin_token']).request('/api/v1/endpoints', {'hostname':args.hostname, 'platform':'windows'})
    result.update({'server_url':args.server, 'buffer_path':'runtime/buffer.db', 'max_events':100000, 'max_bytes':67108864})
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(result, f, indent=2)
    print(f'Enrollment complete. Device configuration saved to {target}; token omitted from output.')

if __name__ == '__main__':
    main()
