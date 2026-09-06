package app.kampira.preview;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** The origin-scoped bridge carries only commands/public account IDs and safe status. */
final class PushCoordinator {
    static final int PERMISSION_REQUEST = 7205;
    static final String CHANNEL = "kampira-social-v1";
    static final String OPEN_ACTION = "app.kampira.preview.OPEN_NOTIFICATION";
    static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private final Activity activity;
    private final WebView web;
    private final PushStore store;
    private final OriginPolicy origin = new OriginPolicy(BuildConfig.PREVIEW_ORIGIN);
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile long documentEpoch;
    private volatile boolean destroyed;
    private boolean busy;
    private String activeRequest = "";
    private Request pendingPermission;

    private final class Request {
        final String id, account, cookie;
        final long document;
        final JavaScriptReplyProxy reply;
        PushBinding lease;
        Request(String id, String account, JavaScriptReplyProxy reply) {
            this.id = id; this.account = account; this.reply = reply;
            this.document = documentEpoch; this.cookie = PushHttp.cookie(); this.lease = store.read();
        }
        boolean current() { return !destroyed && document == documentEpoch; }
        boolean sessionCurrent() { return !PushHttp.fingerprint(cookie).isEmpty() && PushHttp.fingerprint(cookie).equals(PushHttp.fingerprint(PushHttp.cookie())); }
    }

