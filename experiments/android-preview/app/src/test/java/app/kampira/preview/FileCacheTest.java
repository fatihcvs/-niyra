package app.kampira.preview;

import android.content.Context;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.io.RandomAccessFile;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/** Actual bounded private-cache behavior on temporary local disk, not device/SAF proof. */
public class FileCacheTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private Context context() { Context context = mock(Context.class); when(context.getCacheDir()).thenReturn(temporary.getRoot()); return context; }
    @Test public void cleanupStaysInsideNamedDirectory() throws Exception {
        Context context = context(); File outside = temporary.newFile("keep.txt"), inside = FileCache.create(context, "transfers", ".part");
        FileCache.remove(context, "transfers", outside); assertTrue(outside.exists());
        FileCache.remove(context, "camera", inside); assertTrue(inside.exists());
        FileCache.remove(context, "transfers", inside); assertFalse(inside.exists());
    }
    @Test public void currentShareSurvivesCleanupAndExpiredFileDoesNot() throws Exception {
        Context context = context(); File old = FileCache.create(context, "transfers", ".pdf"), current = FileCache.create(context, "transfers", ".csv");
        assertTrue(old.setLastModified(System.currentTimeMillis() - 25 * 60 * 60_000L));
        FileCache.clean(context, "transfers", 24 * 60 * 60_000L); assertFalse(old.exists()); assertTrue(current.exists());
    }
    @Test public void fileCountCapacityIsBounded() throws Exception {
        Context context = context(); for (int i = 0; i < 64; i++) FileCache.create(context, "transfers", ".part");
        try { FileCache.create(context, "transfers", ".part"); fail("Unbounded cache accepted"); } catch (java.io.IOException expected) { }
    }
    @Test public void byteCapacityIsBoundedBeforeNewTransfer() throws Exception {
        Context context = context(); File large = FileCache.create(context, "transfers", ".part");
        try (RandomAccessFile file = new RandomAccessFile(large, "rw")) { file.setLength(109L * 1024 * 1024); }
        try { FileCache.create(context, "transfers", ".part"); fail("Unbounded bytes accepted"); } catch (java.io.IOException expected) { }
    }
}
