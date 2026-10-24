param([long]$After=0,[int]$Limit=100)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$log = 'Microsoft-Windows-Sysmon/Operational'
# Use positional channel metadata, not human-language message parsing.
$info = Get-WinEvent -ListLog $log
if ($info.RecordCount -eq 0) {
    @{Oldest=0;Latest=0;Anchor=$null;Events=@()} | ConvertTo-Json -Depth 4 -Compress
    exit 0
}
$latest = Get-WinEvent -LogName $log -MaxEvents 1
$oldest = Get-WinEvent -LogName $log -Oldest -MaxEvents 1
$anchor = $null
if ($After -gt 0) {
    $anchorRows = @(Get-WinEvent -LogName $log -FilterXPath "*[System[EventRecordID=$After]]" -ErrorAction SilentlyContinue -ErrorVariable anchorErrors)
    if ($anchorRows.Count -gt 0) { $anchor = $anchorRows[0].TimeCreated.ToUniversalTime().ToString('o') }
    foreach ($err in $anchorErrors) { if ($err.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*') { throw $err } }
}
$filter = "*[System[(EventID=1 or EventID=3 or EventID=11 or EventID=22) and EventRecordID > $After]]"
$rows = @(Get-WinEvent -LogName $log -FilterXPath $filter -Oldest -MaxEvents $Limit -ErrorAction SilentlyContinue -ErrorVariable readErrors)
foreach ($err in $readErrors) { if ($err.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*') { throw $err } }
@{Oldest=$oldest.RecordId;Latest=$latest.RecordId;Anchor=$anchor;Events=@($rows | ForEach-Object { $_.ToXml() })} | ConvertTo-Json -Depth 4 -Compress
