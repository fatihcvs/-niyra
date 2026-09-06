package app.kampira.preview;

import java.net.URI;
import java.util.HashSet;
import java.util.Set;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Data from FCM/intents never decides where to navigate or what private content to show. */
public final class PushPolicy {
    private PushPolicy() { }
    public static boolean id(String value) { return value != null && value.matches("[A-Za-z0-9._:-]{1,80}"); }
    public static boolean command(String value) { return "status".equals(value) || "enable".equals(value) || "disable".equals(value) || "clear".equals(value); }
    public static String registrationDevice(String consentNonce, String token) {
        if (!id(consentNonce) || token == null || !token.matches("[A-Za-z0-9:_-]{32,4096}")) throw new IllegalArgumentException("Invalid native registration identity");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder suffix = new StringBuilder();
            for (int index = 0; index < 16; index++) suffix.append(String.format(java.util.Locale.ROOT, "%02x", digest[index]));
            return consentNonce + ":" + suffix;
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    public static boolean retryableHttp(int status) { return status == 408 || status == 429 || status >= 500; }
    public static String safeHref(OriginPolicy origin, String href) {
        if (href == null || href.length() > 2048 || !href.startsWith("/") || href.startsWith("//") || href.contains("\\") || href.matches("(?s).*[\\x00-\\x20\\x7f].*")) return null;
        try {
            URI route = new URI(href);
            // Notifications only link to the root SPA, never API/media or arbitrary URL schemes.
            if (!"/".equals(route.getRawPath()) || route.getRawAuthority() != null || route.getScheme() != null || route.getRawFragment() != null) return null;
            Set<String> seen = new HashSet<>();
            String query = route.getRawQuery();
            if (query != null) for (String item : query.split("&", -1)) {
                String[] parts = item.split("=", -1);
                if (parts.length != 2 || !seen.add(parts[0])) return null;
                if (parts[0].equals("view")) {
                    if (!parts[1].matches("feed|discover|messages|pulse|match|campus|library|market|notes|communities|notifications|saved|safety|settings|profile")) return null;
                } else if (!parts[0].matches("post|comment|profile|conversation|message|listing|event|note|community|communityEvent|meetup") || !id(parts[1])) return null;
            }
            String target = new URI(origin.startUrl()).resolve(route).toString();
            return origin.contains(target) ? target : null;
        } catch (Exception ignored) { return null; }
    }
}
