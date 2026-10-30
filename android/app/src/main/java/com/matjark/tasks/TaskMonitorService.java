package com.matjark.tasks;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@SuppressLint({"MissingPermission", "WakelockTimeout"})
public class TaskMonitorService extends Service {
    public static final String PREFS_NAME = "matjark_native_prefs";
    public static final String MONITOR_CHANNEL_ID = "matjark_bg_monitor";
    public static final String ALERT_CHANNEL_ID = "matjark_tasks_alerts_v2";
    private static final int FOREGROUND_ID = 9001;

    private ScheduledExecutorService scheduler;
    private volatile boolean isChecking = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        startForegroundSafe();
        startPollingLoop();
        scheduleWatchdogAlarm(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundSafe();
        if (scheduler == null || scheduler.isShutdown()) {
            startPollingLoop();
        } else {
            scheduler.execute(this::checkNotificationsAndReminders);
        }
        scheduleWatchdogAlarm(this);
        return START_STICKY;
    }

    private void startForegroundSafe() {
        try {
            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags);

            Notification notification = new NotificationCompat.Builder(this, MONITOR_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("مدير المهام متصل")
                .setContentText("متابعة فورية للإشعارات والمهام في الخلفية")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .setSilent(true)
                .setShowWhen(false)
                .setContentIntent(pendingIntent)
                .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(FOREGROUND_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(FOREGROUND_ID, notification);
            }
        } catch (Exception ignored) {
        }
    }

