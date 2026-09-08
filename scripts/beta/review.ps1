param(
  [ValidateSet('List','Detail','Review')][string]$Action = 'List',
  [ValidateSet('application','feedback')][string]$Kind = 'application',
  [string]$Status = 'new',
  [string]$Cursor = '',
  [string]$Id = '',
  [string]$DecisionFile = ''
)
$ErrorActionPreference = 'Stop'
$secretFile = Join-Path $env:USERPROFILE '.codex\private\kampira\beta-review-secret.dpapi'
if (-not (Test-Path -LiteralPath $secretFile)) { throw 'Kampira beta review credential is not configured on this Windows account.' }
$secure = ConvertTo-SecureString (Get-Content -LiteralPath $secretFile -Raw).Trim()
$credential = [System.Net.NetworkCredential]::new('', $secure)
$headers = @{ Authorization = 'Bearer ' + $credential.Password; Origin = 'https://kampira.net' }
$base = 'https://kampira.net/api/admin/beta'
try {
  if ($Action -eq 'Review') {
    if (-not $DecisionFile) { throw 'A JSON decision file is required.' }
    $decision = Get-Content -LiteralPath $DecisionFile -Raw
    $null = $decision | ConvertFrom-Json
    $response = Invoke-RestMethod -Uri $base -Method Patch -Headers $headers -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($decision)) -TimeoutSec 30
  } else {
    $query = '?kind=' + $Kind + '&status=' + [uri]::EscapeDataString($Status)
    if ($Cursor) { $query += '&cursor=' + [uri]::EscapeDataString($Cursor) }
    if ($Action -eq 'Detail') { if (-not $Id) { throw 'A request id is required.' }; $query += '&id=' + [uri]::EscapeDataString($Id) }
    $response = Invoke-RestMethod -Uri ($base + $query) -Headers $headers -TimeoutSec 30
  }
  $response | ConvertTo-Json -Depth 12
} catch {
  # Never dump a web request object: it contains the authorization header.
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  throw ('Beta review request failed; HTTP ' + $code + '. Check the current credential/deployment before retrying.')
} finally {
  $headers.Clear(); $credential = $null; $secure.Dispose()
}
