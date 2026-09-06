package app.kampira.preview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebBackForwardList;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;

/** Isolated DEBUG harness. Only the exact-origin push bridge can request native notification access. */
public final class MainActivity extends Activity {

    private static final String SAVED_URL = "kampira.preview.safeUrl";
    private static final String SAVED_WEBVIEW = "kampira.preview.webView";
    private static final long LOAD_TIMEOUT_MS = 20_000;
    private WebView webView;
    private FrameLayout root;
    private ScrollView recoveryOverlay;
    private TextView recoveryTitle;
    private TextView recoveryMessage;
    private ProgressBar recoveryProgress;
    private Button retryButton;
    private Button homeButton;
    private RecoveryState recovery;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable loadTimeout;
    private OriginPolicy origin;


    private boolean imeVisible;
    private OnBackInvokedCallback backCallback;
    private boolean backCallbackRegistered;
    private PushCoordinator push;
    private CameraPicker cameraPicker;
    private NativeFilesCoordinator nativeFiles;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (!BuildConfig.DEBUG || BuildConfig.RELEASE_READY) { finish(); return; }
        origin = new OriginPolicy(BuildConfig.PREVIEW_ORIGIN);
        recovery = new RecoveryState(origin, state == null ? null : state.getString(SAVED_URL));
        root = new FrameLayout(this);
        setContentView(root);
        configureWindow();
        createRecoveryOverlay();
        createWebView();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::goBack;
        }
        if (Build.VERSION.SDK_INT < 24 && origin.isHttp()) {
            recovery.unavailable(RecoveryState.Failure.UNSUPPORTED);
            renderRecovery();
            return;
        }
        beginNavigation(recovery.url());
        WebBackForwardList restored = null;
        if (state != null) {
            Bundle webState = state.getBundle(SAVED_WEBVIEW);
            try { restored = webView.restoreState(webState == null ? state : webState); }
            catch (IllegalArgumentException | IllegalStateException ignored) { /* Reload only the separately validated safe URL. */ }
        }
        if (safeHistory(restored)) {
            recovery.remember(restored.getCurrentItem().getUrl());
            beginNavigation(recovery.url());
        } else {
            if (restored != null) { root.removeView(webView); webView.destroy(); createWebView(); }
            webView.loadUrl(recovery.url());
        }
        updateBackCallback();
        push.openNotification(getIntent());
    }

    private void createWebView() {
        if (push != null) push.destroy();
        if (nativeFiles != null) nativeFiles.destroy();
        if (cameraPicker != null) cameraPicker.cancel();
        webView = new WebView(this);
        root.addView(webView, 0, new FrameLayout.LayoutParams(-1, -1));
        configureWebView();
        push = new PushCoordinator(this, webView);
        cameraPicker = new CameraPicker(this, webView);
        nativeFiles = new NativeFilesCoordinator(this, webView);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (origin.contains(request.getUrl().toString())) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(request.getUrl());
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String value) {
                if (origin.contains(value)) return false;
                openExternal(Uri.parse(value));
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ((request.isForMainFrame() && !origin.contains(uri.toString())) || ("http".equalsIgnoreCase(scheme) && !origin.contains(uri.toString())) || "file".equalsIgnoreCase(scheme) || "content".equalsIgnoreCase(scheme)) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked preview origin", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                if (view == webView && recovery.fail(error.getUrl(), RecoveryState.Failure.SECURITY)) finishFailure();
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { if (view == webView) { if (push != null) push.documentStarted(); if (nativeFiles != null) nativeFiles.documentStarted(); cancelFiles(); beginNavigation(url); } }
            @Override public void onPageCommitVisible(WebView view, String url) { finishNavigation(view, url); }
            @Override public void onPageFinished(WebView view, String url) {
                if (view != webView) return;
                finishNavigation(view, url);
                recovery.remember(view.getUrl());
                CookieManager.getInstance().flush(); updateBackCallback();
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (view == webView) { recovery.remember(url); updateBackCallback(); }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                RecoveryState.Failure failure = error.getErrorCode() == ERROR_FAILED_SSL_HANDSHAKE ? RecoveryState.Failure.SECURITY : RecoveryState.Failure.CONNECTION;
                if (view == webView && request.isForMainFrame() && recovery.fail(request.getUrl().toString(), failure)) finishFailure();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (view == webView && request.isForMainFrame() && recovery.fail(request.getUrl().toString(), RecoveryState.httpFailure(response.getStatusCode()))) finishFailure();
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != webView) { root.removeView(view); view.destroy(); return true; }
                cancelFiles();
                if (push != null) push.destroy();
                if (nativeFiles != null) nativeFiles.destroy();
                if (cameraPicker != null) cameraPicker.cancel();
                root.removeView(view);
                view.destroy();
                if (webView == view) webView = null;
                updateBackCallback();
                recovery.unavailable(RecoveryState.Failure.RENDERER);
                finishFailure();
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (view != webView || cameraPicker == null) { callback.onReceiveValue(null); return true; }
                return cameraPicker.show(callback, params);
            }
        });
        webView.setDownloadListener((url, userAgent, disposition, mimeType, length) -> {
            Uri target = Uri.parse(url);
            if (!("https".equalsIgnoreCase(target.getScheme()) || "http".equalsIgnoreCase(target.getScheme()))) {
                Toast.makeText(this, "Bu dışa aktarma türü test uygulamasında desteklenmiyor. Tarayıcıdaki Kampira'yı kullanabilirsin.", Toast.LENGTH_LONG).show();
                return;
            }
            Toast.makeText(this, "İndirme tarayıcıda açılacak; orada ayrıca giriş yapman gerekebilir.", Toast.LENGTH_LONG).show();
            openExternal(target);
        });
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (nativeFiles != null && nativeFiles.activityResult(code, result, data)) return;
        if (cameraPicker != null) cameraPicker.activityResult(code, result, data);
    }
    private void cancelFiles() { if (cameraPicker != null) cameraPicker.cancel(); }
    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme))) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException error) { Toast.makeText(this, "Bu bağlantıyı açabilecek uygulama bulunamadı.", Toast.LENGTH_LONG).show(); }
    }

    @SuppressWarnings("deprecation")
    private void configureWindow() {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        root.setBackgroundColor(dark ? Color.rgb(22, 23, 26) : Color.WHITE);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                imeVisible = insets.isVisible(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
            if (getWindow().getInsetsController() != null) getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS, android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else {
            getWindow().setStatusBarColor(dark ? Color.rgb(22, 23, 26) : Color.WHITE);
            getWindow().setNavigationBarColor(dark ? Color.rgb(22, 23, 26) : Color.WHITE);
            getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0));
        }
        root.requestApplyInsets();
        applyRecoveryColors();
    }
    private void createRecoveryOverlay() {
        recoveryOverlay = new ScrollView(this);
        recoveryOverlay.setFillViewport(true);
        recoveryOverlay.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));
        recoveryProgress = new ProgressBar(this);
        recoveryProgress.setContentDescription(getString(R.string.preview_loading_title));
        content.addView(recoveryProgress, new LinearLayout.LayoutParams(dp(32), dp(32)));
        recoveryTitle = new TextView(this);
        recoveryTitle.setTextSize(22); recoveryTitle.setGravity(Gravity.CENTER);
        recoveryTitle.setPadding(0, dp(16), 0, dp(8));
        content.addView(recoveryTitle);
        recoveryMessage = new TextView(this);
        recoveryMessage.setTextSize(16); recoveryMessage.setGravity(Gravity.CENTER);
        recoveryMessage.setPadding(0, 0, 0, dp(16));
        content.addView(recoveryMessage);
        retryButton = new Button(this); retryButton.setText(R.string.preview_retry); retryButton.setMinHeight(dp(48));
        retryButton.setOnClickListener(view -> retryNavigation());
        content.addView(retryButton);
        homeButton = new Button(this); homeButton.setText(R.string.preview_home); homeButton.setMinHeight(dp(48));
        homeButton.setOnClickListener(view -> {
            if (!recovery.canRetry()) return;
            beginNavigation(origin.startUrl());
            if (webView == null) createWebView();
            webView.loadUrl(origin.startUrl());
        });
        content.addView(homeButton);
        recoveryOverlay.addView(content, new ScrollView.LayoutParams(-1, -1));
        root.addView(recoveryOverlay, new FrameLayout.LayoutParams(-1, -1));
        applyRecoveryColors();
        renderRecovery();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void applyRecoveryColors() {
        if (recoveryOverlay == null) return;
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        recoveryOverlay.setBackgroundColor(dark ? Color.rgb(22, 23, 26) : Color.WHITE);
        recoveryTitle.setTextColor(dark ? Color.WHITE : Color.rgb(22, 23, 26));
        recoveryMessage.setTextColor(dark ? Color.rgb(190, 192, 200) : Color.rgb(80, 84, 98));
    }
    private void renderRecovery() {
        boolean ready = recovery.phase() == RecoveryState.Phase.READY;
        recoveryOverlay.setVisibility(ready ? View.GONE : View.VISIBLE);
        if (webView != null) webView.setVisibility(ready ? View.VISIBLE : View.INVISIBLE);
        boolean loading = recovery.busy() || recovery.phase() == RecoveryState.Phase.IDLE;
        recoveryProgress.setVisibility(loading ? View.VISIBLE : View.GONE);
        retryButton.setVisibility(loading || !recovery.canRetry() ? View.GONE : View.VISIBLE);
        retryButton.setEnabled(recovery.canRetry());
        homeButton.setVisibility(recovery.canRetry() && !RecoveryState.sameDocument(recovery.url(), origin.startUrl()) ? View.VISIBLE : View.GONE);
        int title = R.string.preview_loading_title, message = R.string.preview_loading_message;
        if (!loading) {
            switch (recovery.failure()) {
                case TIMEOUT: title = R.string.preview_timeout_title; message = R.string.preview_timeout_message; break;
                case SERVER: title = R.string.preview_server_title; message = R.string.preview_server_message; break;
                case NOT_FOUND: title = R.string.preview_missing_title; message = R.string.preview_missing_message; break;
                case ACCESS: title = R.string.preview_access_title; message = R.string.preview_access_message; break;
                case SECURITY: title = R.string.preview_security_title; message = R.string.preview_security_message; break;
                case RENDERER: title = R.string.preview_renderer_title; message = R.string.preview_renderer_message; break;
                case UNSUPPORTED: title = R.string.preview_unsupported_title; message = R.string.preview_unsupported_message; break;
                default: title = R.string.preview_connection_title; message = R.string.preview_connection_message;
            }
        }
        recoveryTitle.setText(title); recoveryMessage.setText(message);
    }
    private boolean safeHistory(WebBackForwardList history) {
        if (history == null || history.getCurrentItem() == null) return false;
        for (int index = 0; index < history.getSize(); index++) if (!origin.contains(history.getItemAtIndex(index).getUrl())) return false;
        return true;
    }
    private void cancelLoadTimeout() { if (loadTimeout != null) { mainHandler.removeCallbacks(loadTimeout); loadTimeout = null; } }
    private void scheduleLoadTimeout() {
        cancelLoadTimeout();
        long attempt = recovery.attempt();
        loadTimeout = () -> {
            if (!recovery.timeout(attempt)) return;
            if (webView != null) webView.stopLoading();
            renderRecovery();
        };
        mainHandler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
    }
    private void beginNavigation(String url) {
        if (!recovery.begin(url)) return;
        renderRecovery(); scheduleLoadTimeout();
    }
    private void finishNavigation(WebView view, String url) {
        if (view == webView && recovery.complete(url)) { cancelLoadTimeout(); renderRecovery(); }
    }
    private void finishFailure() { cancelLoadTimeout(); renderRecovery(); }
    private void retryNavigation() {
        if (!recovery.retry()) return;
        renderRecovery(); scheduleLoadTimeout();
        if (webView == null) createWebView();
        if (RecoveryState.sameDocument(webView.getUrl(), recovery.url())) webView.reload();
        else webView.loadUrl(recovery.url());
    }
    private void goBack() {
        if (Build.VERSION.SDK_INT >= 30 && imeVisible && getWindow().getInsetsController() != null) { getWindow().getInsetsController().hide(WindowInsets.Type.ime()); return; }
        if (webView != null && webView.canGoBack()) webView.goBack(); else finish();
    }
    private void updateBackCallback() {
        if (Build.VERSION.SDK_INT < 33 || backCallback == null) return;
        boolean needed = webView != null && webView.canGoBack();
        if (needed == backCallbackRegistered) return;
        if (needed) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        else getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        backCallbackRegistered = needed;
    }
    // API 33+ uses the platform callback above, enabled only for WebView history.
    // Retain this legacy entry point for API 23-32; it is not the gesture path on API 36.
    @Override @SuppressWarnings("deprecation") @SuppressLint("GestureBackNavigation") public void onBackPressed() { goBack(); }
    @Override public void onConfigurationChanged(Configuration configuration) { super.onConfigurationChanged(configuration); configureWindow(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (webView != null) {
            recovery.remember(webView.getUrl());
            Bundle history = new Bundle();
            if (webView.saveState(history) != null) state.putBundle(SAVED_WEBVIEW, history);
        }
        state.putString(SAVED_URL, recovery.url());
        CookieManager.getInstance().flush();
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() {
        if (webView != null) { recovery.remember(webView.getUrl()); webView.onPause(); }
        CookieManager.getInstance().flush(); super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        if (push != null) push.destroy();
        if (nativeFiles != null) nativeFiles.destroy();
        if (cameraPicker != null) cameraPicker.cancel();
        cancelFiles();
        cancelLoadTimeout();
        if (Build.VERSION.SDK_INT >= 33 && backCallbackRegistered) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        if (webView != null) { root.removeView(webView); webView.destroy(); webView = null; }
        super.onDestroy();
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (push != null) push.permissionResult(code);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (push != null) push.openNotification(intent);
    }
}