    PushCoordinator(Activity activity, WebView web) {
        this.activity = activity; this.web = web; store = new PushStore(activity);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "KampiraPush", Collections.singleton(BuildConfig.PREVIEW_ORIGIN), (view, message, source, mainFrame, reply) -> {
                if (view != web || !mainFrame || !origin.contains(source.toString()) || !origin.contains(web.getUrl())) return;
                if (message.getType() != WebMessageCompat.TYPE_STRING) return;
                receive(message.getData(), reply);
            });
        }
    }
    void documentStarted() { documentEpoch++; pendingPermission = null; }
    void destroy() { destroyed = true; documentEpoch++; pendingPermission = null; }
    static boolean allowed(android.content.Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 24 && !manager.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) { NotificationChannel channel = manager.getNotificationChannel(CHANNEL); if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false; }
        return true;
    }
    private String permission() {
        if (allowed(activity)) return "granted";
        if (Build.VERSION.SDK_INT >= 33 && !store.permissionAsked() && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return "prompt";
        return "denied";
    }
    private void receive(String raw, JavaScriptReplyProxy reply) {
        if (raw == null || raw.length() > 1024 || destroyed) return;
        try {
            JSONObject message = new JSONObject(raw);
            String id = message.optString("id"), account = message.optString("accountId"), command = message.optString("command");
            if (!PushPolicy.id(id) || !PushPolicy.command(command) || (!command.equals("clear") && !PushPolicy.id(account))) return;
            Request request = new Request(id, account, reply);
            if (command.equals("clear")) {
                PushBinding old = store.clear(); pendingPermission = null;
                activeRequest = ""; busy = false;
                IO.execute(() -> revoke(activity, old, request.cookie, true));
                send(request, "off", BuildConfig.FIREBASE_CONFIGURED, false, ""); return;
            }
            if (!request.sessionCurrent()) { send(request, "error", false, false, "Bildirimleri ayarlamak için tekrar giriş yapmalısın."); return; }
            if (busy) { send(request, "busy", BuildConfig.FIREBASE_CONFIGURED, false, "Başka bir bildirim işlemi sürüyor."); return; }
            if (command.equals("disable")) {
                PushBinding old = store.clear(); busy = true; activeRequest = id;
                IO.execute(() -> {
                    boolean revoked = revoke(activity, old, request.cookie, true);
                    send(request, revoked ? "off" : "error", BuildConfig.FIREBASE_CONFIGURED, false, revoked ? "" : "Bu cihazda bildirim kapatıldı. Sunucu durumunu yenileyebilirsin.");
                }); return;
            }
            if (!BuildConfig.FIREBASE_CONFIGURED) { send(request, "unavailable", false, false, "Bildirimler hazırlanıyor."); return; }
            busy = true; activeRequest = id;
            if (command.equals("enable")) request.lease = store.begin(account, PushHttp.fingerprint(request.cookie));
            else if (!request.lease.account.isEmpty() && (!account.equals(request.lease.account) || !PushHttp.fingerprint(request.cookie).equals(request.lease.session))) {
                store.clear(); request.lease = store.read();
            }
            IO.execute(() -> {
                try {
                    PushHttp.Reply config = PushHttp.call("GET", "", account, request.cookie, null);
                    if (!config.ok() || !request.sessionCurrent()) { send(request, "error", false, false, "Bildirim ayarları doğrulanamadı. Durumu yenileyebilirsin."); return; }
                    // The normal auth API atomically retires the previous cookie session on
                    // login/logout. Only this authenticated current-session read permits pruning.
                    store.pruneObsoleteSessions(PushHttp.fingerprint(request.cookie));
                    JSONObject nativeConfig = config.body.optJSONObject("nativePush");
                    boolean available = nativeConfig != null && nativeConfig.optBoolean("available");
                    if (!available) { send(request, "unavailable", false, false, "Bildirimler hazırlanıyor."); return; }
                    if (command.equals("enable")) { main.post(() -> askPermission(request)); return; }
                    if (!drainRevocations(activity, request.cookie)) { send(request, "error", true, false, "Önceki bildirim kapatma işlemi tamamlanamadı. Durumu yenileyebilirsin."); return; }
                    PushBinding current = store.read();
                    if (!current.sameRegistration(request.lease)) { send(request, "error", true, false, "Bildirim bağlantısı değişti. Durumu yenileyebilirsin."); return; }
                    String serverDevice = "";
                    if (account.equals(current.account) && current.session.equals(PushHttp.fingerprint(request.cookie))) {
                        String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 10, TimeUnit.SECONDS);
                        serverDevice = PushPolicy.registrationDevice(current.device, token);
                    }
                    // A real POST may have committed before its response was lost. Reconcile only
                    // the same locally consented account/session/device, never a cleared binding.
                    if (!current.enabled && !serverDevice.isEmpty() && current.sameRegistration(request.lease)) {
                        String canonical = listedDevice(config.body.optJSONArray("subscriptions"), serverDevice);
                        String canonicalDevice = serverDevice;
                        if (!PushPolicy.id(canonical)) {
                            JSONObject previousToken = uniquePendingConsent(config.body.optJSONArray("subscriptions"), current.device);
                            if (previousToken != null) { canonical = previousToken.optString("id"); canonicalDevice = previousToken.optString("deviceId"); }
                        }
                        if (PushPolicy.id(canonical) && store.commit(current, canonical, canonicalDevice)) KampiraMessagingService.scheduleTokenRefresh(activity, store.read());
                        current = store.read();
                    }
                    boolean enabled = current.sameLease(request.lease) && current.enabled && current.account.equals(account) && listed(config.body.optJSONArray("subscriptions"), current, serverDevice);
                    if (!enabled && current.enabled) { send(request, "error", true, false, "Cihaz bağlantısı yenileniyor. Durumu tekrar kontrol edebilirsin."); KampiraMessagingService.scheduleTokenRefresh(activity, current); return; }
                    send(request, !allowed(activity) && permission().equals("denied") ? "denied" : enabled && allowed(activity) ? "on" : "off", true, enabled && allowed(activity), "");
                } catch (Exception ignored) { send(request, "error", true, false, "Bildirim ayarları şu anda alınamıyor. Tekrar deneyebilirsin."); }
            });
        } catch (Exception ignored) { /* Malformed messages cannot grant permissions or access native credentials. */ }
    }
    private static boolean listed(JSONArray values, PushBinding binding, String serverDevice) {
        if (values == null) return false;
        for (int index = 0; index < values.length(); index++) {
            JSONObject value = values.optJSONObject(index);
            if (value != null && "fcm".equals(value.optString("kind")) && binding.subscription.equals(value.optString("id")) && serverDevice.equals(value.optString("deviceId"))) return true;
        }
        return false;
    }
    private static String listedDevice(JSONArray values, String serverDevice) {
        if (values != null) for (int index = 0; index < values.length(); index++) {
            JSONObject value = values.optJSONObject(index);
            if (value != null && "fcm".equals(value.optString("kind")) && serverDevice.equals(value.optString("deviceId"))) return value.optString("id");
        }
        return "";
    }
    private static JSONObject uniquePendingConsent(JSONArray values, String consent) {
        JSONObject found = null;
        if (values != null) for (int index = 0; index < values.length(); index++) {
            JSONObject value = values.optJSONObject(index);
            if (value != null && "fcm".equals(value.optString("kind")) && value.optString("deviceId").startsWith(consent + ":")) {
                if (found != null) return null; found = value;
            }
        }
        return found;
    }
    private void askPermission(Request request) {
        if (!request.current() || !request.sessionCurrent() || !store.read().sameLease(request.lease)) { send(request, "error", true, false, "Hesap veya sayfa değişti. Tekrar deneyebilirsin."); return; }
        if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            pendingPermission = request; store.askedPermission();
            activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION_REQUEST); return;
        }
        if (!allowed(activity)) { send(request, "denied", true, false, "Bildirim iznini Android ayarlarından açabilirsin."); return; }
        // An already-granted OS permission does not prove a gesture in this WebView.
        // Native confirmation supplies explicit consent on API 23-32 and subsequent enrollments.
        new AlertDialog.Builder(activity).setTitle("Kampira bildirimleri")
            .setMessage("Bu cihazda yeni Kampira bildirimlerini almak istiyor musun?")
            .setPositiveButton("Bildirimleri aç", (dialog, which) -> afterPermission(request))
            .setNegativeButton("Vazgeç", (dialog, which) -> send(request, "off", true, false, ""))
            .setOnCancelListener(dialog -> send(request, "off", true, false, "")).show();
    }
    void permissionResult(int code) {
        if (code != PERMISSION_REQUEST) return;
        Request request = pendingPermission; pendingPermission = null;
        if (request != null) afterPermission(request); else busy = false;
    }
    private void afterPermission(Request request) {
        if (!request.current() || !request.sessionCurrent() || !store.read().sameLease(request.lease)) { send(request, "error", true, false, "Hesap veya sayfa değişti. Tekrar deneyebilirsin."); return; }
        if (!allowed(activity)) { send(request, "denied", true, false, "Bildirim iznini Android ayarlarından açabilirsin."); return; }
        IO.execute(() -> {
            try {
                FirebaseMessaging messaging = FirebaseMessaging.getInstance();
                if (!drainRevocations(activity, request.cookie)) { send(request, "error", true, false, "Önceki bildirim bağlantısı kapatılamadı. Tekrar deneyebilirsin."); return; }
                messaging.setAutoInitEnabled(true);
                String token = Tasks.await(messaging.getToken(), 20, TimeUnit.SECONDS);
                if (!request.current() || !request.sessionCurrent() || !store.read().sameLease(request.lease)) { send(request, "error", true, false, "Hesap değişti. Tekrar deneyebilirsin."); return; }
                PushHttp.Reply result = register(activity, request.lease, request.cookie, token);
                if (result.status == 409 && "PUSH_SESSION_CONFLICT".equals(result.body.optString("code"))) {
                    Tasks.await(messaging.deleteToken(), 10, TimeUnit.SECONDS);
                    token = Tasks.await(messaging.getToken(), 20, TimeUnit.SECONDS);
                    if (!request.sessionCurrent() || !store.read().sameLease(request.lease)) { send(request, "error", true, false, "Hesap değişti. Tekrar deneyebilirsin."); return; }
                    result = register(activity, request.lease, request.cookie, token);
                }
                String subscription = result.body.optString("id");
                if (!result.ok() || !result.body.optBoolean("enabled") || !PushPolicy.id(subscription)) { send(request, "error", true, false, "Bildirim bağlantısı kurulamadı. Tekrar deneyebilirsin."); return; }
                if (!request.sessionCurrent() || !request.current() || !store.commit(request.lease, subscription, PushPolicy.registrationDevice(request.lease.device, token))) {
                    revoke(activity, request.lease.commit(subscription), request.cookie, false);
                    send(request, "error", true, false, "Hesap veya sayfa değişti. Tekrar deneyebilirsin."); return;
                }
                KampiraMessagingService.scheduleTokenRefresh(activity, store.read());
                drainRevocations(activity, request.cookie);
                send(request, "on", true, true, "");
            } catch (Exception ignored) { send(request, "error", true, false, "Bildirim bağlantısı tamamlanamadı. Durumu yenileyebilirsin."); }
        });
    }
    static PushHttp.Reply register(android.content.Context context, PushBinding lease, String cookie, String token) throws Exception {
        String device = PushPolicy.registrationDevice(lease.device, token);
        if (!new PushStore(context).trackAttempt(lease, device)) throw new IllegalStateException("Push attempt changed");
        return PushHttp.call("POST", "", lease.account, cookie, new JSONObject().put("kind", "fcm").put("deviceId", device).put("token", token));
    }
    static boolean revoke(android.content.Context context, PushBinding binding, String cookie, boolean deleteToken) {
        new PushStore(context).rememberRevocation(binding);
        boolean revoked = drainRevocations(context, cookie);
        if (deleteToken && BuildConfig.FIREBASE_CONFIGURED) try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance(); messaging.setAutoInitEnabled(false);
            Tasks.await(messaging.deleteToken(), 10, TimeUnit.SECONDS);
        } catch (Exception ignored) { revoked = false; }
        return revoked;
    }
    static boolean drainRevocations(android.content.Context context, String cookie) {
        PushStore store = new PushStore(context); JSONArray entries = store.pendingRevocations(); boolean complete = true;
        String fingerprint = PushHttp.fingerprint(cookie);
        for (int index = 0; index < entries.length(); index++) {
            JSONObject entry = entries.optJSONObject(index);
            if (entry == null || !fingerprint.equals(entry.optString("session"))) continue;
            try {
                JSONObject target = new JSONObject();
                if (!entry.optString("deviceId").isEmpty()) target.put("deviceId", entry.optString("deviceId")); else target.put("id", entry.optString("id"));
                PushHttp.Reply result = PushHttp.call("DELETE", "", entry.optString("account"), cookie, target);
                if (result.ok() || result.status == 401) store.forgetRevocation(entry); else complete = false;
            } catch (Exception ignored) { complete = false; }
        }
        return complete;
    }
    private void send(Request request, String state, boolean available, boolean enabled, String message) {
        main.post(() -> {
            if (activeRequest.equals(request.id)) { busy = false; activeRequest = ""; }
            if (!request.current()) return;
            try {
                boolean changed = !request.account.isEmpty() && (!request.sessionCurrent() || (enabled && (!store.read().sameLease(request.lease) || !store.read().enabled)));
                JSONObject result = new JSONObject().put("protocolVersion", 1).put("id", request.id).put("accountId", request.account)
                    .put("state", changed ? "error" : state).put("available", available).put("permission", permission()).put("enabled", !changed && enabled)
                    .put("message", changed ? "Hesabın değişti. Durumu yenileyebilirsin." : message);
                request.reply.postMessage(result.toString());
            } catch (Exception ignored) { /* Navigated/destroyed documents have no active reply channel. */ }
        });
    }
    void openNotification(Intent intent) {
        if (intent == null || !OPEN_ACTION.equals(intent.getAction())) return;
        String account = intent.getStringExtra("accountId"), subscription = intent.getStringExtra("subscriptionId"), notification = intent.getStringExtra("notificationId");
        long epoch = intent.getLongExtra("epoch", -1);
        intent.setAction(null); // Consume once; saved/restored Activity state cannot replay the tap.
        if (!PushPolicy.id(account) || !PushPolicy.id(subscription) || !PushPolicy.id(notification)) return;
        PushBinding binding = store.read(); String cookie = PushHttp.cookie();
        if (!binding.accepts(epoch, account, subscription, PushHttp.fingerprint(cookie))) return;
        IO.execute(() -> {
            try {
                JSONObject receipt = PushHttp.receipt(binding, notification, cookie, true);
                String href = receipt == null ? null : PushPolicy.safeHref(origin, receipt.optString("href"));
                main.post(() -> {
                    if (destroyed || !store.read().accepts(epoch, account, subscription, PushHttp.fingerprint(PushHttp.cookie()))) return;
                    if (href != null) web.loadUrl(href);
                    else Toast.makeText(activity, "Bu bildirim artık kullanılabilir değil.", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception ignored) { main.post(() -> { if (!destroyed) Toast.makeText(activity, "Bildirim şu anda açılamıyor.", Toast.LENGTH_SHORT).show(); }); }
        });
    }
}
