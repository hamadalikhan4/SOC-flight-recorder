"""Parse Sysmon XML by field names; never execute content from telemetry."""
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NS = {'e': 'http://schemas.microsoft.com/win/2004/08/events/event'}
CATEGORIES = {1: 'process', 3: 'network', 11: 'file', 22: 'dns'}

def normalize(xml, epoch):
    if len(xml.encode('utf-8')) > 100_000 or '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
        raise ValueError('Unsafe or oversized XML event')
    root = ET.fromstring(xml)
    system = root.find('e:System', NS)
    if system is None:
        raise ValueError('Missing System')
    kind = int(system.findtext('e:EventID', namespaces=NS))
    if kind not in CATEGORIES:
        return None
    provider = system.find('e:Provider', NS)
    if provider is None or provider.get('Name') != 'Microsoft-Windows-Sysmon':
        raise ValueError('Unexpected event provider')
    record = int(system.findtext('e:EventRecordID', namespaces=NS))
    timestamp = system.find('e:TimeCreated', NS).get('SystemTime')
    parsed = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timestamp has no timezone')
    timestamp = parsed.astimezone(timezone.utc).isoformat(timespec='microseconds')
    fields = {n.get('Name'): n.text or '' for n in root.findall('e:EventData/e:Data', NS)}
    key = f'{epoch}:{record}:{timestamp}'
    target = (fields.get('DestinationIp', '') + ':' + fields.get('DestinationPort', '') if kind == 3
              else fields.get('TargetFilename', '') if kind == 11 else fields.get('QueryName', '') if kind == 22 else '')
    return {'event_id': hashlib.sha256(key.encode()).hexdigest(), 'timestamp': timestamp,
            'category': CATEGORIES[kind], 'process_guid': fields.get('ProcessGuid', '').lower() or None,
            'parent_guid': fields.get('ParentProcessGuid', '').lower() or None,
            'process_id': int(fields['ProcessId']) if fields.get('ProcessId') else None,
            'image': fields.get('Image', '')[:2048], 'parent_image': fields.get('ParentImage', '')[:2048],
            'command_line': fields.get('CommandLine', '')[:16384], 'user': fields.get('User', '')[:512],
            'target': target[:4096], 'source_record_id': record, 'source_epoch': epoch,
            'provider': 'Microsoft-Windows-Sysmon', 'synthetic': False}
