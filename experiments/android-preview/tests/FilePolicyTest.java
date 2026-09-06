package app.kampira.preview;

public final class FilePolicyTest {
    private static int checks;
    private static void check(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        OriginPolicy origin = new OriginPolicy("http://192.168.0.4:5173");
        check(FilePolicy.noteUrl(origin, "/api/notes/file?id=note-42").equals(origin.startUrl() + "api/notes/file?id=note-42&download=1"), "Canonical authenticated notes URL");
        check(FilePolicy.noteUrl(origin, origin.startUrl() + "api/notes/file?download=1&id=note-42") != null, "Current-origin absolute URL");
        for (String url : new String[]{"https://evil.example/api/notes/file?id=a", "//evil.example/api/notes/file?id=a", "http://user@192.168.0.4:5173/api/notes/file?id=a", "/api/notes/file?id=a#x", "/api/notes/file?id=a&id=b", "/api/notes/file?id=a&download=1&download=1", "/api/notes/file?id=a&download=0", "/api/notes/file?id=a&other=b", "/api/notes/file?id=%61", "/api/notes/file?id=a%26download=1", "/api/notes/file", "/api/notes/file?id=", "/api/notes/%66ile?id=a", "/api/posts/media?id=a", "file:///data/private", "content://private/file", "blob:http://192.168.0.4:5173/a", "/api/notes/file?id=a\n"}) check(FilePolicy.noteUrl(origin, url) == null, "Reject download " + url);
        check(FilePolicy.shareUrl(origin, "/?view=feed&post=p1") != null, "Safe SPA share");
        for (String url : new String[]{"https://evil.example/", "/api/notes/file?id=a", "/?view=feed&post=p1&post=p2", "/?token=secret", "/?view=feed#x", "javascript:alert(1)"}) check(FilePolicy.shareUrl(origin, url) == null, "Reject share " + url);
        check(FilePolicy.noteMime("application/pdf; charset=utf-8"), "Response MIME parameters");
        check(!FilePolicy.noteMime("application/json"), "Do not download JSON error as note");
        check(!FilePolicy.blobMime("image/svg+xml"), "No active SVG export");
        check(!FilePolicy.blobMime("text/html"), "No active HTML export");
        check(FilePolicy.blobMime("text/csv;charset=utf-8"), "Existing CSV export");
        check(FilePolicy.blobMime("application/json"), "Existing JSON export");
        check(FilePolicy.base64Chunk("A".repeat(65536)), "Full 48KiB chunk without regex recursion");
        check(!FilePolicy.base64Chunk("A".repeat(65540)), "Encoded size cap");
        check(!FilePolicy.base64Chunk("AA=A") && !FilePolicy.base64Chunk("AA\n="), "Invalid internal padding and whitespace");
        check(FilePolicy.base64Chunk("YQ==") && FilePolicy.base64Chunk("YWI="), "Valid final padded chunk");
        check(FilePolicy.name("../../secret.html", "application/pdf").equals("_.._secret.pdf"), "Filename path and extension normalization");
        check(!FilePolicy.name("bad\u202E.exe", "application/pdf").contains("\u202E"), "No bidi filename override");
        check(FilePolicy.dispositionName("attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%C3%87al%C4%B1%C5%9Fma%20%C5%9Femas%C4%B1.pdf", "application/pdf").equals("Çalışma şeması.pdf"), "RFC5987 Turkish name");
        check(FilePolicy.dispositionName("attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%zz", "application/pdf").equals("fallback.pdf"), "Malformed UTF8 escape fallback");
        check(FilePolicy.dispositionName("attachment; filename*=UTF-8''A+B.pdf", "application/pdf").equals("A+B.pdf"), "RFC5987 literal plus retained");
        FileTransferState transfer = new FileTransferState("requestA", "transferA", "alice", "sessionA", 1, 49155);
        check(transfer.current("alice", "sessionA", 1), "Current owner");
        check(!transfer.current("bob", "sessionA", 1), "Account fence"); check(!transfer.current("alice", "sessionB", 1), "Session fence"); check(!transfer.current("alice", "sessionA", 2), "Document fence");
        check(!transfer.append(1, 3), "Out-of-order rejection"); check(transfer.bytes() == 0, "Rejected chunk cannot mutate bytes");
        check(!transfer.append(0, 49153), "Chunk cap"); check(transfer.append(0, 49152), "Full chunk");
        check(!transfer.append(0, 3), "Duplicate chunk cannot double append"); check(!transfer.append(1, 4), "Expected total cap");
        check(!transfer.complete(), "Incomplete does not finish"); check(transfer.append(1, 3) && transfer.complete(), "Exact ordered complete");
        check(!transfer.matchesCancel("oldRequest", "oldTransfer"), "Old cancellation cannot affect current transfer");
        check(transfer.matchesCancel("requestA", ""), "Original request cancellation"); check(transfer.matchesCancel("", "transferA"), "Exact transfer cleanup");
        transfer.cancel(); check(!transfer.current("alice", "sessionA", 1), "Cancel invalidates lease"); check(!transfer.complete(), "Cancelled transfer not saved"); check(!transfer.append(2, 1), "Late chunk refused");
        System.out.println("FilePolicy/transfer assertions passed: " + checks + "; no Android chooser, camera or device execution implied.");
    }
}