    private void startPollingLoop() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleWithFixedDelay(this::checkNotificationsAndReminders, 3, 20, TimeUnit.SECONDS);
    }

    private void checkNotificationsAndReminders() {
        if (isChecking) return;
        isChecking = true;
        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MatjarkTasks::BgSyncWakeLock");
                wakeLock.acquire(15000L);
            }
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String apiUrl = prefs.getString("api_url", "");
            String apiKey = prefs.getString("api_key", "");
            String accessToken = prefs.getString("access_token", "");
            String refreshToken = prefs.getString("refresh_token", "");
            String userEmail = prefs.getString("user_email", "");

            if (apiUrl != null && !apiUrl.isEmpty() && apiKey != null && !apiKey.isEmpty()
                    && accessToken != null && !accessToken.isEmpty() && userEmail != null && !userEmail.isEmpty()) {
                pollSupabaseNotifications(prefs, apiUrl, apiKey, accessToken, refreshToken, userEmail);
            }

            checkLocalScheduledDigest(prefs);
        } catch (Exception ignored) {
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try {
                    wakeLock.release();
                } catch (Exception ignored) {
                }
            }
            isChecking = false;
        }
    }

    private void pollSupabaseNotifications(SharedPreferences prefs, String apiUrl, String apiKey,
                                           String accessToken, String refreshToken, String userEmail) {
        HttpURLConnection conn = null;
        try {
            String encodedEmail = URLEncoder.encode(userEmail, "UTF-8");
            String endpoint = apiUrl + "/rest/v1/notifications?select=id,title,body,task_id,order_id,created_at"
                    + "&to_email=ilike." + encodedEmail
                    + "&read_at=is.null&order=created_at.desc&limit=10";

            conn = (HttpURLConnection) new URL(endpoint).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("apikey", apiKey);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Accept", "application/json");

            int code = conn.getResponseCode();
            if (code == 401 && refreshToken != null && !refreshToken.isEmpty()) {
                conn.disconnect();
                String newTok = refreshSupabaseToken(prefs, apiUrl, apiKey, refreshToken);
                if (newTok != null && !newTok.isEmpty()) {
                    conn = (HttpURLConnection) new URL(endpoint).openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    conn.setRequestProperty("apikey", apiKey);
                    conn.setRequestProperty("Authorization", "Bearer " + newTok);
                    conn.setRequestProperty("Accept", "application/json");
                    code = conn.getResponseCode();
                }
            }

            if (code >= 200 && code < 300) {
                String jsonStr = readStream(conn.getInputStream());
                JSONArray arr = new JSONArray(jsonStr);
                Set<String> seen = new HashSet<>(prefs.getStringSet("seen_notif_ids", new HashSet<>()));
                boolean updated = false;

                for (int i = arr.length() - 1; i >= 0; i--) {
                    JSONObject obj = arr.optJSONObject(i);
                    if (obj == null) continue;
                    String id = obj.optString("id", "");
                    if (id.isEmpty() || seen.contains(id)) continue;

                    String title = obj.optString("title", "🔔 تنبيه جديد");
                    String body = obj.optString("body", "لديك إشعار جديد في مدير المهام");
                    fireHighPriorityAlert(this, title, body, "notif_" + id);
                    seen.add(id);
                    updated = true;
                }

                if (updated) {
                    if (seen.size() > 250) {
                        Set<String> trimmed = new HashSet<>();
                        int count = 0;
                        for (String s : seen) {
                            if (count++ < 150) trimmed.add(s);
                        }
                        seen = trimmed;
                    }
                    prefs.edit().putStringSet("seen_notif_ids", seen).apply();
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private String refreshSupabaseToken(SharedPreferences prefs, String apiUrl, String apiKey, String refreshToken) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(apiUrl + "/auth/v1/token?grant_type=refresh_token");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);
            conn.setRequestProperty("apikey", apiKey);
            conn.setRequestProperty("Content-Type", "application/json");

            JSONObject payload = new JSONObject();
            payload.put("refresh_token", refreshToken);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }

            if (conn.getResponseCode() >= 200 && conn.getResponseCode() < 300) {
                String resp = readStream(conn.getInputStream());
                JSONObject j = new JSONObject(resp);
                String newAccess = j.optString("access_token", "");
                String newRefresh = j.optString("refresh_token", refreshToken);
                if (!newAccess.isEmpty()) {
                    prefs.edit()
                        .putString("access_token", newAccess)
                        .putString("refresh_token", newRefresh)
                        .apply();
                    return newAccess;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {
                }
            }
        }
        return null;
    }

    private void checkLocalScheduledDigest(SharedPreferences prefs) {
        try {
            String rawDigest = prefs.getString("overdue_digest_json", "");
            if (rawDigest == null || rawDigest.isEmpty()) return;

            JSONObject d = new JSONObject(rawDigest);
            if (!d.optBoolean("enabled", true)) return;

            int lateCount = d.optInt("lateCount", 0);
            int todayCount = d.optInt("todayCount", 0);
            if (lateCount <= 0 && todayCount <= 0) return;

            Calendar cal = Calendar.getInstance();
            String ymd = String.format(Locale.US, "%04d-%02d-%02d",
                    cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
            int nowMins = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);

            String mode = d.optString("scheduleMode", "scheduled");
            String dueSlot = null;

            if ("interval".equals(mode)) {
                int intervalMin = Math.max(15, d.optInt("intervalMin", 120));
                long intervalMs = intervalMin * 60L * 1000L;
                long lastFired = prefs.getLong("native_last_interval_ts", 0L);
                if (System.currentTimeMillis() - lastFired >= intervalMs) {
                    dueSlot = "native_int_" + (System.currentTimeMillis() / intervalMs);
                }
            } else {
                JSONArray times = d.optJSONArray("times");
                if (times != null) {
                    for (int i = 0; i < times.length(); i++) {
                        String tStr = times.optString(i, "");
                        String[] parts = tStr.split(":");
                        if (parts.length != 2) continue;
                        int slotMins = Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
                        if (nowMins >= slotMins && nowMins <= slotMins + 20) {
                            String candidate = ymd + "_" + tStr;
                            if (!prefs.getBoolean("slot_" + candidate, false)) {
                                dueSlot = candidate;
                                break;
                            }
                        }
                    }
                }
            }

            if (dueSlot == null) return;

            prefs.edit()
                .putBoolean("slot_" + dueSlot, true)
                .putLong("native_last_interval_ts", System.currentTimeMillis())
                .apply();

            String title = lateCount > 0
                ? ("🚨 تذكير: لديك " + lateCount + " مهام متأخرة")
                : ("🔥 تذكير: لديك " + todayCount + " مهام مستحقة اليوم");

            StringBuilder body = new StringBuilder();
            JSONArray titles = d.optJSONArray("titles");
            if (titles != null && titles.length() > 0) {
                for (int i = 0; i < titles.length(); i++) {
                    if (i > 0) body.append("\n");
                    body.append("• ").append(titles.optString(i));
                }
            } else {
                body.append("افتح التطبيق لمراجعة وإنجاز مهامك المستحقة.");
            }

            fireHighPriorityAlert(this, title, body.toString(), "azkar_slot_" + dueSlot);
        } catch (Exception ignored) {
        }
    }

    @SuppressLint("MissingPermission")
    public static void fireHighPriorityAlert(Context context, String title, String body, String tag) {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            createChannelsStatic(context);
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            int notifId = (tag != null && !tag.isEmpty()) ? Math.abs(tag.hashCode()) : (int) (System.currentTimeMillis() & 0xfffffff);
            PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, intent, piFlags);

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ALERT_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title != null && !title.isEmpty() ? title : "مدير المهام")
                .setContentText(body != null ? body : "")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setSound(soundUri)
                .setVibrate(new long[]{0, 350, 150, 350})
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pendingIntent);

            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException ignored) {
        } catch (Exception ignored) {
        }
    }

    private void createChannels() {
        createChannelsStatic(this);
    }

    public static void createChannelsStatic(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return;

            NotificationChannel monitorChannel = new NotificationChannel(
                MONITOR_CHANNEL_ID,
                "مزامنة الإشعارات بالخلفية",
                NotificationManager.IMPORTANCE_LOW
            );
            monitorChannel.setDescription("تحافظ على وصول إشعارات المهام والطلبات فوراً في الخلفية");
            monitorChannel.setShowBadge(false);
            manager.createNotificationChannel(monitorChannel);

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

            NotificationChannel alertChannel = new NotificationChannel(
                ALERT_CHANNEL_ID,
                "تنبيهات المهام والطلبات الفورية",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("إشعارات المهام الجديدة والمتأخرة والطلبات");
            alertChannel.enableVibration(true);
            alertChannel.setVibrationPattern(new long[]{0, 350, 150, 350});
            alertChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            alertChannel.setSound(soundUri, audioAttr);
            manager.createNotificationChannel(alertChannel);
        }
    }

    public static void scheduleWatchdogAlarm(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(context, TaskMonitorService.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getService(context, 9002, i, flags);
            am.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 10 * 60 * 1000L,
                10 * 60 * 1000L,
                pi
            );
        } catch (Exception ignored) {
        }
    }

    private String readStream(InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        scheduleWatchdogAlarm(getApplicationContext());
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        scheduleWatchdogAlarm(getApplicationContext());
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
