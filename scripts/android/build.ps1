param([ValidateSet('Prepare', 'Generate', 'BuildUnsigned')][string]$Action = 'Prepare')
$ErrorActionPreference = 'Stop'
$androidRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$androidExpectedOutput = [IO.Path]::GetFullPath((Join-Path $androidRepoRoot 'outputs/android/generated'))

if ($Action -eq 'Prepare') {
  & node (Join-Path $PSScriptRoot 'prepare.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Android configuration preparation failed.' }
  exit 0
}

# Bubblewrap replaces generated project files. Keep its scope inside this owned directory.
if (!(Test-Path -LiteralPath (Join-Path $androidExpectedOutput '.kampira-generated-project'))) {
  throw 'Run Prepare first. The generated-project ownership marker is missing.'
}
$androidResolvedOutput = (Resolve-Path -LiteralPath $androidExpectedOutput).Path
if (![string]::Equals($androidResolvedOutput.TrimEnd('\'), $androidExpectedOutput.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Generated Android directory does not resolve to the expected workspace path.'
}
if ((Get-Item -LiteralPath $androidResolvedOutput).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw 'Generated Android directory must not be a junction or symbolic link.'
}
& node (Join-Path $PSScriptRoot 'check.mjs') --remote
if ($LASTEXITCODE -ne 0) { throw 'The live origin is not ready. Publish the prepared PWA assets before generating Android files.' }
$androidConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'app-config.json') -Raw | ConvertFrom-Json
$androidCliPackage = '@bubblewrap/cli@' + $androidConfig.bubblewrapVersion
Push-Location -LiteralPath $androidResolvedOutput
try {
  if ($Action -eq 'Generate') {
    & npx --yes $androidCliPackage update --manifest=./twa-manifest.json --skipVersionUpgrade
    if ($LASTEXITCODE -ne 0) { throw 'Bubblewrap project generation failed.' }
    & node (Join-Path $PSScriptRoot 'set-target-sdk.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the generated target SDK.' }
  } else {
    & node (Join-Path $PSScriptRoot 'check.mjs') --generated
    if ($LASTEXITCODE -ne 0) { throw 'Generate and verify Android project files first.' }
    & npx --yes $androidCliPackage build --manifest=./twa-manifest.json --skipSigning
    if ($LASTEXITCODE -ne 0) { throw 'Unsigned Android build failed.' }
  }
} finally { Pop-Location }
