[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArtifactId, [Parameter(Mandatory=$true)][string]$FirebaseConfig)
$ErrorActionPreference = 'Stop'
if ($ArtifactId -notmatch '^[a-z0-9][a-z0-9-]{0,63}$') { throw 'Invalid artifact identifier.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$artifact = Join-Path $repo "outputs/android/play/$ArtifactId"
$android = Join-Path $artifact 'android'
if (-not (Test-Path -LiteralPath (Join-Path $artifact 'source-receipt.json'))) { throw 'Prepare an isolated Play project first.' }
if (Test-Path -LiteralPath (Join-Path $artifact 'signed-build-receipt.json')) { throw 'This signed artifact already exists. Prepare a new artifact identifier.' }
$firebaseFile = [IO.Path]::GetFullPath($FirebaseConfig)
$firebase = Get-Content -LiteralPath $firebaseFile -Raw | ConvertFrom-Json
if ($firebase.project_info.project_id -ne 'kampira-ac5a2' -or 'app.kampira.mobile' -notin $firebase.client.client_info.android_client_info.package_name) { throw 'Firebase config does not match the Play app.' }
Push-Location -LiteralPath $repo
try { git check-ignore --quiet -- $firebaseFile; if ($LASTEXITCODE -ne 0) { throw 'Firebase configuration must stay in an ignored path.' } } finally { Pop-Location }
$javaDir = Join-Path $repo 'outputs/android/toolchain/jdk/jdk-17.0.20.1+1'
$sdk = Join-Path $repo 'outputs/android/toolchain/sdk'
$private = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex/private/kampira/android-upload'
$key = Join-Path $private 'kampira-upload.p12'
$passwordFile = Join-Path $private 'password.dpapi'
New-Item -ItemType Directory -Path $private -Force | Out-Null
$saved = @{}
foreach ($name in @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','GRADLE_USER_HOME','ANDROID_USER_HOME','KAMPIRA_UPLOAD_KEYSTORE','KAMPIRA_UPLOAD_PASSWORD')) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    if (-not (Test-Path -LiteralPath $passwordFile)) {
        if (Test-Path -LiteralPath $key) { throw 'An existing signing key needs its original password record.' }
        $bytes = New-Object byte[] 48
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secret = ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
        $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile -Encoding ascii
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
    $secure = (Get-Content -LiteralPath $passwordFile -Raw).Trim() | ConvertTo-SecureString
    $credential = [PSCredential]::new('kampira-upload', $secure)
    [Environment]::SetEnvironmentVariable('KAMPIRA_UPLOAD_PASSWORD', $credential.GetNetworkCredential().Password, 'Process')
    [Environment]::SetEnvironmentVariable('KAMPIRA_UPLOAD_KEYSTORE', $key, 'Process')
    if (-not (Test-Path -LiteralPath $key)) {
        & (Join-Path $javaDir 'bin/keytool.exe') -genkeypair -keystore $key -storetype PKCS12 -alias kampira-upload -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Kampira Android Upload' -storepass:env KAMPIRA_UPLOAD_PASSWORD -keypass:env KAMPIRA_UPLOAD_PASSWORD -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed.' }
    }
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $javaDir, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdk, 'Process')
    [Environment]::SetEnvironmentVariable('GRADLE_USER_HOME', (Join-Path $repo 'outputs/android-preview/gradle-user'), 'Process')
    [Environment]::SetEnvironmentVariable('ANDROID_USER_HOME', (Join-Path $repo 'outputs/android-preview/android-user'), 'Process')
    Push-Location -LiteralPath $android
    try {
        & .\gradlew.bat --no-daemon --console=plain --max-workers=2 "-PfirebaseConfig=$firebaseFile" :app:testReleaseUnitTest :app:bundleRelease :app:assembleRelease :app:lintRelease *> (Join-Path $artifact 'signed-build.log')
        if ($LASTEXITCODE -ne 0) { throw 'Play candidate build or lint failed. Inspect the build log.' }
    } finally { Pop-Location }
    $aab = Join-Path $android 'app/build/outputs/bundle/release/app-release.aab'
    $apk = Join-Path $android 'app/build/outputs/apk/release/app-release.apk'
    & (Join-Path $javaDir 'bin/jarsigner.exe') -verify $aab *> (Join-Path $artifact 'aab-signature.txt')
    if ($LASTEXITCODE -ne 0 -or (Get-Content -LiteralPath (Join-Path $artifact 'aab-signature.txt') -Raw) -notmatch 'jar verified') { throw 'AAB signature validation failed.' }
    & (Join-Path $sdk 'build-tools/36.0.0/apksigner.bat') verify --verbose --print-certs $apk *> (Join-Path $artifact 'apk-signature.txt')
    if ($LASTEXITCODE -ne 0) { throw 'APK signature validation failed.' }
    $manifest = & (Join-Path $sdk 'build-tools/36.0.0/aapt.exe') dump badging $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK manifest inspection failed.' }
    $manifest | Set-Content -LiteralPath (Join-Path $artifact 'apk-manifest.txt') -Encoding utf8
    $manifestText = $manifest -join "`n"
    if ($manifestText -notmatch "package: name='app.kampira.mobile' versionCode='3' versionName='1.8.1'" -or $manifestText -notmatch "targetSdkVersion:'36'" -or $manifestText -match 'application-debuggable') { throw 'Unexpected release manifest identity, SDK or debug flag.' }
    Copy-Item -LiteralPath $aab -Destination (Join-Path $artifact 'kampira-1.8.1.aab')
    Copy-Item -LiteralPath $apk -Destination (Join-Path $artifact 'kampira-1.8.1.apk')
    $receipt = [ordered]@{ checkedAt=(Get-Date -Format o); artifactId=$ArtifactId; packageId='app.kampira.mobile'; origin='https://kampira.net'; versionName='1.8.1'; versionCode=3; targetSdk=36; debuggable=$false; firebaseConfigured=$true; buildPassed=$true; aabSignatureVerified=$true; apkSignatureVerified=$true; uploadKeyPath=$key; aabSha256=(Get-FileHash -LiteralPath $aab -Algorithm SHA256).Hash.ToLowerInvariant(); apkSha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant(); physicalJourneysVerified=$false; playUploaded=$false; productionPublished=$false }
    $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifact 'signed-build-receipt.json') -Encoding utf8
    $receipt | ConvertTo-Json
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}

