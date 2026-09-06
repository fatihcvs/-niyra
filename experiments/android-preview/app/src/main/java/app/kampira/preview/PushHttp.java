package app.kampira.preview;

import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** All credential use stays native and same-origin. No redirects, logging, or JS exposure. */
final class PushHttp {
    static final String ORIGIN = BuildConfig.PREVIEW_ORIGIN;
    static final class Reply {
        final int status; final JSONObject body;
        Reply(int status, JSONObject body) { this.status = status; this.body = body; }
        boolean ok() { return status >= 200 && status < 300; }
    }
    static String cookie() { String value = CookieManager.getInstance().getCookie(ORIGIN + "/"); return value == null ? "" : value; }
    static String fingerprint(String cookie) {
        try {
            String session = "";
            for (String item : cookie.split(";")) if (item.trim().startsWith("uniyra_session=")) session = item.trim();
            if (session.isEmpty()) return "";
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(session.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(); for (byte value : bytes) hex.append(String.format(java.util.Locale.ROOT, "%02x", value)); return hex.toString();
        } catch (Exception ignored) { return ""; }
    }
    static Reply call(String method, String query, String account, String cookie, JSONObject body) throws Exception {
        if (!PushPolicy.id(account) || fingerprint(cookie).isEmpty()) return new Reply(401, new JSONObject());
        if (!(query.isEmpty() || query.matches("\\?notificationId=[A-Za-z0-9._:-]{1,80}&subscriptionId=[A-Za-z0-9._:-]{1,80}(&purpose=click)?"))) throw new IllegalArgumentException("Invalid receipt query");
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + "/api/push-subscriptions" + query).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(4000); connection.setReadTimeout(6000);
        connection.setRequestMethod(method); connection.setUseCaches(false);
        connection.setRequestProperty("Cookie", cookie); connection.setRequestProperty("X-Account-Context", account);
        connection.setRequestProperty("Origin", ORIGIN); connection.setRequestProperty("Accept", "application/json");
        try {
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) return new Reply(status, new JSONObject());
            InputStream input = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            if (input == null) return new Reply(status, new JSONObject());
            try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = stream.read(buffer)) != -1) { if (output.size() + count > 32768) throw new IllegalStateException("Push response too large"); output.write(buffer, 0, count); }
                return new Reply(status, new JSONObject(output.toString("UTF-8")));
            }
        } finally { connection.disconnect(); }
    }
    static JSONObject receipt(PushBinding binding, String notification, String cookie) throws Exception {
        return receipt(binding, notification, cookie, false);
    }
    static JSONObject receipt(PushBinding binding, String notification, String cookie, boolean click) throws Exception {
        if (!PushPolicy.id(notification)) return null;
        Reply reply = call("GET", "?notificationId=" + notification + "&subscriptionId=" + binding.subscription + (click ? "&purpose=click" : ""), binding.account, cookie, null);
        if (PushPolicy.retryableHttp(reply.status)) throw new java.io.IOException("Temporary push receipt failure");
        if (!reply.ok()) return null;
        JSONObject receipt = reply.body.optJSONObject("receipt");
        if (receipt == null || receipt.optInt("v") != 1 || !binding.account.equals(receipt.optString("accountId")) || !binding.subscription.equals(receipt.optString("subscriptionId")) || !notification.equals(receipt.optString("notificationId"))) return null;
        return receipt;
    }
}
