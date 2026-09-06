package app.kampira.preview;

/** Scenario checks for leases reloaded after process death and delayed asynchronous work. */
public final class PushBindingTest {
    private static int checks;
    private static void check(boolean condition, String label) { checks++; if (!condition) throw new AssertionError(label); }
    public static void main(String[] args) {
        PushBinding fresh = new PushBinding(0, "", "", "device-1234", "", false);
        check(!fresh.accepts(0, "alice", "sub1", "sessionA"), "fresh install cannot display or enroll automatically");
        PushBinding pending = fresh.begin("alice", "sessionA");
        check(!pending.accepts(pending.epoch, "alice", "sub1", "sessionA"), "token/preflight without acknowledged subscription cannot display");
        PushBinding enabled = pending.commit("sub1");
        check(enabled.accepts(enabled.epoch, "alice", "sub1", "sessionA"), "verified current receipt may display");
        PushBinding restarted = new PushBinding(enabled.epoch, enabled.account, enabled.subscription, enabled.device, enabled.session, enabled.enabled);
        check(restarted.accepts(enabled.epoch, "alice", "sub1", "sessionA"), "persisted same lease works after process recreation");
        check(!restarted.accepts(enabled.epoch, "alice", "sub1", ""), "missing browser cookie fails closed in background");
        check(!restarted.accepts(enabled.epoch, "alice", "sub1", "sessionB"), "same account in new session rejects queued old receipt");
        check(!restarted.accepts(enabled.epoch, "bob", "sub1", "sessionA"), "wrong-account payload rejected before receipt I/O");
        check(!restarted.accepts(enabled.epoch, "alice", "sub-other", "sessionA"), "different subscription generation rejected");
        PushBinding cleared = restarted.clear();
        check(!cleared.sameLease(pending), "POST response delayed past logout cannot commit");
        check(!cleared.accepts(enabled.epoch, "alice", "sub1", "sessionA"), "receipt delayed past logout cannot resurrect visible notification");
        check(cleared.device.equals(enabled.device) && !cleared.enabled && cleared.account.isEmpty(), "clear retains only installation id");
        PushBinding bob = cleared.begin("bob", "sessionB").commit("sub2");
        check(!bob.sameLease(pending) && !bob.accepts(enabled.epoch, "alice", "sub1", "sessionB"), "account switch rejects old async registration and tap");
        PushBinding aliceAgain = bob.clear().begin("alice", "sessionA").commit("sub1");
        check(!aliceAgain.accepts(enabled.epoch, "alice", "sub1", "sessionA"), "same IDs after opt-out/re-enroll cannot revive old PendingIntent");
        PushBinding rotated = enabled.commit("sub-rotated");
        check(rotated.sameLease(enabled), "token refresh belongs to same consent lease");
        check(!rotated.sameRegistration(enabled), "stale status/token ACK cannot overwrite a newer canonical subscription");
        check(!rotated.accepts(enabled.epoch, "alice", "sub1", "sessionA"), "old subscription receipt rejected after token rotation");
        check(rotated.accepts(enabled.epoch, "alice", "sub-rotated", "sessionA"), "new exact subscription receipt accepted after rotation");
        String token1 = "firstToken0123456789abcdefghijklmnopqrstuvwxyz", token2 = "secondToken0123456789abcdefghijklmnopqrstuvwxyz";
        String firstDevice = PushPolicy.registrationDevice(enabled.device, token1);
        check(firstDevice.equals(PushPolicy.registrationDevice(enabled.device, token1)), "same token attempt can retry its exact server identity after lost response");
        String rotatedDevice = PushPolicy.registrationDevice(enabled.device, token2);
        String newConsentDevice = PushPolicy.registrationDevice(aliceAgain.device, token1);
        check(!firstDevice.equals(rotatedDevice), "delayed previous token cannot replace the new token server row");
        check(!firstDevice.equals(newConsentDevice), "disable then enable creates a distinct immutable server identity even with the same token");
        java.util.Map<String, String> serverRows = new java.util.HashMap<>();
        serverRows.put(newConsentDevice, "new-subscription"); serverRows.put(firstDevice, "late-old-subscription"); serverRows.remove(firstDevice);
        check("new-subscription".equals(serverRows.get(newConsentDevice)), "late old commit plus exact cleanup preserves the current registration");
        check(firstDevice.length() <= 128 && !firstDevice.contains(token1), "server device generation is bounded and contains no token");
        for (int transientStatus : new int[]{408, 429, 500, 503}) check(PushPolicy.retryableHttp(transientStatus), "transient receipt status is retried by durable worker: " + transientStatus);
        for (int terminalStatus : new int[]{200, 401, 403, 404, 409, 410}) check(!PushPolicy.retryableHttp(terminalStatus), "terminal/account receipt status cannot cause background retry loop: " + terminalStatus);
        OriginPolicy origin = new OriginPolicy("http://192.168.0.4:5173");
        check(PushPolicy.safeHref(origin, "/?view=messages&conversation=dm-123").equals(origin.startUrl() + "?view=messages&conversation=dm-123"), "real DM route survives strict parser");
        check(PushPolicy.safeHref(origin, "/?view=campus&event=event-1") != null, "campus event remains reachable");
        check(PushPolicy.safeHref(origin, "/?view=communities&communityEvent=event-1") != null, "community event remains reachable");
        check((origin.startUrl() + "?view=match&meetup=meetup-1").equals(PushPolicy.safeHref(origin, "/?view=match&meetup=meetup-1")), "exact meetup route survives the installed native policy");
        check(PushPolicy.safeHref(origin, "/?view=match&meetup=one&meetup=two") == null, "ambiguous meetup targets are rejected");
        check(PushPolicy.safeHref(origin, "/?view=match&meetup=%0a") == null, "malformed meetup target is rejected");
        for (String unsafe : new String[]{"https://evil.example/", "//evil.example/", "/\\evil.example/", "/api/auth/logout", "/?redirect=https://evil.example", "/?view=messages&view=feed", "/?view=unknown", "/?post=ok#private", "/?post=%0a", "/?post=good&", "/?post=a=b", "/?post=hello world"}) check(PushPolicy.safeHref(origin, unsafe) == null, "unsafe/ambiguous notification target rejected: " + unsafe);
        check(!PushPolicy.command("eval") && !PushPolicy.command("getCookie") && !PushPolicy.command("getToken"), "bridge has no native credential/JS execution command");
        System.out.println("PushBinding scenario checks passed: " + checks + "; JVM only, no Android/provider delivery implied.");
    }
}
