param(
  [ValidateSet('List','Create','MailList','MailClaim','MailAck')][string]$Action = 'List',
  [string]$Cursor = '',
  [ValidateSet('pending','claimed','sent','unknown','cancelled')][string]$State = 'pending',
  [string]$DecisionFile = ''
)
$ErrorActionPreference = 'Stop'
$secretFile = Join-Path $env:USERPROFILE '.codex\private\kampira\beta-review-secret.dpapi'
if (-not (Test-Path -LiteralPath $secretFile)) { throw 'Kampira beta service credential is not configured on this Windows account.' }
$secure = ConvertTo-SecureString (Get-Content -LiteralPath $secretFile -Raw).Trim()
$credential = [System.Net.NetworkCredential]::new('', $secure)
$headers = @{ Authorization = 'Bearer ' + $credential.Password; Origin = 'https://kampira.net' }
$endpoint = 'https://kampira.net/api/admin/test-accounts'
try {
  if ($Action.StartsWith('Mail')) { $endpoint += '/mail' }
  if ($Action -in @('List','MailList')) {
    $query = '?state=' + $State
    if ($Cursor) { $query += '&cursor=' + [uri]::EscapeDataString($Cursor) }
    $response = Invoke-RestMethod -Uri ($endpoint + $query) -Method Get -Headers $headers -TimeoutSec 30
  } else {
    if (-not $DecisionFile) { throw 'A JSON decision file is required.' }
    $decision = Get-Content -LiteralPath $DecisionFile -Raw
    $payload = $decision | ConvertFrom-Json
    if ($Action -eq 'MailClaim' -and $payload.action -ne 'claim') { throw 'MailClaim requires action=claim.' }
    if ($Action -eq 'MailAck' -and $payload.outcome -notin @('sent','unknown')) { throw 'MailAck requires an observed delivery outcome.' }
    if ($Action -eq 'Create' -and $payload.action -ne 'create') { throw 'Automation can only create test accounts; it cannot reset credentials.' }
    $method = if ($Action -eq 'MailAck') { 'Patch' } else { 'Post' }
    $response = Invoke-RestMethod -Uri $endpoint -Method $method -Headers $headers -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($decision)) -TimeoutSec 30
  }
  # Creation and mail claims contain one-time delivery material. Do not redirect
  # them into shared logs, commit them, or copy them to public operation records.
  $response | ConvertTo-Json -Depth 12
} catch {
  # A failed/uncertain request is never retried here: the caller must inspect
  # the existing operation or Sent folder before producing another delivery.
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  throw ('Test account operation failed; HTTP ' + $code + '. Inspect the existing operation before retrying.')
} finally {
  $headers.Clear(); $credential = $null; $secure.Dispose()
}
