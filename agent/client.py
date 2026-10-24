import json
import urllib.request
from urllib.parse import urlparse

class Client:
    def __init__(self, server_url, token):
        parsed = urlparse(server_url)
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Server URL must not contain credentials, query or fragment')
        if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in {'127.0.0.1', 'localhost', '::1'}):
            raise ValueError('HTTPS is required except for explicit loopback lab URLs')
        self.base = server_url.rstrip('/')
        self.token = token
        # Do not forward credentials through HTTP redirects.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, path, payload=None, method=None):
        encoded = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.base+path, data=encoded, method=method,
                                     headers={'Authorization': 'Bearer '+self.token, 'Content-Type': 'application/json'})
        with self.opener.open(req, timeout=20) as response:
            data = response.read(20*1024*1024)
            return data if 'application/zip' in response.headers.get('Content-Type','') else json.loads(data)
