"""Harmless labeled telemetry; no shell, document, or network attack is executed."""
import hashlib
import io
import json
import os
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from agent.buffer import Buffer
from agent.client import Client
from agent.main import flush

def sample_events(base=None):
    base = base or datetime.now(timezone.utc)-timedelta(minutes=2)
    epoch = 'replay-'+base.isoformat(timespec='microseconds')
    rows = [
        ('process',0,'explorer','userinit',r'C:\Windows\explorer.exe',r'C:\Windows\System32\userinit.exe',''),
        ('process',10,'word','explorer',r'C:\Office\WINWORD.EXE',r'C:\Windows\explorer.exe','invoice.docm'),
        ('process',20,'powershell','word',r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe',r'C:\Office\WINWORD.EXE',''),
        ('dns',21,'powershell',None,r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe','','updates.spectra-lab.test'),
        ('network',22,'powershell',None,r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe','','203.0.113.42:443'),
        ('file',23,'powershell',None,r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe','',r'C:\Lab\Temp\inventory.ps1'),
        ('process',24,'conhost','powershell',r'C:\Windows\System32\conhost.exe',r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe',''),
    ]
    guid = lambda s: '{'+str(uuid.uuid5(uuid.NAMESPACE_URL,epoch+s))+'}' if s else None
    return [{'event_id':hashlib.sha256((epoch+str(i)).encode()).hexdigest(),
             'timestamp':(base+timedelta(seconds=offset)).isoformat(timespec='microseconds'),
             'category':category, 'process_guid':guid(proc), 'parent_guid':guid(parent),
             'process_id':{'explorer':1840,'word':4280,'powershell':6132,'conhost':6296}[proc],
             'image':image,'parent_image':parent_image,
             'command_line':r'powershell.exe -NoProfile -File C:\Lab\Temp\inventory.ps1' if proc=='powershell' and category=='process' else image,
             'user':r'lab\demo-user','target':target,'source_record_id':i+1,
             'source_epoch':epoch,'synthetic':True,'provider':'FlightRecorderReplay'}
            for i,(category,offset,proc,parent,image,parent_image,target) in enumerate(rows)]

def main():
    config = json.loads(Path('runtime/server.json').read_text())
    server = 'http://127.0.0.1:'+str(config.get('port',8000))
    analyst = Client(server, config['admin_token'])
    path = Path('runtime/replay-agent.json')
    if path.exists():
        device = json.loads(path.read_text())
    else:
        device = analyst.request('/api/v1/endpoints', {'hostname':'REPLAY-WIN-001','platform':'replay'})
        with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:
            json.dump(device,f)
    event_path = Path('runtime/replay-events.json')
    if not event_path.exists():
        event_path.write_text(json.dumps(sample_events(),indent=2))
    events = json.loads(event_path.read_text())
    client = Client(server,device['agent_token'])
    buffer = Buffer('runtime/replay-buffer.db',device['pre_seconds'],device['post_seconds'])
    try:
        buffer.append(events)
        sent = flush(buffer,client)
        client.request('/api/v1/agent/heartbeat',{**buffer.counts(),'last_record_id':len(events),'collector_status':'replay','message':'Synthetic replay; no attack executed'})
    finally:
        buffer.close()
    incidents = analyst.request('/api/v1/incidents')
    incident = next(x for x in incidents if x['endpoint_id']==device['endpoint_id'])
    tree = analyst.request(f"/api/v1/incidents/{incident['id']}/process-tree")
    exported = analyst.request(f"/api/v1/incidents/{incident['id']}/evidence")
    output = Path('runtime/replay-evidence.zip')
    output.write_bytes(exported)
    with zipfile.ZipFile(io.BytesIO(exported)) as archive:
        manifest=json.loads(archive.read('manifest.json'))
        for item in manifest['files']:
            if hashlib.sha256(archive.read(item['name'])).hexdigest()!=item['sha256']:
                raise RuntimeError('Evidence hash mismatch')
    print(f"Replay complete: {sent} newly delivered events; {len(tree['nodes'])} process nodes; {len(tree['edges'])} edges.")
    print(f"Incident: {incident['id']}\nVerified evidence: {output}\nOpen http://127.0.0.1:8000/docs to investigate.")
    print('Re-running is idempotent. No real endpoint activity or attack was generated.')

if __name__ == '__main__':
    main()
