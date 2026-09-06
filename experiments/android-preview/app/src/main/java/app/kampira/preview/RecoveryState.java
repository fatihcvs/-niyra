package app.kampira.preview;

import java.net.URI;
import java.util.Objects;

/** Main-document recovery only. Fetch/API errors remain owned by the web application. */
public final class RecoveryState {
    public enum Phase { IDLE, LOADING, READY, FAILED }
    public enum Failure { NONE, CONNECTION, TIMEOUT, SERVER, NOT_FOUND, ACCESS, SECURITY, RENDERER, UNSUPPORTED }
    private final OriginPolicy origin;
    private String currentUrl;
    private String loadingUrl;
    private Phase phase = Phase.IDLE;
    private Failure failure = Failure.NONE;
    private long attempt;

    public RecoveryState(OriginPolicy origin, String restoredUrl) {
        this.origin = origin;
        currentUrl = origin.contains(restoredUrl) ? restoredUrl : origin.startUrl();
        loadingUrl = currentUrl;
    }
    public String url() { return currentUrl; }
    public Phase phase() { return phase; }
    public Failure failure() { return failure; }
    public long attempt() { return attempt; }
    public boolean busy() { return phase == Phase.LOADING; }
    public boolean canRetry() { return phase == Phase.FAILED && failure != Failure.UNSUPPORTED; }

    public boolean begin(String url) {
        if (!origin.contains(url)) return false;
        currentUrl = url;
        loadingUrl = url;
        phase = Phase.LOADING;
        failure = Failure.NONE;
        attempt++;
        return true;
    }
    /** SPA history changes do not start a new network request or erase its deadline. */
    public void remember(String url) { if (origin.contains(url)) currentUrl = url; }
    public boolean complete(String url) {
        if (phase != Phase.LOADING || !sameDocument(url, loadingUrl)) return false;
        phase = Phase.READY;
        return true;
    }
    public boolean fail(String url, Failure reason) {
        if (phase == Phase.FAILED || !origin.contains(url) || !sameDocument(url, loadingUrl)) return false;
        phase = Phase.FAILED;
        failure = reason;
        return true;
    }
    public boolean timeout(long expectedAttempt) {
        return busy() && attempt == expectedAttempt && fail(loadingUrl, Failure.TIMEOUT);
    }
    public boolean retry() { return canRetry() && begin(currentUrl); }
    public void unavailable(Failure reason) { phase = Phase.FAILED; failure = reason; attempt++; }
    public static Failure httpFailure(int status) {
        if (status == 404 || status == 410) return Failure.NOT_FOUND;
        if (status == 401 || status == 403) return Failure.ACCESS;
        return Failure.SERVER;
    }
    public static boolean sameDocument(String first, String second) {
        if (first == null || second == null) return false;
        try {
            URI a = URI.create(first), b = URI.create(second);
            return Objects.equals(a.getScheme(), b.getScheme()) && Objects.equals(a.getRawAuthority(), b.getRawAuthority())
                && Objects.equals(a.getRawPath(), b.getRawPath()) && Objects.equals(a.getRawQuery(), b.getRawQuery());
        } catch (IllegalArgumentException error) { return false; }
    }
}
