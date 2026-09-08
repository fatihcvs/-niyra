package app.kampira.preview;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Local age self-declaration, before creating the WebView or requesting notifications. */
public final class PlayEntryActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (BuildConfig.DEBUG) { finish(); return; }
        if (getPreferences(MODE_PRIVATE).getBoolean("adult-declaration-v1", false)) { openApp(); return; }
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(0xfff8fafc);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setPadding(padding, padding * 2, padding, padding * 2);
        scroll.addView(layout, new ScrollView.LayoutParams(-1, -1));
        TextView title = new TextView(this);
        title.setText("Kampira’ya hoş geldin");
        title.setTextSize(28); title.setTextColor(0xff111827);
        if (Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        layout.addView(title);
        TextView description = new TextView(this);
        description.setText("Kampira’nın Android uygulaması 18 yaş ve üzerindeki kullanıcılar içindir. Devam etmeden önce yaşını onayla.\n\nBu seçim yalnız bu cihazda saklanır. Doğum tarihi veya kimlik belgesi istenmez.");
        description.setTextSize(17); description.setTextColor(0xff374151);
        description.setPadding(0, padding, 0, padding);
        layout.addView(description);
        CheckBox adult = new CheckBox(this);
        adult.setText("18 yaşında veya daha büyüğüm.");
        adult.setTextSize(17); adult.setTextColor(0xff111827);
        adult.setMinHeight(padding * 2);
        layout.addView(adult, new LinearLayout.LayoutParams(-1, -2));
        Button proceed = new Button(this);
        proceed.setText("Kampira’ya devam et");
        proceed.setMinHeight(padding * 2); proceed.setEnabled(false);
        layout.addView(proceed, new LinearLayout.LayoutParams(-1, -2));
        TextView error = new TextView(this);
        error.setTextColor(0xff991b1b); error.setTextSize(16);
        error.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        layout.addView(error);
        adult.setOnCheckedChangeListener((button, checked) -> proceed.setEnabled(checked));
        proceed.setOnClickListener(view -> {
            if (!adult.isChecked()) return;
            if (!getPreferences(MODE_PRIVATE).edit().putBoolean("adult-declaration-v1", true).commit()) {
                error.setText("Seçimin kaydedilemedi. Yeniden deneyebilirsin."); return;
            }
            openApp();
        });
        Button close = new Button(this);
        close.setText("18 yaşından küçüğüm / Çıkış"); close.setMinHeight(padding * 2);
        close.setOnClickListener(view -> finish());
        layout.addView(close, new LinearLayout.LayoutParams(-1, -2));
        setContentView(scroll);
    }
    private void openApp() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
}
