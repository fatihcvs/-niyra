package app.kampira.preview;

import java.util.UUID;

/** Persisted generation. A response/worker can only use the exact lease it started with. */
public final class PushBinding {
    public final long epoch;
    public final String account, subscription, device, session;
    public final boolean enabled;
    public PushBinding(long epoch, String account, String subscription, String device, String session, boolean enabled) {
        this.epoch = epoch; this.account = account; this.subscription = subscription;
        this.device = device; this.session = session; this.enabled = enabled;
    }
    public PushBinding clear() { return new PushBinding(epoch + 1, "", "", device, "", false); }
    public PushBinding begin(String owner, String fingerprint) { return new PushBinding(epoch + 1, owner, "", UUID.randomUUID().toString(), fingerprint, false); }
    public PushBinding commit(String id) { return new PushBinding(epoch, account, id, device, session, true); }
    public boolean sameLease(PushBinding lease) { return lease != null && epoch == lease.epoch && account.equals(lease.account) && session.equals(lease.session) && device.equals(lease.device); }
    public boolean sameRegistration(PushBinding lease) { return sameLease(lease) && subscription.equals(lease.subscription) && enabled == lease.enabled; }
    public boolean accepts(long expectedEpoch, String owner, String id, String fingerprint) {
        return enabled && epoch == expectedEpoch && PushPolicy.id(owner) && PushPolicy.id(id) && account.equals(owner) && subscription.equals(id) && !session.isEmpty() && session.equals(fingerprint);
    }
}
