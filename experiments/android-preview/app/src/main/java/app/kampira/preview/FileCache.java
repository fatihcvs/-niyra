package app.kampira.preview;

import android.content.Context;
import java.io.File;
import java.io.IOException;

/** Only these two private cache subdirectories are exposed by FileProvider. */
final class FileCache {
    private FileCache() { }
    static File directory(Context context, String kind) throws IOException {
        if (!kind.equals("camera") && !kind.equals("transfers")) throw new IOException("Invalid cache kind");
        File root = context.getCacheDir().getCanonicalFile();
        File dir = new File(root, "kampira-" + kind).getCanonicalFile();
        if (!dir.getParentFile().equals(root) || (!dir.isDirectory() && !dir.mkdir())) throw new IOException("Cache unavailable");
        return dir;
    }
    static File create(Context context, String kind, String suffix) throws IOException {
        File dir = directory(context, kind); File[] files = dir.listFiles(); long size = 0; int count = 0;
        if (files != null) for (File file : files) if (file.isFile()) { size += file.length(); count++; }
        if (size > 108L * 1024 * 1024 || count >= 64) throw new IOException("Temporary file capacity reached");
        return File.createTempFile("kampira-", suffix, dir);
    }
    static void remove(Context context, String kind, File file) {
        if (file == null) return;
        try { if (file.getCanonicalFile().getParentFile().equals(directory(context, kind)) && file.isFile()) file.delete(); }
        catch (IOException ignored) { /* A later bounded cleanup can retry. */ }
    }
    static void clean(Context context, String kind, long ageMillis) {
        try {
            File[] files = directory(context, kind).listFiles();
            if (files != null) for (File file : files) if (file.getName().startsWith("kampira-") && System.currentTimeMillis() - file.lastModified() > ageMillis) remove(context, kind, file);
        } catch (IOException ignored) { }
    }
}
