package app.kampira.preview;

/** Byte/order and cancellation fences shared by native streamed and chunked transfers. */
public final class FileTransferState {
    public final String requestId, transferId, account, session;
    public final long document, expected;
    private long bytes;
    private int sequence;
    private boolean cancelled;
    public FileTransferState(String requestId, String transferId, String account, String session, long document, long expected) {
        if (!PushPolicy.id(requestId) || !PushPolicy.id(transferId) || !PushPolicy.id(account) || session == null || session.isEmpty() || expected < 0 || expected > FilePolicy.BLOB_LIMIT) throw new IllegalArgumentException("Invalid transfer");
        this.requestId = requestId; this.transferId = transferId; this.account = account; this.session = session; this.document = document; this.expected = expected;
    }
    public synchronized boolean current(String account, String session, long document) { return !cancelled && this.account.equals(account) && this.session.equals(session) && this.document == document; }
    public synchronized boolean append(int next, int count) { if (cancelled || next != sequence || count < 1 || count > FilePolicy.CHUNK_LIMIT || bytes + count > expected) return false; bytes += count; sequence++; return true; }
    public synchronized boolean complete() { return !cancelled && bytes == expected; }
    public synchronized int sequence() { return sequence; }
    public synchronized long bytes() { return bytes; }
    public synchronized boolean matchesCancel(String request, String transfer) { return !cancelled && ((!transfer.isEmpty() && transferId.equals(transfer)) || (transfer.isEmpty() && requestId.equals(request))); }
    public synchronized void cancel() { cancelled = true; }
}
