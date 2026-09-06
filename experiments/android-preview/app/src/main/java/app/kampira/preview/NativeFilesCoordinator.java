package app.kampira.preview;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** No credential, native path, or file grant is exposed through the web message bridge. */
final class NativeFilesCoordinator {
    private static final AtomicInteger SAVE_CODES = new AtomicInteger(10000);
    private static final long TIMEOUT = 300_000;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private final Activity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final OriginPolicy origin = new OriginPolicy(BuildConfig.PREVIEW_ORIGIN);
    private volatile long document;
    private volatile boolean destroyed;
    private volatile Operation active;
    private final HashMap<Integer, Operation> saveRequests = new HashMap<>();
    private final ArrayList<Operation> shared = new ArrayList<>();

    private final class Request {
        final String id, account, cookie;
        final long epoch;
        final JavaScriptReplyProxy reply;
        Request(String id, String account, JavaScriptReplyProxy reply) { this.id = id; this.account = account; this.reply = reply; cookie = PushHttp.cookie(); epoch = document; }
        boolean visible() { return !destroyed && epoch == document; }
        boolean session() { String hash = PushHttp.fingerprint(cookie); return !hash.isEmpty() && hash.equals(PushHttp.fingerprint(PushHttp.cookie())); }
    }
    private final class Operation {
        final FileTransferState state;
        final Request first;
        final String action;
        String name, mime;
        volatile Request command;
        volatile boolean working = true;
        volatile boolean awaitingSave;
        volatile HttpURLConnection connection;
        volatile File file;
        Uri granted;
        Runnable timeout, sessionCheck;
        Operation(Request request, String action, String name, String mime, long size) {
            first = request; command = request; this.action = action; this.name = name; this.mime = mime;
            state = new FileTransferState(request.id, UUID.randomUUID().toString(), request.account, PushHttp.fingerprint(request.cookie), request.epoch, size);
        }
        boolean current() { return active == this && first.visible() && state.current(first.account, PushHttp.fingerprint(PushHttp.cookie()), document); }
    }
    private static final class Failure extends IOException {
        final int status;
        Failure(String message, int status) { super(message); this.status = status; }
    }
    NativeFilesCoordinator(Activity activity, WebView web) {
        this.activity = activity; this.web = web;
        IO.execute(() -> FileCache.clean(activity, "transfers", 24 * 60 * 60_000L));
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.addWebMessageListener(web, "KampiraFiles", Collections.singleton(BuildConfig.PREVIEW_ORIGIN), (view, message, source, mainFrame, reply) -> {
            if (view != web || !mainFrame || !origin.contains(source.toString()) || !origin.contains(web.getUrl()) || message.getType() != WebMessageCompat.TYPE_STRING) return;
            receive(message.getData(), reply);
        });
    }
    void documentStarted() { document++; stop(active, false); clearShared(); }
    void destroy() { destroyed = true; document++; stop(active, false); clearShared(); }
    private void receive(String raw, JavaScriptReplyProxy reply) {
        if (destroyed || raw == null || raw.length() > 68_000) return;
        try {
            JSONObject json = new JSONObject(raw);
            String id = json.optString("id"), account = json.optString("accountId"), command = json.optString("command");
            if (!PushPolicy.id(id) || (!command.equals("clear") && !PushPolicy.id(account))) return;
            Request request = new Request(id, account, reply);
            if (command.equals("clear")) { stop(active, true); clearShared(); send(request, "cancelled", null, "", 0); return; }
            if (!request.session()) { send(request, "error", null, "Oturumun değişti. Tekrar giriş yapıp deneyebilirsin.", 401); return; }
            if (command.equals("cancel")) {
                Operation op = active;
                String original = json.optString("requestId"), transfer = json.optString("transferId");
                if (op != null && account.equals(op.first.account) && (op.state.matchesCancel(original, transfer) || (transfer.isEmpty() && op.command != null && op.command.id.equals(original)))) stop(op, true);
                send(request, "cancelled", null, "", 0); return;
            }
            if (command.equals("blobChunk") || command.equals("blobFinish")) { continueBlob(request, json, command); return; }
            if (!command.matches("download|shareLink|blobStart")) { send(request, "error", null, "Bu dosya işlemi desteklenmiyor.", 0); return; }
            if (active != null) { send(request, "busy", null, "Başka bir dosya işlemi sürüyor.", 0); return; }
            String action = command.equals("shareLink") ? "share" : json.optString("action");
            String mime = FilePolicy.mime(json.optString("mime"));
            long size = json.optLong("size", -1);
            String url = command.equals("download") ? FilePolicy.noteUrl(origin, json.optString("url")) : command.equals("shareLink") ? FilePolicy.shareUrl(origin, json.optString("url")) : "";
            if (!FilePolicy.action(action) || url == null || (command.equals("blobStart") && (!FilePolicy.blobMime(mime) || !integer(json, "size") || size < 1 || size > FilePolicy.BLOB_LIMIT))) { send(request, "error", null, "Dosya biçimi veya bağlantısı desteklenmiyor.", 0); return; }
            Operation op = new Operation(request, action, FilePolicy.name(json.optString("name"), mime), mime, command.equals("blobStart") ? size : 0);
            active = op; arm(op);
            IO.execute(() -> {
                try {
                    authenticate(op);
                    if (command.equals("download")) { download(op, url); main.post(() -> offer(op)); }
                    else if (command.equals("shareLink")) main.post(() -> shareLink(op, url, bounded(json.optString("title"), 160), bounded(json.optString("text"), 2000)));
                    else {
                        op.file = FileCache.create(activity, "transfers", ".part"); requireCurrent(op);
                        op.working = false;
                        send(request, "ready", new JSONObject().put("transferId", op.state.transferId).put("maxChunkBytes", FilePolicy.CHUNK_LIMIT), "", 0);
                    }
                } catch (Exception error) { fail(op, error); }
            });
        } catch (Exception ignored) { /* Malformed messages never trigger native actions. */ }
    }
    private static String bounded(String text, int max) { return text.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", "").substring(0, Math.min(max, text.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", "").length())); }
    private static boolean integer(JSONObject json, String key) { Object value = json.opt(key); return value instanceof Number && !Double.isInfinite(((Number) value).doubleValue()) && !Double.isNaN(((Number) value).doubleValue()) && ((Number) value).doubleValue() == ((Number) value).longValue(); }
    private void authenticate(Operation op) throws Exception {
        requireCurrent(op);
        PushHttp.Reply response = PushHttp.call("GET", "", op.first.account, op.first.cookie, null);
        if (!response.ok()) throw new Failure(response.status == 401 ? "Oturumun sona erdi. Tekrar giriş yapmalısın." : response.status == 409 ? "Hesap değişti. Dosyayı yeniden açmalısın." : "Hesabın doğrulanamadı. Tekrar deneyebilirsin.", response.status);
        requireCurrent(op);
    }
    private void requireCurrent(Operation op) throws IOException { if (!op.current()) throw new Failure("İşlem iptal edildi veya hesap değişti.", 409); }
    private void arm(Operation op) {
        op.timeout = () -> { if (active == op) { send(op.command, "error", null, "Dosya işlemi zaman aşımına uğradı. Yeniden deneyebilirsin.", 0); stop(op, false); } };
        main.postDelayed(op.timeout, TIMEOUT);
        op.sessionCheck = new Runnable() { @Override public void run() {
            if (active != op) return;
            if (!op.current()) { send(op.command, "error", null, "Hesap değişti. İşlem iptal edildi.", 409); stop(op, false); }
            else main.postDelayed(this, 500);
        } };
        main.postDelayed(op.sessionCheck, 500);
    }
    private void download(Operation op, String url) throws Exception {
        requireCurrent(op);
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection(); op.connection = connection;
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(6000); connection.setReadTimeout(15000);
        connection.setRequestProperty("Cookie", op.first.cookie); connection.setRequestProperty("X-Account-Context", op.first.account);
        connection.setRequestProperty("Origin", BuildConfig.PREVIEW_ORIGIN); connection.setRequestProperty("Accept", "application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw new Failure(status == 401 ? "Oturumun sona erdi." : status == 409 ? "Hesap değişti." : status == 404 ? "Dosya artık erişilebilir değil." : "Dosya indirilemedi. Yeniden deneyebilirsin.", status);
            op.mime = FilePolicy.mime(connection.getContentType());
            String lengthHeader = connection.getHeaderField("Content-Length");
            long declared = lengthHeader == null ? -1 : Long.parseLong(lengthHeader);
            if (!FilePolicy.noteMime(op.mime) || declared > FilePolicy.NOTE_LIMIT || declared == 0 || (!"identity".equalsIgnoreCase(connection.getContentEncoding()) && connection.getContentEncoding() != null)) throw new Failure("Dosya biçimi veya boyutu desteklenmiyor.", 0);
            op.name = FilePolicy.dispositionName(connection.getHeaderField("Content-Disposition"), op.mime);
            op.file = FileCache.create(activity, "transfers", ".part");
            long total = 0;
            try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(op.file)) {
                byte[] buffer = new byte[16 * 1024]; int length;
                while ((length = input.read(buffer)) != -1) { requireCurrent(op); total += length; if (total > FilePolicy.NOTE_LIMIT) throw new IOException("Dosya çok büyük."); output.write(buffer, 0, length); }
            }
            if (total == 0 || (declared >= 0 && total != declared)) throw new IOException("Dosya eksik indirildi.");
            requireCurrent(op);
        } finally { op.connection = null; connection.disconnect(); }
    }
    private void continueBlob(Request request, JSONObject json, String command) {
        Operation op = active;
        if (op == null || !op.current() || !request.account.equals(op.first.account) || !json.optString("transferId").equals(op.state.transferId) || op.file == null) { send(request, "error", null, "Dosya aktarımı sona erdi. Yeniden deneyebilirsin.", 0); return; }
        if (op.working || op.awaitingSave) { send(request, "busy", null, "Önceki dosya parçası işleniyor.", 0); return; }
        op.working = true; op.command = request;
        IO.execute(() -> {
            try {
                requireCurrent(op);
                if (command.equals("blobChunk")) {
                    String encoded = json.optString("base64");
                    if (!FilePolicy.base64Chunk(encoded)) throw new IOException("Geçersiz dosya parçası.");
                    byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                    if (!integer(json, "sequence") || !op.state.append(json.optInt("sequence", -1), bytes.length)) throw new IOException("Dosya parçası sırası veya boyutu değişti.");
                    try (OutputStream output = new FileOutputStream(op.file, true)) { output.write(bytes); }
                    requireCurrent(op); op.working = false;
                    send(request, "received", new JSONObject().put("nextSequence", op.state.sequence()), "", 0);
                } else {
                    if (!op.state.complete() || op.file.length() != op.state.expected) throw new IOException("Dosya aktarımı tamamlanmadı.");
                    authenticate(op); main.post(() -> offer(op));
                }
            } catch (Exception error) { fail(op, error); }
        });
    }
    private void offer(Operation op) {
        if (!op.current()) { stop(op, false); return; }
        try {
            if (op.action.equals("save")) {
                op.awaitingSave = true;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(op.mime).putExtra(Intent.EXTRA_TITLE, op.name);
                int code = SAVE_CODES.getAndIncrement();
                if (code > 30000) throw new IOException("Dosya seçiciyi yeniden açmak için uygulamayı yeniden başlatmalısın.");
                saveRequests.put(code, op);
                try { activity.startActivityForResult(intent, code); } catch (Exception error) { saveRequests.remove(code); throw error; }
            } else {
                File named = new File(op.file.getParentFile(), "kampira-" + op.state.transferId + "-" + op.name);
                if (!op.file.renameTo(named)) throw new IOException("Dosya paylaşmaya hazırlanamadı.");
                op.file = named;
                Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", named); op.granted = uri;
                Intent intent = new Intent(Intent.ACTION_SEND).setType(op.mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.setClipData(ClipData.newUri(activity.getContentResolver(), op.name, uri));
                activity.startActivity(Intent.createChooser(intent, "Dosyayı paylaş"));
                shared.add(op); send(op.command, "shareOpened", null, "", 0); finish(op, true);
            }
        } catch (Exception error) { fail(op, error); }
    }
    private void shareLink(Operation op, String url, String title, String text) {
        if (!op.current()) { stop(op, false); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text.isEmpty() ? url : text + "\n" + url);
            activity.startActivity(Intent.createChooser(intent, "Bağlantıyı paylaş"));
            send(op.command, "shareOpened", null, "", 0); finish(op, false);
        } catch (Exception error) { fail(op, error); }
    }
    boolean activityResult(int code, int result, Intent data) {
        Operation op = saveRequests.remove(code);
        if (op == null) return code >= 10000 && code <= 30000;
        op.awaitingSave = false;
        Uri target = data == null ? null : data.getData();
        if (active != op || !op.current()) { if (result == Activity.RESULT_OK) deleteDocument(target); return true; }
        if (result != Activity.RESULT_OK || target == null) { send(op.command, "cancelled", null, "", 0); finish(op, false); return true; }
        if (!"content".equals(target.getScheme()) || target.getAuthority() == null || target.getAuthority().equals(activity.getPackageName() + ".files")) { fail(op, new IOException("Kaydetme konumu geçersiz.")); return true; }
        IO.execute(() -> {
            boolean saved = false;
            try {
                authenticate(op);
                try (InputStream input = new FileInputStream(op.file); OutputStream output = activity.getContentResolver().openOutputStream(target, "wt")) {
                    if (output == null) throw new IOException("Dosya konumu açılamadı.");
                    byte[] buffer = new byte[16 * 1024]; int length;
                    while ((length = input.read(buffer)) != -1) { requireCurrent(op); output.write(buffer, 0, length); }
                    output.flush();
                }
                requireCurrent(op); saved = true;
                send(op.command, "saved", null, "", 0); finish(op, false);
            } catch (Exception error) { fail(op, error); }
            finally { if (!saved) try { DocumentsContract.deleteDocument(activity.getContentResolver(), target); } catch (Exception ignored) { /* Provider may refuse removal; never report saved. */ } }
        });
        return true;
    }
    private void fail(Operation op, Exception error) {
        if (active != op) { cleanup(op); return; }
        send(op.command, "error", null, error instanceof Failure ? error.getMessage() : "Dosya işlemi tamamlanamadı. Tekrar deneyebilirsin.", error instanceof Failure ? ((Failure) error).status : 0);
        stop(op, false);
    }
    private void send(Request request, String state, JSONObject extra, String message, int status) {
        if (request == null) return;
        main.post(() -> {
            if (!request.visible()) return;
            try {
                JSONObject payload = extra == null ? new JSONObject() : extra;
                boolean changed = state.matches("ready|received|saved|shareOpened") && !request.session();
                payload.put("protocolVersion", 1).put("id", request.id).put("accountId", request.account).put("state", changed ? "error" : state);
                if (changed || !message.isEmpty()) payload.put("message", changed ? "Hesap değişti. İşlem iptal edildi." : message);
                if (changed || status > 0) payload.put("httpStatus", changed ? 409 : status);
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) request.reply.postMessage(payload.toString());
            } catch (Exception ignored) { }
        });
    }
    private void stop(Operation op, boolean report) {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(() -> stop(op, report)); return; }
        if (op == null || active != op) return;
        if (report) send(op.command, "cancelled", null, "", 0);
        finish(op, false);
    }
    private void finish(Operation op, boolean keepShared) {
        // New requests are admitted on main. Release the old operation on that same
        // thread so a delayed IO completion cannot clear a newer active request.
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(() -> finish(op, keepShared)); return; }
        if (active != op) return;
        op.state.cancel(); active = null;
        if (op.timeout != null) main.removeCallbacks(op.timeout);
        if (op.sessionCheck != null) main.removeCallbacks(op.sessionCheck);
        if (op.connection != null) op.connection.disconnect();
        if (!keepShared) IO.execute(() -> cleanup(op));
    }
    private void cleanup(Operation op) {
        if (op.granted != null) activity.revokeUriPermission(op.granted, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        FileCache.remove(activity, "transfers", op.file);
    }
    private void clearShared() {
        ArrayList<Operation> old = new ArrayList<>(shared); shared.clear();
        IO.execute(() -> { for (Operation op : old) cleanup(op); });
    }
    private void deleteDocument(Uri target) {
        if (target == null || !"content".equals(target.getScheme()) || (activity.getPackageName() + ".files").equals(target.getAuthority())) return;
        IO.execute(() -> { try { DocumentsContract.deleteDocument(activity.getContentResolver(), target); } catch (Exception ignored) { } });
    }
}
