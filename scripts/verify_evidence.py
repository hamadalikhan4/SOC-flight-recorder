import argparse
import hashlib
import json
import zipfile

def verify(path):
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) != 3 or any(x.file_size>100*1024*1024 for x in archive.infolist()):
            raise ValueError('Unexpected package size or contents')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('algorithm')!='SHA-256':
            raise ValueError('Unsupported hash algorithm')
        entries = manifest['files']
        if len(entries)!=2 or {x['name'] for x in entries}!={'events.json','incident.json'}:
            raise ValueError('Unexpected manifest')
        for item in entries:
            data = archive.read(item['name'])
            if len(data)!=item['bytes'] or hashlib.sha256(data).hexdigest()!=item['sha256']:
                raise ValueError('Integrity failure: '+item['name'])
    return True

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('path');args=p.parse_args()
    verify(args.path)
    print('SHA-256 verification passed for every artifact. Source authenticity is not established by hashes.')
