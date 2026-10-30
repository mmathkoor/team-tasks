package com.matjark.tasks;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://matjark.vercel.app/";
    private static final int REQ_NOTIFICATIONS = 1001;

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> filePathCallback;
    private long lastBackPressTime = 0L;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                if (result.getData().getClipData() != null) {
                    int count = result.getData().getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = result.getData().getClipData().getItemAt(i).getUri();
                    }
                } else if (result.getData().getData() != null) {
                    results = new Uri[]{result.getData().getData()};
                } else if (result.getData().getDataString() != null) {
                    results = new Uri[]{Uri.parse(result.getData().getDataString())};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        });

    @SuppressLint({"SetJavaScriptEnabled", "BatteryLife"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#0b1426"));
        setContentView(R.layout.activity_main);

        TaskMonitorService.createChannelsStatic(this);
        requestNotificationPermissionIfNeeded();
        startBackgroundMonitorService();
        requestBatteryOptimizationExemptionIfNeeded();

        swipeRefresh = findViewById(R.id.swipe_refresh);
        webView = findViewById(R.id.web_view);

        swipeRefresh.setColorSchemeColors(Color.parseColor("#d4af6a"), Color.parseColor("#0b1426"));
        swipeRefresh.setOnRefreshListener(() -> webView.reload());

        // تعطيل السحب للتحديث إلا عندما تكون الصفحة في أعلى الشاشة تماماً لمنع تعارض التمرير
        webView.getViewTreeObserver().addOnScrollChangedListener(() -> {
            if (webView != null && swipeRefresh != null) {
                swipeRefresh.setEnabled(webView.getScrollY() == 0);
            }
        });

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setSupportZoom(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MatjarkTasksAPK/2.0");

        webView.addJavascriptInterface(new AndroidNotificationBridge(), "AndroidApp");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                swipeRefresh.setRefreshing(false);
                CookieManager.getInstance().flush();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

                if ("whatsapp".equals(scheme) || "tel".equals(scheme) || "mailto".equals(scheme)
                        || host.contains("wa.me") || host.contains("api.whatsapp.com")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    moveTaskToBack(true);
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){ try { return typeof window.__handleAndroidBack === 'function' ? window.__handleAndroidBack() : 'none'; } catch(e) { return 'none'; } })()",
                    result -> {
                        if (result != null && result.contains("handled")) {
                            return;
                        }
                        if (webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }
                        long now = System.currentTimeMillis();
                        if (now - lastBackPressTime < 2200L) {
                            moveTaskToBack(true);
                        } else {
                            lastBackPressTime = now;
                            Toast.makeText(MainActivity.this, "اضغط زر الرجوع مرة أخرى للخروج من التطبيق", Toast.LENGTH_SHORT).show();
                        }
                    }
                );
            }
        });

        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        startBackgroundMonitorService();
    }

    private void startBackgroundMonitorService() {
        try {
            Intent serviceIntent = new Intent(this, TaskMonitorService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception ignored) {
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQ_NOTIFICATIONS
                );
            }
        }
    }

    @SuppressLint("BatteryLife")
    private void requestBatteryOptimizationExemptionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                SharedPreferences prefs = getSharedPreferences(TaskMonitorService.PREFS_NAME, MODE_PRIVATE);
                if (prefs.getBoolean("asked_battery_opt", false)) return;
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    prefs.edit().putBoolean("asked_battery_opt", true).apply();
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            } catch (Exception ignored) {
            }
        }
    }

    public class AndroidNotificationBridge {
        @JavascriptInterface
        public void postNotification(String title, String body, String tag) {
            new Handler(Looper.getMainLooper()).post(() ->
                TaskMonitorService.fireHighPriorityAlert(MainActivity.this, title, body, tag)
            );
        }

        @JavascriptInterface
        public void syncAuth(String apiUrl, String apiKey, String accessToken, String refreshToken, String userEmail, String userName) {
            try {
                SharedPreferences prefs = getSharedPreferences(TaskMonitorService.PREFS_NAME, MODE_PRIVATE);
                prefs.edit()
                    .putString("api_url", apiUrl != null ? apiUrl : "")
                    .putString("api_key", apiKey != null ? apiKey : "")
                    .putString("access_token", accessToken != null ? accessToken : "")
                    .putString("refresh_token", refreshToken != null ? refreshToken : "")
                    .putString("user_email", userEmail != null ? userEmail : "")
                    .putString("user_name", userName != null ? userName : "")
                    .apply();
                startBackgroundMonitorService();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void syncDigest(String digestJson) {
            try {
                SharedPreferences prefs = getSharedPreferences(TaskMonitorService.PREFS_NAME, MODE_PRIVATE);
                prefs.edit().putString("overdue_digest_json", digestJson != null ? digestJson : "").apply();
            } catch (Exception ignored) {
            }
        }
    }
}
