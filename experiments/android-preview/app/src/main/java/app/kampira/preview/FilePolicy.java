package app.kampira.preview;

import java.net.URI;
import java.net.URLDecoder;
import java.util.Locale;

/** Strict, independently testable policy for explicit native file actions. */
public final class FilePolicy {
    public static final long NOTE_LIMIT = 15L * 1024 * 1024;
    public static final long BLOB_LIMIT = 20L * 1024 * 1024;
    public static final int CHUNK_LIMIT = 49152;
    private FilePolicy() { }
    public static String noteUrl(OriginPolicy origin, String value) {
        if (value == null || value.length() > 2048 || value.contains("\\") || value.matches("(?s).*[\\x00-\\x20\\x7f].*")) return null;
        try {
            URI uri = new URI(origin.startUrl()).resolve(value);
            if (!origin.contains(uri.toString()) || !"/api/notes/file".equals(uri.getRawPath()) || uri.getRawFragment() != null) return null;
            String query = uri.getRawQuery(); String id = null; boolean download = false;
            if (query == null) return null;
            for (String item : query.split("&", -1)) {
                String[] pair = item.split("=", -1);
                if (pair.length != 2) return null;
                if (pair[0].equals("id") && id == null && PushPolicy.id(pair[1])) id = pair[1];
                else if (pair[0].equals("download") && !download && pair[1].equals("1")) download = true;
                else return null;
            }
            return id == null ? null : origin.startUrl() + "api/notes/file?id=" + id + "&download=1";
        } catch (Exception ignored) { return null; }
    }
    public static String shareUrl(OriginPolicy origin, String value) {
        if (value == null) return null;
        try {
            URI uri = new URI(origin.startUrl()).resolve(value);
            if (!origin.contains(uri.toString())) return null;
            return PushPolicy.safeHref(origin, uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery()) + (uri.getRawFragment() == null ? "" : "#" + uri.getRawFragment()));
        } catch (Exception ignored) { return null; }
    }
    public static String mime(String value) { return value == null ? "" : value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT); }
    public static boolean noteMime(String value) { return mime(value).matches("application/pdf|image/jpeg|image/png|image/webp|application/vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document"); }
    public static boolean blobMime(String value) { return noteMime(value) || mime(value).matches("text/plain|text/csv|application/json|video/mp4|video/webm"); }
    public static boolean action(String value) { return "save".equals(value) || "share".equals(value); }
    public static boolean base64Chunk(String value) {
        // A linear scan avoids regex recursion for full 64KiB bridge messages.
        if (value == null || value.isEmpty() || value.length() > 65536 || value.length() % 4 != 0) return false;
        int end = value.length(); int padding = 0;
        while (end > 0 && value.charAt(end - 1) == '=') { end--; padding++; }
        if (padding > 2 || end == 0) return false;
        for (int i = 0; i < end; i++) { char c = value.charAt(i); if (!(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/')) return false; }
        return true;
    }
    public static String name(String value, String mime) {
        String extension = switch (mime(mime)) {
            case "application/pdf" -> ".pdf"; case "image/jpeg" -> ".jpg"; case "image/png" -> ".png"; case "image/webp" -> ".webp";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> ".docx";
            case "application/json" -> ".json"; case "text/csv" -> ".csv"; case "video/mp4" -> ".mp4"; case "video/webm" -> ".webm"; default -> ".txt";
        };
        String safe = value == null ? "" : value.replaceAll("[\\p{Cntrl}\\p{Cf}\\p{Cs}\\\\/:*?\"<>|]", "_").replaceAll("^[.\\s]+|[.\\s]+$", "");
        if (safe.length() > 120) safe = safe.substring(0, 120).replaceAll("[\\p{Cs}]", "_");
        if (safe.isEmpty()) safe = "kampira";
        if (!safe.toLowerCase(Locale.ROOT).endsWith(extension)) safe = safe.replaceAll("\\.[A-Za-z0-9]{1,8}$", "") + extension;
        return safe;
    }
    public static String dispositionName(String disposition, String mime) {
        String fallback = null;
        if (disposition != null && disposition.length() <= 2048) for (String item : disposition.split(";")) {
            String part = item.trim();
            if (part.toLowerCase(Locale.ROOT).startsWith("filename*=utf-8''")) {
                try { return name(URLDecoder.decode(part.substring(17).replace("+", "%2B"), "UTF-8"), mime); }
                catch (Exception ignored) { /* Use the safe ASCII fallback. */ }
            }
            if (part.toLowerCase(Locale.ROOT).startsWith("filename=")) { fallback = part.substring(9); if (fallback.startsWith("\"") && fallback.endsWith("\"") && fallback.length() >= 2) fallback = fallback.substring(1, fallback.length() - 1); }
        }
        return name(fallback, mime);
    }
}
