package app.kampira.preview;

import android.os.Build;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Data-only FCM hands receipt I/O to durable Android work; no private body is trusted. */
public final class KampiraMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        if (message.getNotification() != null) return;
        Map<String, String> payload = message.getData();
        String account = payload.get("accountId"), subscription = payload.get("subscriptionId"), notification = payload.get("notificationId");
        if (!"1".equals(payload.get("v")) || !PushPolicy.id(account) || !PushPolicy.id(subscription) || !PushPolicy.id(notification)) return;
        PushBinding binding = new PushStore(this).read();
        if (!binding.accepts(binding.epoch, account, subscription, PushHttp.fingerprint(PushHttp.cookie())) || !PushCoordinator.allowed(this)) return;
        long now = System.currentTimeMillis();
        long expiry = Math.min(now + 300_000, message.getSentTime() + Math.min(300, Math.max(0, message.getTtl())) * 1000L);
        if (expiry <= now) return;
        Data data = new Data.Builder().putString("account", account).putString("subscription", subscription).putString("notification", notification).putLong("epoch", binding.epoch).putLong("expires", expiry).build();
        OneTimeWorkRequest.Builder work = new OneTimeWorkRequest.Builder(PushReceiptWorker.class).setInputData(data).addTag("kampira-push");
        // API 31+ can use a JobScheduler expedited job without a foreground-service permission.
        // Older versions run normal durable work and keep the same short receipt expiry.
        if (Build.VERSION.SDK_INT >= 31 && message.getPriority() == RemoteMessage.PRIORITY_HIGH) work.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
        WorkManager.getInstance(this).enqueueUniqueWork("kampira-receipt:" + binding.epoch + ":" + subscription + ":" + notification, ExistingWorkPolicy.KEEP, work.build());
    }
    @Override public void onNewToken(String ignoredToken) {
        // Never export tokens to JS or put them in WorkManager's persisted input/logs.
        PushBinding binding = new PushStore(this).read();
        scheduleTokenRefresh(this, binding);
    }
    static void scheduleTokenRefresh(android.content.Context context, PushBinding binding) {
        if (!binding.enabled) return;
        Data data = new Data.Builder().putLong("epoch", binding.epoch).build();
        WorkManager.getInstance(context).enqueueUniqueWork("kampira-token:" + binding.epoch, ExistingWorkPolicy.APPEND_OR_REPLACE,
            new OneTimeWorkRequest.Builder(PushTokenWorker.class).setInputData(data).addTag("kampira-push").build());
    }
}
