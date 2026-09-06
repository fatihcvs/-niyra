package app.kampira.preview;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

final class PushStore {
    static final Object LOCK = new Object();
    private final SharedPreferences prefs;
    private final Context context;
    PushStore(Context context) { this.context = context.getApplicationContext(); prefs = this.context.getSharedPreferences("kampira.push.v1", Context.MODE_PRIVATE); }
    PushBinding read() {
        synchronized (LOCK) {
            String device = prefs.getString("device", "");
            if (device.isEmpty()) { device = UUID.randomUUID().toString(); if (!prefs.edit().putString("device", device).commit()) throw new IllegalStateException("Push device unavailable"); }
            return new PushBinding(prefs.getLong("epoch", 0), prefs.getString("account", ""), prefs.getString("subscription", ""), device, prefs.getString("session", ""), prefs.getBoolean("enabled", false));
        }
    }
    private void save(PushBinding state, JSONArray entries) {
        if (!prefs.edit().putLong("epoch", state.epoch).putString("account", state.account).putString("subscription", state.subscription)
                .putString("device", state.device).putString("session", state.session).putBoolean("enabled", state.enabled).putString("attempts", entries.toString()).commit()) throw new IllegalStateException("Push state unavailable");
    }
    PushBinding clear() {
        synchronized (LOCK) {
            PushBinding old = read(); save(old.clear(), retiredRecords(old));
            context.getSystemService(NotificationManager.class).cancelAll();
            return old;
        }
    }
    PushBinding begin(String account, String session) {
        synchronized (LOCK) { PushBinding old = read(); PushBinding next = old.begin(account, session); save(next, retiredRecords(old)); context.getSystemService(NotificationManager.class).cancelAll(); return next; }
    }
    boolean commit(PushBinding lease, String subscription, String serverDevice) {
        synchronized (LOCK) {
            PushBinding current = read();
            if (!PushPolicy.id(subscription) || !(current.sameRegistration(lease) || current.sameLease(lease) && current.enabled && current.subscription.equals(subscription))) return false;
            JSONArray entries = records(), next = new JSONArray();
            for (int index = 0; index < entries.length(); index++) {
                JSONObject entry = entries.optJSONObject(index);
                if (entry == null) continue;
                if (lease.account.equals(entry.optString("account")) && lease.session.equals(entry.optString("session")) && serverDevice.equals(entry.optString("deviceId"))) continue;
                try { if (lease.account.equals(entry.optString("account")) && lease.session.equals(entry.optString("session"))) entry.put("revoke", true); } catch (Exception ignored) { }
                next.put(entry);
            }
            if (PushPolicy.id(current.subscription) && !current.subscription.equals(subscription)) appendUnique(next, record(current, "", true));
            save(lease.commit(subscription), next); return true;
        }
    }
    void clearIfCurrent(PushBinding lease) { synchronized (LOCK) { if (read().sameRegistration(lease)) clear(); } }
    void pruneObsoleteSessions(String authenticatedFingerprint) {
        if (authenticatedFingerprint.isEmpty()) return;
        synchronized (LOCK) { if (!read().session.isEmpty() && !authenticatedFingerprint.equals(read().session)) return; JSONArray entries = records(), current = new JSONArray(); for (int i = 0; i < entries.length(); i++) { JSONObject entry = entries.optJSONObject(i); if (entry != null && authenticatedFingerprint.equals(entry.optString("session"))) current.put(entry); } saveRecords(current); }
    }
    private JSONArray records() { try { return new JSONArray(prefs.getString("attempts", "[]")); } catch (Exception error) { throw new IllegalStateException("Push recovery unavailable"); } }
    private void saveRecords(JSONArray entries) { if (!prefs.edit().putString("attempts", entries.toString()).commit()) throw new IllegalStateException("Push recovery unavailable"); }
    private JSONObject record(PushBinding binding, String device, boolean revoke) {
        try { return new JSONObject().put("account", binding.account).put("session", binding.session).put("id", device.isEmpty() ? binding.subscription : "").put("deviceId", device).put("revoke", revoke); }
        catch (Exception error) { throw new IllegalStateException("Push recovery unavailable"); }
    }
    private JSONArray retiredRecords(PushBinding old) {
        JSONArray entries = records();
        for (int index = 0; index < entries.length(); index++) try { entries.getJSONObject(index).put("revoke", true); } catch (Exception ignored) { }
        if (PushPolicy.id(old.account) && PushPolicy.id(old.subscription)) appendUnique(entries, record(old, "", true));
        return entries;
    }
    boolean trackAttempt(PushBinding lease, String serverDevice) {
        synchronized (LOCK) {
            if (!read().sameRegistration(lease)) return false;
            JSONArray entries = records();
            for (int index = 0; index < entries.length(); index++) {
                JSONObject entry = entries.optJSONObject(index);
                if (entry != null && serverDevice.equals(entry.optString("deviceId")) && lease.session.equals(entry.optString("session"))) return !entry.optBoolean("revoke");
            }
            if (entries.length() >= 32) return false;
            entries.put(record(lease, serverDevice, false)); saveRecords(entries); return true;
        }
    }
    private void appendUnique(JSONArray entries, JSONObject entry) { for (int i = 0; i < entries.length(); i++) if (entry.toString().equals(entries.optJSONObject(i).toString())) return; entries.put(entry); }
    void rememberRevocation(PushBinding binding) { synchronized (LOCK) { if (PushPolicy.id(binding.account) && PushPolicy.id(binding.subscription)) { JSONArray entries = records(); appendUnique(entries, record(binding, "", true)); saveRecords(entries); } } }
    JSONArray pendingRevocations() { synchronized (LOCK) { JSONArray pending = new JSONArray(), entries = records(); for (int i = 0; i < entries.length(); i++) { JSONObject entry = entries.optJSONObject(i); if (entry != null && entry.optBoolean("revoke")) pending.put(entry); } return pending; } }
    void forgetRevocation(JSONObject removed) {
        synchronized (LOCK) { JSONArray entries = records(), next = new JSONArray(); for (int i = 0; i < entries.length(); i++) { JSONObject entry = entries.optJSONObject(i); if (entry != null && !entry.toString().equals(removed.toString())) next.put(entry); } saveRecords(next); }
    }
    boolean permissionAsked() { return prefs.getBoolean("permissionAsked", false); }
    void askedPermission() { prefs.edit().putBoolean("permissionAsked", true).apply(); }
}
