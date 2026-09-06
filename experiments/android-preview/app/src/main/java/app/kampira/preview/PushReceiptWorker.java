package app.kampira.preview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;

public final class PushReceiptWorker extends Worker {
    public PushReceiptWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext(); PushStore store = new PushStore(context);
        String account = getInputData().getString("account"), subscription = getInputData().getString("subscription"), notification = getInputData().getString("notification");
        long epoch = getInputData().getLong("epoch", -1), expires = getInputData().getLong("expires", 0);
        PushBinding binding = store.read(); String cookie = PushHttp.cookie();
        if (isStopped() || expires <= System.currentTimeMillis() || !PushPolicy.id(notification) || !binding.accepts(epoch, account, subscription, PushHttp.fingerprint(cookie)) || !PushCoordinator.allowed(context)) return Result.success();
        try {
            JSONObject receipt = PushHttp.receipt(binding, notification, cookie);
            if (receipt == null || PushPolicy.safeHref(new OriginPolicy(BuildConfig.PREVIEW_ORIGIN), receipt.optString("href")) == null) return Result.success();
            synchronized (PushStore.LOCK) {
                // clear()/account switch and posting use one lock so an in-flight receipt cannot resurrect a notification.
                if (isStopped() || expires <= System.currentTimeMillis() || !store.read().accepts(epoch, account, subscription, PushHttp.fingerprint(PushHttp.cookie())) || !PushCoordinator.allowed(context)) return Result.success();
                NotificationManager manager = context.getSystemService(NotificationManager.class);
                if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(PushCoordinator.CHANNEL, "Kampira bildirimleri", NotificationManager.IMPORTANCE_DEFAULT));
                Intent intent = new Intent(context, MainActivity.class).setAction(PushCoordinator.OPEN_ACTION)
                    .setData(Uri.parse("kampira-push://notification/" + epoch + "/" + subscription + "/" + notification))
                    .putExtra("accountId", account).putExtra("subscriptionId", subscription).putExtra("notificationId", notification).putExtra("epoch", epoch)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, PushCoordinator.CHANNEL) : new Notification.Builder(context);
                builder.setSmallIcon(R.drawable.kampira_notification).setContentTitle("Kampira").setContentText("Yeni bir bildirimin var.")
                    .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_SOCIAL);
                manager.notify("kampira:" + subscription + ":" + notification, 1, builder.build());
            }
            return Result.success();
        } catch (Exception ignored) { return expires > System.currentTimeMillis() && getRunAttemptCount() < 2 && !isStopped() ? Result.retry() : Result.success(); }
    }
}
