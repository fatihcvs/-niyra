[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Origin,
    [string]$SdkRoot = '',
    [string]$JavaDirectory = '',
    [string]$ArtifactId = '',
    [string]$FirebaseConfig = '',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '../..'))
if (-not $SdkRoot) { $SdkRoot = Join-Path $repositoryRoot 'outputs/android/toolchain/sdk' }
if (-not $JavaDirectory) { $JavaDirectory = Join-Path $repositoryRoot 'outputs/android/toolchain/jdk/jdk-17.0.20.1+1' }
$SdkRoot = [IO.Path]::GetFullPath($SdkRoot)
$JavaDirectory = [IO.Path]::GetFullPath($JavaDirectory)
$originUri = $null
if (-not [Uri]::TryCreate($Origin, [UriKind]::Absolute, [ref]$originUri) -or $originUri.Scheme -notin @('http','https') -or $originUri.UserInfo -or $originUri.AbsolutePath -ne '/' -or $originUri.Query -or $originUri.Fragment) { throw 'Origin must be an exact HTTP(S) origin without credentials, path, query, or fragment.' }
$requirements = [ordered]@{
    java = (Test-Path -LiteralPath (Join-Path $JavaDirectory 'bin/java.exe'))
    javac = (Test-Path -LiteralPath (Join-Path $JavaDirectory 'bin/javac.exe'))
    android36 = (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms/android-36/android.jar'))
    buildTools36 = (Test-Path -LiteralPath (Join-Path $SdkRoot 'build-tools/36.0.0/aapt2.exe')) -and (Test-Path -LiteralPath (Join-Path $SdkRoot 'build-tools/36.0.0/apksigner.bat'))
    androidSdkLicenseRecord = (Test-Path -LiteralPath (Join-Path $SdkRoot 'licenses/android-sdk-license'))
}
$missing = @($requirements.Keys | Where-Object { -not $requirements[$_] })
$report = [ordered]@{ origin=$originUri.GetLeftPart([UriPartial]::Authority); package='app.kampira.preview'; appName='Kampira Test'; variant='debug'; requirements=$requirements; missing=$missing; releaseReady=$false; buildExecuted=$false; artifactVerified=$false; deviceInstalled=$false; licenseAcceptedByThisScript=$false }
if ($FirebaseConfig) {
    $FirebaseConfig = [IO.Path]::GetFullPath($FirebaseConfig)
    if (-not (Test-Path -LiteralPath $FirebaseConfig -PathType Leaf)) { throw 'Explicit Firebase config file is missing.' }
    Push-Location -LiteralPath $repositoryRoot
    try { git check-ignore --quiet -- $FirebaseConfig; if ($LASTEXITCODE -ne 0) { throw 'Firebase config must be outside version control under an ignored local path.' } } finally { Pop-Location }
}
$report.firebaseConfigured = [bool]$FirebaseConfig
if ($CheckOnly) { $report | ConvertTo-Json -Depth 5; exit 0 }
if ($ArtifactId -and $ArtifactId -notmatch '^[a-z0-9][a-z0-9-]{0,63}$') { throw 'ArtifactId must be a simple lowercase artifact identifier.' }
$outDirectory = Join-Path $repositoryRoot 'outputs/android-preview/artifacts'
if ($ArtifactId) { $outDirectory = Join-Path $outDirectory $ArtifactId }
if ($ArtifactId -and (Test-Path -LiteralPath (Join-Path $outDirectory 'build-receipt.json'))) { throw 'This artifact already has a receipt. Select a new ArtifactId to preserve build history.' }
if ($missing.Count) { $report | ConvertTo-Json -Depth 5; throw 'Build blocked. Install only the named SDK packages after explicit Google SDK license approval. This script never accepts licenses or installs SDK packages.' }
$wrapperJar = Join-Path $projectRoot 'gradle/wrapper/gradle-wrapper.jar'
if ((Get-FileHash -LiteralPath $wrapperJar -Algorithm SHA256).Hash.ToLowerInvariant() -ne '81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f') { throw 'Gradle wrapper checksum mismatch.' }
$javaResult = & (Join-Path $JavaDirectory 'bin/java.exe') --version
if ($LASTEXITCODE -ne 0 -or ($javaResult -join "`n") -notmatch '^(openjdk|java) 17\.') { throw 'This preview is pinned to JDK 17.' }
$savedVariables = @{}
foreach ($name in @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','GRADLE_USER_HOME','ANDROID_USER_HOME')) { $savedVariables[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $JavaDirectory, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_HOME', $SdkRoot, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $SdkRoot, 'Process')
    [Environment]::SetEnvironmentVariable('GRADLE_USER_HOME', (Join-Path $repositoryRoot 'outputs/android-preview/gradle-user'), 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_USER_HOME', (Join-Path $repositoryRoot 'outputs/android-preview/android-user'), 'Process')
    Push-Location -LiteralPath $projectRoot
    try {
        $previewArguments = @('--no-daemon', '--console=plain', '--max-workers=2', "-PpreviewOrigin=$($report.origin)")
        if ($FirebaseConfig) { $previewArguments += "-PfirebaseConfig=$FirebaseConfig" }
        & (Join-Path $projectRoot 'gradlew.bat') @previewArguments ':app:testDebugUnitTest' ':app:assembleDebug' ':app:lintDebug'
        if ($LASTEXITCODE -ne 0) { throw 'Android debug build or lint failed. No APK readiness claim was made.' }
    } finally { Pop-Location }
    $apk = Join-Path $projectRoot 'app/build/outputs/apk/debug/app-debug.apk'
    if (-not (Test-Path -LiteralPath $apk)) { throw 'Expected debug APK was not produced.' }
    & (Join-Path $SdkRoot 'build-tools/36.0.0/apksigner.bat') verify --verbose $apk
    if ($LASTEXITCODE -ne 0) { throw 'Debug APK signature verification failed.' }
    New-Item -ItemType Directory -Path $outDirectory -Force | Out-Null
    $outApk = Join-Path $outDirectory 'kampira-test-debug.apk'
    Copy-Item -LiteralPath $apk -Destination $outApk -Force
    $report.buildExecuted = $true
    $report.artifactVerified = $true
    $metadata = Get-Content -LiteralPath (Join-Path $projectRoot 'app/build/outputs/apk/debug/output-metadata.json') -Raw | ConvertFrom-Json
    $report.versionCode = $metadata.elements[0].versionCode
    $report.versionName = $metadata.elements[0].versionName
    $report.builtAt = Get-Date -Format o
    $report.artifactId = $ArtifactId
    $report.apk = $outApk
    $report.sha256 = (Get-FileHash -LiteralPath $outApk -Algorithm SHA256).Hash.ToLowerInvariant()
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outDirectory 'build-receipt.json') -Encoding utf8
    $report | ConvertTo-Json -Depth 5
} finally {
    foreach ($name in $savedVariables.Keys) { [Environment]::SetEnvironmentVariable($name, $savedVariables[$name], 'Process') }
}
