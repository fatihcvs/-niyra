# Android preview native notifications — phase 3

The `app.kampira.preview` v3 debug wrapper supports native Firebase Cloud Messaging. WebView has no Web Push implementation, so its preference card uses an exact-origin `KampiraPush` message listener. The normal browser continues to use Web Push. This document describes local code and verification; it does not certify Play release or physical notification delivery.

## User interaction

The notification preference card reads status without creating a token or requesting permission. Its enable button starts enrollment. Android 13+ requests `POST_NOTIFICATIONS`; older Android, or a previously granted OS permission, shows a native confirmation. Denial leaves browsing usable. Native replies contain public account/request identifiers, permission, availability and enabled state only. Tokens and cookies never cross into JavaScript.

Firebase auto initialization for messaging and Analytics collection are disabled in the manifest. Only messaging is a Firebase dependency; no Analytics SDK is added. An explicit enable permits token creation. Disable immediately invalidates the local generation and clears visible notifications, then revokes the exact server generation and deletes the FCM token. Failed revocations remain retryable and cannot report a completed server disable.

## Account and delivery boundaries

- The listener is injected only into the exact configured origin and ignores subframes, binary messages and unknown commands. It uses no `addJavascriptInterface` or arbitrary evaluation command.
- Native HTTP privately reads the existing WebView cookie and sends the normal account-context header. Requests are limited to the same-origin subscription endpoint, reject redirects, bound response size/time and never log credentials.
- Each consent has a fresh UUID. Its server device identity also includes a digest of its token. Delayed requests for an old consent/token cannot replace a newer server row. Migration `0030` retires deleted device identities, including an unknown-acknowledgement POST that arrives after its DELETE.
- The store writes a recovery record before every POST. Binding changes and attempt retirement share one preferences commit. Queued cleanup contains only account/subscription/device IDs and a session fingerprint. Current-session cleanup retains transient failures; authenticated session turnover removes obsolete records after the normal server auth lifecycle has revoked the previous session.
- Receipt and token work belongs to WorkManager. High-priority receipt work uses expedited jobs on API 31+ with normal-work fallback. Older supported versions use normal durable work. Receive work expires within the provider's five-minute lifetime and retries transient HTTP failures a bounded number of times.
- Display checks the current cookie fingerprint, account, exact subscription and local epoch both before HTTP and under the display/clear lock. Only the generic “Kampira / Yeni bir bildirimin var.” text is shown. Logout/account switch cannot resurrect a notification from an already-started receipt.
- A notification tap revalidates with `purpose=click`; already-read but still-authorized notifications remain navigable. Only root SPA routes with known, nonduplicated parameters are accepted. Receive validation still requires unread status.

## Build and local configuration

The Android client configuration is supplied from a Git-ignored file, then converted to generated Android resources. The server service-account key is never read by the Android build or included in its APK.

```powershell
./experiments/android-preview/build-preview.ps1 `
  -Origin 'http://192.168.0.4:5173' `
  -ArtifactId 'a-new-artifact-name' `
  -FirebaseConfig 'D:/-niyra-main/outputs/firebase/kampira-ac5a2/android-preview/google-services.json'
```

Omit `-FirebaseConfig` for a deliberately unconfigured preview. It reports unavailable rather than inventing provider support. Builds run unit tests, assemble, lint and signature verification with at most two Gradle workers. Each artifact name is immutable. Release variants remain forbidden.

Pinned native dependencies: AndroidX WebKit 1.14.0 (retains API 23 compatibility), WorkManager 2.11.2 and Firebase Messaging 25.0.1. Current SDK/API behavior was checked against primary documentation on 2026-09-06.

## Verification boundaries

- `PushBindingTest`: 48 JVM scenarios covering process recreation, session/epoch/subscription changes, immutable registration identity, safe deep links and HTTP retry classification.
- `OriginPolicyTest`: 24 checks; `RecoveryStateTest`: 28 checks retained.
- `PushStoreTest`: nine tests execute the real store against an atomic mocked preferences adapter. They cover unknown acknowledgement and revocation recovery across store recreation, precise stale-response rejection, token retirement and 40 session turnovers. These are local unit tests, not an Android filesystem/device claim.
- Final build, lint, signature, install and physical delivery results belong in the generated phase-3 evidence receipt. An APK install alone does not prove enrollment, background delivery or tap navigation.

A physical test must use the real tablet session, enable notifications, trigger a normal authorized social interaction, verify receipt while the app is backgrounded/closed, tap into the correct route and repeat after account switch/disable. Android force-stop requires a manual reopen; an unavailable network, expired session, denied permission or OS background restrictions can suppress or delay delivery.

## Primary references

- [Chromium WebView's notification and push services](https://raw.githubusercontent.com/chromium/chromium/main/android_webview/browser/aw_browser_context.cc)
- [Android WebViewCompat listener](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [Firebase Android messaging setup and auto initialization](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [Firebase Android message receipt and callback lifetime](https://firebase.google.com/docs/cloud-messaging/android/receive-messages)
- [Android notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
- [WorkManager work and expedited-job behavior](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
- [FCM force-stop boundary](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages)
- [Firebase Messaging SDK release notes](https://firebase.google.com/support/release-notes/android)
- [WebKit versions](https://developer.android.com/jetpack/androidx/releases/webkit), [WorkManager versions](https://developer.android.com/jetpack/androidx/releases/work)
