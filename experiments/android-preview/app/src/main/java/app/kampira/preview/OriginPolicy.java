package app.kampira.preview;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Exact origin comparison, independent of Android APIs so it can be tested before SDK installation. */
public final class OriginPolicy {
    private final URI origin;
    public OriginPolicy(String value) {
        try {
            origin = new URI(value);
            String scheme = origin.getScheme();
            String host = origin.getHost();
            String path = origin.getRawPath();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) || host == null || !host.matches("[a-zA-Z0-9.-]+") || origin.getRawUserInfo() != null || origin.getRawQuery() != null || origin.getRawFragment() != null || !(path == null || path.isEmpty() || "/".equals(path)) || origin.getPort() == 0 || origin.getPort() < -1 || origin.getPort() > 65535) throw new IllegalArgumentException("An exact HTTP(S) origin is required");
            if ("http".equalsIgnoreCase(scheme) && !isPrivateIpv4(host)) throw new IllegalArgumentException("HTTP preview requires a private/loopback IPv4 host");
        } catch (URISyntaxException error) { throw new IllegalArgumentException("Invalid preview origin", error); }
    }
    private static boolean isPrivateIpv4(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] bytes = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("[0-9]{1,3}")) return false;
            bytes[i] = Integer.parseInt(parts[i]);
            if (bytes[i] > 255) return false;
        }
        return bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31);
    }
    private static int port(URI uri) { return uri.getPort() != -1 ? uri.getPort() : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80; }
    public boolean contains(String value) {
        if (value == null) return false;
        try {
            URI candidate = new URI(value);
            return candidate.getRawUserInfo() == null && candidate.getHost() != null && origin.getScheme().equalsIgnoreCase(candidate.getScheme()) && origin.getHost().equalsIgnoreCase(candidate.getHost()) && port(origin) == port(candidate);
        } catch (URISyntaxException error) { return false; }
    }
    public boolean isHttp() { return "http".equalsIgnoreCase(origin.getScheme()); }
    public String startUrl() { return origin.toString().replaceAll("/+$", "") + "/"; }
}
