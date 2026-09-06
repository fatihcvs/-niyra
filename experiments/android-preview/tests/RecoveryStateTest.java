package app.kampira.preview;

public final class RecoveryStateTest {
    private static int checks;
    private static void check(boolean condition, String label) { checks++; if (!condition) throw new AssertionError(label); }
    public static void main(String[] args) {
        OriginPolicy origin = new OriginPolicy("http://192.168.0.4:5173");
        String home = origin.startUrl();
        String notes = home + "?view=notes";
        String messages = home + "?view=messages";
        RecoveryState state = new RecoveryState(origin, notes);
        check(state.url().equals(notes), "restore the last safe route instead of always home");
        check(new RecoveryState(origin, "https://evil.example/").url().equals(home), "reject foreign restored origin");
        check(new RecoveryState(origin, "javascript:alert(1)").url().equals(home), "reject script restored URI");
        check(!state.begin("http://192.168.0.4:5174/"), "reject wrong-port navigation");
        state.begin(home);
        long first = state.attempt();
        state.remember(notes);
        check(state.busy() && state.attempt() == first, "SPA history cannot reset the network deadline");
        check(state.complete(home), "the requested document may finish after SPA history changes");
        check(state.url().equals(notes), "SPA route remains the retry and saved-state target");
        check(!state.timeout(first), "finished navigation ignores old timeout");
        state.unavailable(RecoveryState.Failure.RENDERER);
        check(state.url().equals(notes) && state.canRetry(), "renderer loss retains most recent SPA route");
        check(state.retry(), "one explicit retry starts");
        check(!state.retry(), "repeated taps cannot start parallel retries");
        long second = state.attempt();
        check(!state.timeout(first), "old attempt timer cannot fail a new retry");
        check(state.timeout(second), "a stuck main-document load becomes recoverable");
        check(!state.complete(notes), "late page-finished cannot uncover the browser error page");
        check(!state.fail(notes, RecoveryState.Failure.CONNECTION) && state.failure() == RecoveryState.Failure.TIMEOUT, "first useful failure survives follow-up callbacks");
        check(state.retry(), "a timed-out navigation can be retried explicitly");
        state.begin(messages);
        check(!state.fail(notes, RecoveryState.Failure.CONNECTION), "old route errors do not hide a new route");
        check(!state.complete(notes), "old route completion cannot dismiss current loading");
        check(state.complete(messages + "#latest"), "fragment-only changes refer to the same main document");
        state.remember("file:///private");
        check(state.url().equals(messages), "invalid history URI cannot replace the saved route");
        state.begin(messages);
        check(state.fail(messages, RecoveryState.Failure.SECURITY), "TLS error becomes a closed error state");
        check(state.failure() == RecoveryState.Failure.SECURITY, "no TLS proceed state exists");
        state.unavailable(RecoveryState.Failure.UNSUPPORTED);
        check(!state.canRetry() && !state.retry(), "unsupported API/origin has no dead retry loop");
        check(RecoveryState.httpFailure(503) == RecoveryState.Failure.SERVER, "server failure classification");
        check(RecoveryState.httpFailure(404) == RecoveryState.Failure.NOT_FOUND, "missing page classification");
        check(RecoveryState.httpFailure(410) == RecoveryState.Failure.NOT_FOUND, "removed page classification");
        check(RecoveryState.httpFailure(401) == RecoveryState.Failure.ACCESS, "auth status is not reported as offline");
        check(RecoveryState.httpFailure(403) == RecoveryState.Failure.ACCESS, "permission status is not reported as offline");
        System.out.println("RecoveryState checks passed: " + checks + "; no Android device or WebView execution implied.");
    }
}
