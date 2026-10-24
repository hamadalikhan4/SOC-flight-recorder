"""Inspect the running backend without Swagger or external web assets."""
import json
from pathlib import Path
from agent.client import Client

def main():
    config=json.loads(Path('runtime/server.json').read_text())
    client=Client('http://127.0.0.1:'+str(config.get('port',8000)),config['admin_token'])
    endpoints=client.request('/api/v1/endpoints')
    incidents=client.request('/api/v1/incidents')
    print(json.dumps({'endpoints':endpoints,'incidents':incidents},indent=2))

if __name__=='__main__':main()
