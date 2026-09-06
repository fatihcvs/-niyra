package app.kampira.preview;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.TimeUnit;

/** Refresh only the enrolled, still-current session; a token callback never opts a user in. */
public final class PushTokenWorker extends Worker {
    public PushTokenWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
    @NonNull @Override public Result doWork() {
        PushStore store = new PushStore(getApplicationContext()); PushBinding binding = store.read();
        String cookie = PushHttp.cookie(); long epoch = getInputData().getLong("epoch", -1);
        if (!BuildConfig.FIREBASE_CONFIGURED || isStopped() || !binding.accepts(epoch, binding.account, binding.subscription, PushHttp.fingerprint(cookie)) || !PushCoordinator.allowed(getApplicationContext())) return Result.success();
        try {
            String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 20, TimeUnit.SECONDS);
            if (isStopped() || !store.read().sameLease(binding) || !binding.session.equals(PushHttp.fingerprint(PushHttp.cookie()))) return Result.success();
            PushHttp.Reply result = PushCoordinator.register(getApplicationContext(), binding, cookie, token);
            if (result.ok() && result.body.optBoolean("enabled") && PushPolicy.id(result.body.optString("id"))) {
                String id = result.body.optString("id");
                if (!binding.session.equals(PushHttp.fingerprint(PushHttp.cookie())) || !store.commit(binding, id, PushPolicy.registrationDevice(binding.device, token))) PushCoordinator.revoke(getApplicationContext(), binding.commit(id), cookie, false);
                else PushCoordinator.drainRevocations(getApplicationContext(), cookie);
                return Result.success();
            }
            if (result.status == 401 || result.status == 409 || result.status == 410) { store.clearIfCurrent(binding); return Result.success(); }
            return getRunAttemptCount() < 2 ? Result.retry() : Result.success();
        } catch (Exception ignored) { return getRunAttemptCount() < 2 && !isStopped() ? Result.retry() : Result.success(); }
    }
}
