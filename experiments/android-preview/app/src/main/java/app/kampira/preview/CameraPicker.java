package app.kampira.preview;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/** Uses the installed camera app, never an automatic camera/storage permission request. */
final class CameraPicker {
    private static final AtomicInteger CODES = new AtomicInteger(31000);
    private final Activity activity;
    private final WebView web;
    private final OriginPolicy origin = new OriginPolicy(BuildConfig.PREVIEW_ORIGIN);
    private final Handler main = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> callback;
    private String session;
    private String[] types;
    private boolean multiple;
    private int pickerCode, cameraCode;
    private File cameraFile;
    private Uri cameraUri;
    private AlertDialog choice;
    private Runnable expiry;
    CameraPicker(Activity activity, WebView web) { this.activity = activity; this.web = web; FileCache.clean(activity, "camera", 60 * 60_000L); }
    boolean show(ValueCallback<Uri[]> result, WebChromeClient.FileChooserParams params) {
        cancel();
        if (!origin.contains(web.getUrl()) || params.getMode() == WebChromeClient.FileChooserParams.MODE_SAVE || PushHttp.fingerprint(PushHttp.cookie()).isEmpty()) { result.onReceiveValue(null); return true; }
        callback = result; session = PushHttp.fingerprint(PushHttp.cookie()); types = accepted(params.getAcceptTypes()); multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        if (types.length == 0) { cancel(); toast("Bu dosya türü desteklenmiyor."); return true; }
        expiry = new Runnable() { final long started = System.currentTimeMillis(); @Override public void run() {
            if (callback == null) return;
            if (!current() || System.currentTimeMillis() - started > 300_000) cancel(); else main.postDelayed(this, 500);
        } }; main.postDelayed(expiry, 500);
        boolean camera = false;
        for (String type : types) if (type.equals("image/*") || type.equals("image/jpeg")) camera = true;
        camera = camera && new Intent(MediaStore.ACTION_IMAGE_CAPTURE).resolveActivity(activity.getPackageManager()) != null;
        if (camera) {
            choice = new AlertDialog.Builder(activity).setTitle("Fotoğraf ekle").setItems(new String[]{"Fotoğraf çek", "Dosya seç"}, (dialog, index) -> { choice = null; if (index == 0) capture(); else pick(); }).setOnCancelListener(dialog -> cancel()).create();
            choice.show();
        } else pick();
        return true;
    }
    private boolean current() { return callback != null && origin.contains(web.getUrl()) && session != null && session.equals(PushHttp.fingerprint(PushHttp.cookie())); }
    private int code() { int value = CODES.getAndIncrement(); if (value > 60000) throw new IllegalStateException("Restart picker"); return value; }
    private void pick() {
        if (!current()) { cancel(); return; }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(types.length == 1 ? types[0] : "*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple).putExtra(Intent.EXTRA_MIME_TYPES, types).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { pickerCode = code(); activity.startActivityForResult(intent, pickerCode); } catch (Exception error) { cancel(); toast("Dosya seçici açılamadı. Yeniden deneyebilirsin."); }
    }
    private void capture() {
        if (!current()) { cancel(); return; }
        try {
            cameraFile = FileCache.create(activity, "camera", ".jpg");
            cameraUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", cameraFile);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraUri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.setClipData(ClipData.newUri(activity.getContentResolver(), "Kampira fotoğraf", cameraUri));
            cameraCode = code(); activity.startActivityForResult(intent, cameraCode);
        } catch (Exception error) { cancel(); toast("Kamera açılamadı. Dosya seçeneğini deneyebilirsin."); }
    }
    boolean activityResult(int code, int result, Intent data) {
        if (code != pickerCode && code != cameraCode) return code >= 31000 && code <= 60000;
        if (!current() || result != Activity.RESULT_OK) { cancel(); return true; }
        ArrayList<Uri> selected = new ArrayList<>();
        if (code == cameraCode) {
            if (cameraFile != null && cameraFile.length() > 0 && cameraFile.length() <= FilePolicy.BLOB_LIMIT) {
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeFile(cameraFile.getAbsolutePath(), bounds);
                if ("image/jpeg".equals(bounds.outMimeType) && bounds.outWidth > 0 && bounds.outHeight > 0 && (long) bounds.outWidth * bounds.outHeight <= 100_000_000L) selected.add(cameraUri);
            }
            if (selected.isEmpty()) { cancel(); toast("Fotoğraf okunamadı veya çok büyük. Yeniden deneyebilirsin."); return true; }
            activity.revokeUriPermission(cameraUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // WebView receives this exact URI through its normal file-upload callback;
            // keep bytes for the asynchronous upload, cleaned after one hour.
            cameraFile = null; cameraUri = null;
        } else if (data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) for (int index = 0; index < clip.getItemCount() && index < (multiple ? 10 : 1); index++) { Uri uri = clip.getItemAt(index).getUri(); if (valid(uri)) selected.add(uri); }
            else if (valid(data.getData())) selected.add(data.getData());
        }
        ValueCallback<Uri[]> resultCallback = callback; callback = null; reset();
        resultCallback.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0])); return true;
    }
    private boolean valid(Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme()) || uri.getAuthority() == null || uri.getAuthority().startsWith(activity.getPackageName())) return false;
        if (activity.checkUriPermission(uri, Process.myPid(), Process.myUid(), Intent.FLAG_GRANT_READ_URI_PERMISSION) != PackageManager.PERMISSION_GRANTED) return false;
        try { String mime = activity.getContentResolver().getType(uri); if (mime == null) return false; for (String type : types) if (type.equals(mime) || type.endsWith("/*") && mime.startsWith(type.substring(0, type.length() - 1))) return true; }
        catch (SecurityException ignored) { }
        return false;
    }
    void cancel() { ValueCallback<Uri[]> result = callback; callback = null; reset(); if (result != null) result.onReceiveValue(null); }
    private void reset() {
        if (expiry != null) main.removeCallbacks(expiry); expiry = null;
        if (choice != null) { choice.setOnCancelListener(null); choice.dismiss(); choice = null; }
        if (cameraUri != null) activity.revokeUriPermission(cameraUri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        FileCache.remove(activity, "camera", cameraFile); cameraFile = null; cameraUri = null;
        pickerCode = 0; cameraCode = 0;
    }
    private void toast(String text) { Toast.makeText(activity, text, Toast.LENGTH_LONG).show(); }
    static String[] accepted(String[] requested) {
        Set<String> types = new LinkedHashSet<>(); boolean unrestricted = requested == null || requested.length == 0;
        if (requested != null) for (String accept : requested) if (accept != null) for (String item : accept.split(",")) {
            String type = item.trim().toLowerCase(Locale.ROOT);
            if (type.isEmpty() || type.equals("*/*")) { unrestricted = true; continue; }
            if (type.startsWith(".")) type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
            if (type != null && (FilePolicy.blobMime(type) || type.equals("image/*") || type.equals("video/*") || type.equals("application/msword"))) types.add(type);
        }
        if (types.isEmpty() && unrestricted) { types.add("image/*"); types.add("video/*"); types.add("application/pdf"); types.add("text/plain"); types.add("application/msword"); types.add("application/vnd.openxmlformats-officedocument.wordprocessingml.document"); }
        return types.toArray(new String[0]);
    }
}
