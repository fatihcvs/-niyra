package app.kampira.preview;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import java.util.HashMap;
import java.util.Map;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Actual store logic against a deterministic atomic preferences adapter; no Android/device claim. */
public class PushStoreTest {
    private Context context;
    private PushStore store;
    private final Map<String, Object> disk = new HashMap<>();
    @Before public void setUp() {
        context = mock(Context.class); SharedPreferences preferences = mock(SharedPreferences.class);
        when(context.getApplicationContext()).thenReturn(context);
        when(context.getSharedPreferences(anyString(), anyInt())).thenReturn(preferences);
        when(context.getSystemService(NotificationManager.class)).thenReturn(mock(NotificationManager.class));
        when(preferences.getString(anyString(), anyString())).thenAnswer(call -> disk.getOrDefault(call.getArgument(0), call.getArgument(1)));
        when(preferences.getLong(anyString(), anyLong())).thenAnswer(call -> disk.getOrDefault(call.getArgument(0), call.getArgument(1)));
        when(preferences.getBoolean(anyString(), anyBoolean())).thenAnswer(call -> disk.getOrDefault(call.getArgument(0), call.getArgument(1)));
        when(preferences.edit()).thenAnswer(ignored -> {
            SharedPreferences.Editor editor = mock(SharedPreferences.Editor.class); Map<String, Object> transaction = new HashMap<>();
            when(editor.putString(anyString(), anyString())).thenAnswer(call -> { transaction.put(call.getArgument(0), call.getArgument(1)); return editor; });
            when(editor.putLong(anyString(), anyLong())).thenAnswer(call -> { transaction.put(call.getArgument(0), call.getArgument(1)); return editor; });
            when(editor.putBoolean(anyString(), anyBoolean())).thenAnswer(call -> { transaction.put(call.getArgument(0), call.getArgument(1)); return editor; });
            when(editor.commit()).thenAnswer(call -> { disk.putAll(transaction); return true; });
            doAnswer(call -> { disk.putAll(transaction); return null; }).when(editor).apply();
            return editor;
        });
        store = new PushStore(context);
    }
    private String device(PushBinding binding, String suffix) { return PushPolicy.registrationDevice(binding.device, "token0123456789abcdefghijklmnopqrstuvwxyz" + suffix); }
    private PushBinding enroll(String owner, String session, String id) {
        PushBinding pending = store.begin(owner, session); String device = device(pending, "A");
        assertTrue(store.trackAttempt(pending, device)); assertTrue(store.commit(pending, id, device)); return store.read();
    }
    @Test public void unknownAcknowledgementSurvivesRecreationAndClear() throws Exception {
        PushBinding pending = store.begin("alice", "session-A"); String device = device(pending, "A");
        assertTrue(store.trackAttempt(pending, device)); assertEquals(0, store.pendingRevocations().length());
        store = new PushStore(context); store.clear();
        JSONArray queue = new PushStore(context).pendingRevocations();
        assertEquals(1, queue.length()); assertEquals(device, queue.getJSONObject(0).getString("deviceId"));
        assertFalse(store.read().enabled); assertFalse(store.commit(pending, "late-sub", device));
    }
    @Test public void failedRevocationRemainsTargetedAcrossRepeatedDisable() throws Exception {
        PushBinding binding = enroll("alice", "session-A", "sub-A"); store.clear();
        // 503/429 have no acknowledgement: do not forget. Retry survives another store instance.
        store = new PushStore(context); store.clear(); store.rememberRevocation(binding);
        assertEquals(1, store.pendingRevocations().length());
        JSONObject pending = store.pendingRevocations().getJSONObject(0); assertEquals("sub-A", pending.getString("id"));
        store.forgetRevocation(pending); assertEquals(0, new PushStore(context).pendingRevocations().length());
    }
    @Test public void lostAckReconcilesOnlyItsExactConsent() {
        PushBinding pending = store.begin("alice", "session-A"); String device = device(pending, "A");
        assertTrue(store.trackAttempt(pending, device));
        store = new PushStore(context); assertTrue(store.commit(pending, "canonical", device));
        assertTrue(store.read().enabled); assertEquals(0, store.pendingRevocations().length());
        assertFalse(store.commit(pending, "different-stale-id", device));
    }
    @Test public void oldTokenErrorCannotClearNewSubscription() {
        PushBinding old = enroll("alice", "session-A", "sub-old"); String nextDevice = device(old, "B");
        assertTrue(store.trackAttempt(old, nextDevice)); assertTrue(store.commit(old, "sub-new", nextDevice));
        store.clearIfCurrent(old); assertTrue(store.read().enabled); assertEquals("sub-new", store.read().subscription);
        store.clearIfCurrent(store.read()); assertFalse(store.read().enabled);
    }
    @Test public void tokenRotationRetiresOnlyPreviousSubscription() throws Exception {
        PushBinding old = enroll("alice", "session-A", "sub-old"); String nextDevice = device(old, "B");
        assertTrue(store.trackAttempt(old, nextDevice)); assertTrue(store.commit(old, "sub-new", nextDevice));
        JSONArray queue = store.pendingRevocations(); assertEquals(1, queue.length());
        assertEquals("sub-old", queue.getJSONObject(0).getString("id"));
        assertEquals("sub-new", new PushStore(context).read().subscription);
    }
    @Test public void lateOldConsentCannotOverwriteOrRetireCurrentConsent() throws Exception {
        PushBinding old = store.begin("alice", "session-A"); String oldDevice = device(old, "A"); assertTrue(store.trackAttempt(old, oldDevice));
        store.clear(); PushBinding current = enroll("bob", "session-B", "sub-current");
        assertFalse(store.commit(old, "late-old", oldDevice)); store.rememberRevocation(old.commit("late-old"));
        assertEquals("sub-current", store.read().subscription); assertTrue(store.read().sameRegistration(current));
        for (int i = 0; i < store.pendingRevocations().length(); i++) assertNotEquals("sub-current", store.pendingRevocations().getJSONObject(i).optString("id"));
    }
    @Test public void retiredUnknownAttemptCannotBeReused() {
        PushBinding old = store.begin("alice", "session-A"); String device = device(old, "A"); assertTrue(store.trackAttempt(old, device));
        store.clear(); assertFalse(store.trackAttempt(old, device));
        PushBinding fresh = store.begin("alice", "session-A"); assertNotEquals(device, device(fresh, "A"));
    }
    @Test public void reconciledCanonicalAckIsIdempotentButDifferentIdIsNot() {
        PushBinding old = store.begin("alice", "session-A"); String device = device(old, "A"); assertTrue(store.trackAttempt(old, device));
        assertTrue(store.commit(old, "canonical", device)); assertTrue(store.commit(old, "canonical", device));
        assertFalse(store.commit(old, "different", device)); assertEquals("canonical", store.read().subscription);
    }
    @Test public void authenticatedSessionTurnoverDoesNotExhaustRecoveryQueue() {
        for (int index = 0; index < 40; index++) {
            String session = "confirmed-session-" + index;
            // Called only after current cookie passed the normal account-context API.
            store.pruneObsoleteSessions(session);
            PushBinding pending = store.begin("alice", session); String device = device(pending, "A");
            assertTrue("session " + index + " remains enrollable", store.trackAttempt(pending, device));
            store.clear(); store = new PushStore(context);
            assertEquals(1, store.pendingRevocations().length());
        }
        store.pruneObsoleteSessions(""); assertEquals(1, store.pendingRevocations().length());
        store.pruneObsoleteSessions("confirmed-next-session"); assertEquals(0, store.pendingRevocations().length());
    }
}
