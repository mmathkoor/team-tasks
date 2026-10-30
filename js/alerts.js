// ===== نافذة التنبيه المنبثقة + شاشة المهام الناقصة المنبثقة (بأسلوب تطبيق الأذان) + محرك الإشعارات الشامل =====
const ALERT = { q: [], cur: null, ctx: null, timer: null, keepAliveAudio: null, adhanRingTimer: null };
const alertSoundOn = () => localStorage.getItem('alert_sound') !== 'off';
const azkarVoiceOn = () => localStorage.getItem('azkar_voice_on') === 'on';

// توليد ملف WAV صامت متناهي الصغر لإبقاء جلسة الخلفية نشطة في أندرويد (مثل تطبيقات الأذان والأذكار)
function createSilentWavDataUri() {
  return 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
}

function startSilentAudioKeepAlive() {
  try {
    if (!ALERT.keepAliveAudio) {
      const a = new Audio(createSilentWavDataUri());
      a.loop = true;
      a.volume = 0.01;
      ALERT.keepAliveAudio = a;
    }
    if (ALERT.keepAliveAudio.paused && azkarReminderOn()) {
      ALERT.keepAliveAudio.play().catch(() => {});
    }
  } catch (e) {}
}

function unlockAudio() {
  try {
    if (!ALERT.ctx) ALERT.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ALERT.ctx.state === 'suspended') ALERT.ctx.resume();
    startSilentAudioKeepAlive();
  } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

function chime(ctx, t0, styleOpt, volOpt) {
  const style = styleOpt || azkarToneStyle();
  const vol = Math.max(0.05, Math.min(1, Number(volOpt != null ? volOpt : azkarToneVolume()) || 0.85));
  if (style === 'silent') return;

  if (style === 'adhan_chime') {
    // نغمة روحانية هادئة ومتدرجة مستوحاة من تنبيهات الأذان (مقام الحجاز/البيات الهادئ)
    const notes = [
      [440.0, 0.0, 0.55, 'sine'],
      [554.37, 0.45, 0.55, 'sine'],
      [659.25, 0.90, 0.75, 'triangle'],
      [587.33, 1.55, 0.50, 'sine'],
      [659.25, 2.00, 0.95, 'sine']
    ];
    notes.forEach(([f, d, dur, wave]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + d;
      o.type = wave; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, s);
      g.gain.linearRampToValueAtTime(0.42 * vol, s + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, s + dur);
      o.start(s); o.stop(s + dur + 0.04);
    });
    return;
  }

  if (style === 'urgent_alarm') {
    // نغمة منبّه قوية وواضحة للمهام العاجلة
    const notes = [[880, 0], [1174.66, 0.14], [880, 0.28], [1174.66, 0.42], [1318.5, 0.58], [1174.66, 0.76], [1318.5, 0.92]];
    notes.forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + d;
      o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, s);
      g.gain.linearRampToValueAtTime(0.55 * vol, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.15);
      o.start(s); o.stop(s + 0.17);
    });
    return;
  }

  if (style === 'soft_beep') {
    // نبضة خفيفة قصيرة
    [[587.33, 0], [880, 0.16]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + d;
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, s);
      g.gain.linearRampToValueAtTime(0.32 * vol, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.32);
      o.start(s); o.stop(s + 0.35);
    });
    return;
  }

  // classic_bell (الافتراضي الكلاسيكي)
  [[659.25, 0], [783.99, .18], [1046.5, .36], [783.99, .62], [1046.5, .8]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + d;
    o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.45 * vol, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + .55);
    o.start(s); o.stop(s + .6);
  });
}

function stopAdhanPopupRing() {
  if (ALERT.adhanRingTimer) {
    clearInterval(ALERT.adhanRingTimer);
    ALERT.adhanRingTimer = null;
  }
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
}

function playBackgroundAzkarToneAndVoice(spokenText, styleOverride) {
  try {
    if (isQuietHoursActiveNow() && !styleOverride) return;
    stopAdhanPopupRing();
    const style = styleOverride || azkarToneStyle();
    const vol = azkarToneVolume();
    const vibOn = azkarVibrateOn();
    const ringSec = azkarRingDurationSec();

    unlockAudio();
    const ctx = ALERT.ctx;
    const playOnce = () => {
      if (ctx && style !== 'silent') {
        if (ctx.state === 'suspended') ctx.resume();
        chime(ctx, ctx.currentTime + 0.02, style, vol);
      }
      if (vibOn && navigator.vibrate) {
        navigator.vibrate([500, 150, 500, 150, 800]);
      }
    };

    playOnce();

    if (ringSec > 4 && style !== 'silent') {
      const startedAt = Date.now();
      ALERT.adhanRingTimer = setInterval(() => {
        if (Date.now() - startedAt >= ringSec * 1000) {
          stopAdhanPopupRing();
          return;
        }
        playOnce();
      }, 3400);
    }

    if (azkarVoiceSettingOn() && spokenText && 'speechSynthesis' in window) {
      setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(spokenText);
          u.lang = 'ar-SA';
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
        } catch (e) {}
      }, 1100);
    }
  } catch (e) {}
}

function stopRing() { clearInterval(ALERT.timer); ALERT.timer = null; try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {} }
function startRing() {
  stopRing();
  if (!alertSoundOn() || isQuietHoursActiveNow()) return;
  unlockAudio();
  const ctx = ALERT.ctx; let n = 0;
  const tick = () => {
    try { if (ctx) { if (ctx.state === 'suspended') ctx.resume(); chime(ctx, ctx.currentTime + .02, 'classic_bell', 0.9); } if (azkarVibrateOn() && navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 800]); } catch (e) {}
    if (++n >= 18) stopRing();      // نحو 45 ثانية كحد أقصى
  };
  tick(); ALERT.timer = setInterval(tick, 2600);
}
function closeAlertOs(a) {
  return;
}
function ackAlert(a) { if (!a) return; if (a.nid && typeof markRead === 'function') markRead([a.nid]); if (a.nids && typeof markRead === 'function') markRead(a.nids); }

// إرسال إشعار شريط الجوال العلوي (يدعم تطبيق Android APK المستقل عبر الجسر، والمتصفحات عبر Service Worker)
function postSystemNotification(title, body, opts = {}) {
  if (!azkarExternalPushOn() && !opts.forceExternal) return false;
  // 1) إذا كان داخل تطبيق أندرويد المستقل APK (يظهر في شريط الجوال فوراً 100% بنغمة واهتزاز وشاشة تنبيه)
  if (typeof window.AndroidApp !== 'undefined' && window.AndroidApp && window.AndroidApp.postNotification) {
    try {
      window.AndroidApp.postNotification(title || 'مدير المهام', body || '', opts.tag || 'matjark_alert');
      return true;
    } catch (e) {}
  }
  // 2) إذا كان في متصفح يدعم إشعارات النظام
  if (typeof Notification !== 'undefined') {
    const doShow = () => {
      const reqInter = azkarPersistentNotifOn();
      const vib = azkarVibrateOn() ? [500, 150, 500, 150, 800] : [];
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          if (reg && reg.showNotification) {
            reg.showNotification(title || 'مدير المهام', {
              body: body || '',
              icon: '/icon-192.png',
              badge: '/badge-96.png',
              vibrate: vib,
              requireInteraction: reqInter,
              renotify: true,
              silent: azkarToneStyle() === 'silent' || isQuietHoursActiveNow(),
              tag: opts.tag || 'matjark_notification',
              timestamp: Date.now(),
              actions: opts.actions || [
                { action: 'open_popup', title: '🕌 شاشة المهام الناقصة' },
                { action: 'snooze', title: '⏰ غفوة ساعة' }
              ],
              data: Object.assign({ url: '/?azkar_popup=1', open_azkar_popup: true }, opts.data || {})
            }).catch(() => {});
          }
        }).catch(() => {});
      } else {
        try { new Notification(title || 'مدير المهام', { body: body || '', icon: '/icon-192.png' }); } catch (e) {}
      }
    };

    if (Notification.permission === 'granted') {
      doShow();
      return true;
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') doShow();
      }).catch(() => {});
    }
  }
  return false;
}

function showAlert(a) {
  ALERT.q.push(a);
  postSystemNotification(a.title || 'تنبيه جديد', a.body || '', { tag: 'alert_' + (a.nid || 'general'), forceExternal: true });
  if (!ALERT.cur) nextAlert();
}
function nextAlert() {
  const a = ALERT.q.shift(); ALERT.cur = a || null;
  let ov = document.getElementById('alert_ov');
  if (!a) { stopRing(); if (ov) ov.remove(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'alert_ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  const t = a.task_id && S.tasks && S.tasks.find(x => x.id === a.task_id);
  ov.innerHTML = '<div class="al-box"><div class="al-bell">🔔</div><h2>' + esc(a.title || 'تنبيه') + '</h2><p>' + esc(a.body || '') + '</p>' +
    (ALERT.q.length ? '<div class="al-more">+ ' + ALERT.q.length + ' تنبيهات أخرى بانتظارك</div>' : '') +
    '<div class="al-act">' + (a.summary ? '<button class="al-ok" id="al_inbox">فتح صندوق التنبيهات</button>' : '') + (t && eff(t) !== 'done' ? '<button class="al-ok" id="al_done">إنجاز ✓</button>' : '') + (t ? '<button id="al_open">عرض المهمة</button>' : '') + (a.order_id ? '<button class="al-ok" id="al_order">عرض الطلب</button>' : '') + '<button id="al_x">إغلاق</button></div></div>';
  startRing();
  document.getElementById('al_x').onclick = () => { ackAlert(a); nextAlert(); };
  if (document.getElementById('al_inbox')) document.getElementById('al_inbox').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); inboxDialog(); };
  if (t) document.getElementById('al_open').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); S.view = 'board'; render(); taskDialog(S.tasks.find(x => x.id === t.id)); };
  if (a.order_id) document.getElementById('al_order').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); gotoOrder(a.order_id); };
  if (document.getElementById('al_done')) document.getElementById('al_done').onclick = () => { ackAlert(a); moveTask(t.id, 'done'); nextAlert(); };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ALERT.cur) startRing(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'alert') {
      if (m.nid) { if (INBOX.alerted.has(m.nid)) return; INBOX.alerted.add(m.nid); }
      showAlert(m);
    } else if (m.type === 'OPEN_AZKAR_POPUP') {
      showAdhanTasksPopup({ fromExternalNotification: true });
    } else if (m.type === 'SNOOZE_AZKAR') {
      const mins = Number(m.minutes) || 60;
      localStorage.setItem('azkar_snooze_until', String(Date.now() + mins * 60 * 1000));
      if (typeof toast === 'function') toast('تم تأجيل التذكير لمدة ' + mins + ' دقيقة ⏰');
    }
  });
}

// ===== قراءة وكتابة إعدادات التنبيهات الشاملة (مع دعم التعميم الإداري والتحكم الشخصي) =====
const AZKAR_WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const azkarGlobalCfg = () => typeof getGlobalAzkarConfig === 'function'
  ? getGlobalAzkarConfig()
  : {
      enabledForAll: true, lockForStaff: false, scheduleMode: 'interval', frequency: 'daily',
      weekday: 0, times: ['09:00', '15:00', '21:00'], intervalMin: 360,
      taskScope: 'all_incomplete', priorityFilter: 'all', includeForAll: true, includePendingOrders: false,
      maxPopupTasks: 12, popupMode: 'full', externalPush: true, persistentNotif: true, popupOnOpen: true,
      toneStyle: 'adhan_chime', toneVolume: 1.0, ringDurationSec: 15, vibrateEnabled: true,
      voiceEnabled: false, quietHoursEnabled: false, quietStart: '23:00', quietEnd: '07:00', bannerEnabled: true
    };

const isAzkarLockedByAdmin = () => {
  const g = azkarGlobalCfg();
  return !!(g.lockForStaff && !(typeof isAdmin === 'function' && isAdmin()));
};

const azkarReminderOn = () => {
  const g = azkarGlobalCfg();
  if (isAzkarLockedByAdmin()) return true;
  if (g.enabledForAll) return localStorage.getItem('azkar_reminder_on') !== 'off';
  return localStorage.getItem('azkar_reminder_on') === 'on';
};
const azkarScheduleMode = () => (isAzkarLockedByAdmin() ? azkarGlobalCfg().scheduleMode : localStorage.getItem('azkar_schedule_mode')) || azkarGlobalCfg().scheduleMode || 'interval';
const azkarFrequency = () => localStorage.getItem('azkar_frequency') || azkarGlobalCfg().frequency || 'daily';
const azkarWeekday = () => {
  const v = localStorage.getItem('azkar_weekday');
  return v != null && v !== '' ? +v : +(azkarGlobalCfg().weekday || 0);
};
const azkarScheduledTimes = () => {
  try {
    const raw = localStorage.getItem('azkar_times_v1');
    if (raw && !isAzkarLockedByAdmin()) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {}
  return azkarGlobalCfg().times || ['09:00', '15:00', '21:00'];
};
const azkarReminderMin = () => {
  if (isAzkarLockedByAdmin()) return +(azkarGlobalCfg().intervalMin || 360);
  return +(localStorage.getItem('azkar_reminder_min') || azkarGlobalCfg().intervalMin || 360);
};
const azkarTaskScope = () => localStorage.getItem('azkar_task_scope') || azkarGlobalCfg().taskScope || 'all_incomplete';
const azkarPriorityFilter = () => localStorage.getItem('azkar_prio_filter') || azkarGlobalCfg().priorityFilter || 'all';
const azkarIncludeForAll = () => {
  const v = localStorage.getItem('azkar_inc_forall');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().includeForAll !== false;
};
const azkarIncludePendingOrders = () => {
  const v = localStorage.getItem('azkar_inc_orders');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().includePendingOrders === true;
};
const azkarMaxPopupTasks = () => +(localStorage.getItem('azkar_max_tasks') || azkarGlobalCfg().maxPopupTasks || 12);
const azkarPopupMode = () => localStorage.getItem('azkar_popup_mode') || azkarGlobalCfg().popupMode || 'full';
const azkarExternalPushOn = () => {
  const v = localStorage.getItem('azkar_ext_push');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().externalPush !== false;
};
const azkarPersistentNotifOn = () => {
  const v = localStorage.getItem('azkar_persist_notif');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().persistentNotif !== false;
};
const azkarPopupOnOpen = () => {
  const v = localStorage.getItem('azkar_popup_on_open');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().popupOnOpen !== false;
};
const azkarToneStyle = () => localStorage.getItem('azkar_tone_style') || azkarGlobalCfg().toneStyle || 'adhan_chime';
const azkarToneVolume = () => {
  const v = localStorage.getItem('azkar_tone_vol');
  return v != null && v !== '' ? +v : +(azkarGlobalCfg().toneVolume != null ? azkarGlobalCfg().toneVolume : 1.0);
};
const azkarRingDurationSec = () => {
  const v = localStorage.getItem('azkar_ring_sec');
  return v != null && v !== '' ? +v : +(azkarGlobalCfg().ringDurationSec != null ? azkarGlobalCfg().ringDurationSec : 15);
};
const azkarVibrateOn = () => {
  const v = localStorage.getItem('azkar_vibrate');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().vibrateEnabled !== false;
};
const azkarVoiceSettingOn = () => {
  const local = localStorage.getItem('azkar_voice_on');
  if (local === 'on' || local === 'off') return local === 'on';
  return azkarGlobalCfg().voiceEnabled === true;
};
const azkarQuietHoursOn = () => {
  const v = localStorage.getItem('azkar_quiet_on');
  if (v === 'on' || v === 'off') return v === 'on';
  return azkarGlobalCfg().quietHoursEnabled === true;
};
const azkarQuietStart = () => localStorage.getItem('azkar_quiet_start') || azkarGlobalCfg().quietStart || '23:00';
const azkarQuietEnd = () => localStorage.getItem('azkar_quiet_end') || azkarGlobalCfg().quietEnd || '07:00';

function isQuietHoursActiveNow() {
  if (!azkarQuietHoursOn()) return false;
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();
  const sParts = String(azkarQuietStart() || '23:00').split(':');
  const eParts = String(azkarQuietEnd() || '07:00').split(':');
  const startM = (+sParts[0] || 0) * 60 + (+sParts[1] || 0);
  const endM = (+eParts[0] || 0) * 60 + (+eParts[1] || 0);
  if (startM === endM) return false;
  if (startM < endM) return curMins >= startM && curMins < endM;
  return curMins >= startM || curMins < endM;
}

function formatTimeArabic12h(hhmm) {
  const parts = String(hhmm || '09:00').split(':');
  const h24 = +parts[0] || 0;
  const m = String(parts[1] || '00').padStart(2, '0');
  const period = h24 >= 12 ? 'مساءً' : 'صباحاً';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ':' + m + ' ' + period;
}

function formatDurationArabic(mins) {
  const m = Math.max(1, +mins || 360);
  if (m < 60) return 'كل ' + m + ' دقيقة';
  const h = m / 60;
  if (h === 1) return 'كل ساعة';
  if (h === 2) return 'كل ساعتين';
  if (h >= 3 && h <= 10) return 'كل ' + h + ' ساعات';
  return 'كل ' + h + ' ساعة';
}

function getNextReminderEtaText() {
  if (!azkarReminderOn()) return 'متوقف حالياً';
  const snoozeUntil = +(localStorage.getItem('azkar_snooze_until') || 0);
  if (snoozeUntil > Date.now()) {
    const remMin = Math.ceil((snoozeUntil - Date.now()) / 60000);
    return 'مؤجّل (غفوة) — ينطلق بعد ' + remMin + ' دقيقة';
  }
  const mode = azkarScheduleMode();
  if (mode === 'interval') {
    const minMs = Math.max(15, azkarReminderMin()) * 60 * 1000;
    const lastPush = +(localStorage.getItem('azkar_last_fcm_ts') || 0);
    if (!lastPush) return 'جاهز للانطلاق فوراً (' + formatDurationArabic(azkarReminderMin()) + ')';
    const nextTs = lastPush + minMs;
    const diffMin = Math.max(0, Math.ceil((nextTs - Date.now()) / 60000));
    if (diffMin === 0) return 'حان موعد التذكير الآن';
    if (diffMin < 60) return 'بعد ' + diffMin + ' دقيقة (' + formatDurationArabic(azkarReminderMin()) + ')';
    const hrs = Math.floor(diffMin / 60), mins = diffMin % 60;
    return 'بعد ' + hrs + ' ساعة' + (mins ? ' و ' + mins + ' د' : '') + ' (' + formatDurationArabic(azkarReminderMin()) + ')';
  }
  if (mode === 'once_daily') return 'مرة واحدة يومياً عند فتح النظام';
  const times = azkarScheduledTimes();
  return 'في الساعات المحددة: ' + times.map(formatTimeArabic12h).join(' ، ');
}

// ===== تجميع المهام الناقصة للمستخدم بحسب الفلاتر المحددة في الإعدادات =====
function collectMyIncompleteTasks(scopeOverride, prioOverride, includeForAllOverride) {
  const td = typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const scope = scopeOverride || azkarTaskScope();
  const prio = prioOverride || azkarPriorityFilter();
  const incAll = includeForAllOverride !== undefined ? includeForAllOverride : azkarIncludeForAll();

  const rawMyTasks = (S.tasks || []).filter(t => {
    if (!t) return false;
    const isMine = typeof mine === 'function' ? mine(t) : (t.for_all || (S.me && same(t.assignee_email, S.me.email)));
    if (!isMine) return false;
    if (t.for_all && !incAll) return false;
    const st = typeof eff === 'function' ? eff(t) : t.status;
    if (st === 'done') return false;
    if (prio === 'important_urgent') {
      const p = typeof getPrio === 'function' ? getPrio(t) : (t.priority || 'normal');
      if (p !== 'urgent' && p !== 'important' && p !== 'high') return false;
    }
    return true;
  });

  const lateTasks = rawMyTasks.filter(t => t.due_on && t.due_on < td);
  const todayTasks = rawMyTasks.filter(t => t.due_on && t.due_on === td);
  const otherIncomplete = rawMyTasks.filter(t => !t.due_on || t.due_on > td);

  let targetTasks = [];
  if (scope === 'late_only') {
    targetTasks = lateTasks;
  } else if (scope === 'late_and_today') {
    targetTasks = lateTasks.concat(todayTasks);
  } else {
    // all_incomplete (الافتراضي: كل المهام الناقصة مرتبة بالأهمية والتأخير)
    targetTasks = lateTasks.concat(todayTasks).concat(otherIncomplete);
  }

  let pendingOrders = [];
  if (azkarIncludePendingOrders() && Array.isArray(S.orders)) {
    pendingOrders = S.orders.filter(o => o && !['delivered', 'cancelled', 'returned', 'تم التسليم', 'ملغي'].includes(String(o.status || '').toLowerCase()));
  }

  return {
    td,
    lateTasks,
    todayTasks,
    otherIncomplete,
    allIncomplete: rawMyTasks,
    targetTasks,
    pendingOrders
  };
}

function getClientFiredSlots() {
  try { return JSON.parse(localStorage.getItem('azkar_fired_slots_v1') || '{}') || {}; } catch (e) { return {}; }
}
function markClientSlotFired(slotKey) {
  if (!slotKey) return;
  const map = getClientFiredSlots();
  map[slotKey] = Date.now();
  const cutoff = Date.now() - 7 * 864e5;
  Object.keys(map).forEach(k => { if (map[k] < cutoff) delete map[k]; });
  try { localStorage.setItem('azkar_fired_slots_v1', JSON.stringify(map)); } catch (e) {}
}

// فحص ما إذا كان قد حان موعد التنبيه حسب الجدول المحدد (كل 6 ساعات افتراضياً أو حسب الساعات)
function checkClientScheduleSlotDue() {
  if (isQuietHoursActiveNow()) return null;
  const mode = azkarScheduleMode();
  const now = new Date();
  const ymdStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const fired = getClientFiredSlots();

  if (mode === 'once_daily') {
    const k = 'daily_' + ymdStr;
    return fired[k] ? null : k;
  }
  if (mode === 'interval') {
    const minMs = Math.max(15, azkarReminderMin()) * 60 * 1000;
    const lastPush = +(localStorage.getItem('azkar_last_fcm_ts') || 0);
    if (Date.now() - lastPush >= minMs) return 'int_' + Math.floor(Date.now() / minMs);
    return null;
  }
  // scheduled (في أوقات وساعات محددة)
  const freq = azkarFrequency();
  const day = now.getDay();
  if (freq === 'workdays' && day === 5) return null; // الجمعة إجازة
  if (freq === 'weekly' && day !== azkarWeekday()) return null;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const times = azkarScheduledTimes();
  for (const tStr of times) {
    const parts = String(tStr || '').split(':');
    if (parts.length !== 2) continue;
    const slotMins = (+parts[0]) * 60 + (+parts[1]);
    if (nowMins >= slotMins && nowMins <= slotMins + 25) {
      const slotKey = ymdStr + '_' + tStr;
      if (!fired[slotKey]) return slotKey;
    }
  }
  return null;
}

// ===== الشاشة المنبثقة الشاملة للمهام الناقصة (بأسلوب تطبيق الأذان) =====
function showAdhanTasksPopup(opts = {}) {
  const stats = collectMyIncompleteTasks();
  const list = stats.targetTasks.slice(0, azkarMaxPopupTasks());
  const totalIncomplete = stats.allIncomplete.length;
  const lateCnt = stats.lateTasks.length;
  const todayCnt = stats.todayTasks.length;
  const otherCnt = stats.otherIncomplete.length;
  const ordCnt = stats.pendingOrders.length;

  let modal = document.getElementById('azkar_adhan_modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'azkar_adhan_modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
  }

  if (!document.getElementById('azk_adhan_style')) {
    const st = document.createElement('style');
    st.id = 'azk_adhan_style';
    st.textContent = `
      #azkar_adhan_modal {
        position: fixed; inset: 0; z-index: 9999999;
        background: rgba(6, 12, 26, 0.86);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 14px; direction: rtl; font-family: Tajawal, sans-serif;
        animation: azkFadeIn .25s ease-out;
      }
      @keyframes azkFadeIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
      @keyframes azkPulseGlow {
        0%, 100% { box-shadow: 0 0 0 0 rgba(212, 175, 106, 0.55), 0 22px 60px rgba(0,0,0,0.65); }
        50% { box-shadow: 0 0 0 12px rgba(212, 175, 106, 0), 0 22px 60px rgba(0,0,0,0.65); }
      }
      .azk-adhan-card {
        width: 100%; max-width: 560px; max-height: 92vh;
        background: linear-gradient(165deg, #0b1528 0%, #132544 55%, #0d1b33 100%);
        color: #f8fafc; border: 2px solid #d4af6a; border-radius: 24px;
        display: flex; flex-direction: column; overflow: hidden;
        animation: azkPulseGlow 2.8s infinite;
      }
      .azk-adhan-top {
        background: radial-gradient(circle at top center, rgba(212,175,106,0.28) 0%, rgba(11,21,40,0.1) 70%);
        padding: 18px 18px 14px; border-bottom: 1px solid rgba(212,175,106,0.3);
        text-align: center; position: relative;
      }
      .azk-adhan-dome {
        width: 64px; height: 64px; margin: 0 auto 8px; border-radius: 20px;
        background: linear-gradient(135deg, rgba(212,175,106,0.28), rgba(212,175,106,0.08));
        border: 1.5px solid #d4af6a; display: flex; align-items: center; justify-content: center;
        font-size: 32px; box-shadow: 0 8px 20px rgba(0,0,0,0.35);
      }
      .azk-adhan-stats {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px;
      }
      .azk-stat-box {
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 8px 6px; text-align: center;
      }
      .azk-stat-box b { display: block; font-size: 20px; line-height: 1.2; }
      .azk-stat-box span { font-size: 11.5px; color: #cbd5e1; }
      .azk-adhan-body {
        padding: 14px 16px; overflow-y: auto; flex: 1;
      }
      .azk-task-item {
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
        border-right: 4px solid #d4af6a; border-radius: 14px;
        padding: 10px 12px; margin-bottom: 9px;
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        transition: all .2s ease;
      }
      .azk-task-item.late { border-right-color: #ef4444; background: rgba(239,68,68,0.09); }
      .azk-task-item.today { border-right-color: #f59e0b; background: rgba(245,158,11,0.09); }
      .azk-adhan-foot {
        padding: 12px 16px; background: rgba(7, 13, 25, 0.75);
        border-top: 1px solid rgba(255,255,255,0.12);
        display: flex; flex-direction: column; gap: 8px;
      }
    `;
    document.head.appendChild(st);
  }

  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const timeAr = formatTimeArabic12h(hhmm);
  const userName = (S.me && S.me.name) || 'زميلنا العزيز';
  const schedBadge = azkarScheduleMode() === 'interval'
    ? ('🔁 تنبيه دوري ' + formatDurationArabic(azkarReminderMin()))
    : ('🕘 تنبيه مجدول (' + timeAr + ')');

  const renderTasksListHtml = () => {
    const curStats = collectMyIncompleteTasks();
    const curList = curStats.targetTasks.slice(0, azkarMaxPopupTasks());
    if (!curList.length) {
      return '<div style="text-align:center;padding:28px 14px;background:rgba(22,163,74,0.12);border:1px dashed rgba(34,197,94,0.45);border-radius:16px">' +
        '<div style="font-size:38px;margin-bottom:6px">🎉</div>' +
        '<b style="font-size:16px;color:#4ade80;display:block">ما شاء الله! لا توجد لديك أي مهام ناقصة حالياً</b>' +
        '<span style="font-size:12.5px;color:#cbd5e1;margin-top:4px;display:block">جميع مهامك المجدولة مكتملة بنجاح.</span>' +
      '</div>';
    }
    return curList.map(t => {
      const isLate = t.due_on && t.due_on < curStats.td;
      const isToday = t.due_on && t.due_on === curStats.td;
      const cls = isLate ? 'late' : (isToday ? 'today' : '');
      const dueBadge = isLate
        ? '<span style="background:rgba(239,68,68,.22);color:#fca5a5;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:700">🚨 متأخرة (' + esc(t.due_on) + ')</span>'
        : isToday
          ? '<span style="background:rgba(245,158,11,.22);color:#fde68a;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:700">🔥 مستحقة اليوم</span>'
          : (t.due_on ? '<span style="background:rgba(148,163,184,.18);color:#cbd5e1;padding:2px 7px;border-radius:6px;font-size:11px">📅 ' + esc(t.due_on) + '</span>' : '<span style="background:rgba(56,189,248,.16);color:#bae6fd;padding:2px 7px;border-radius:6px;font-size:11px">📋 غير مكتملة</span>');
      const stBadge = t.status === 'doing'
        ? '<span style="background:rgba(59,130,246,.22);color:#93c5fd;padding:2px 7px;border-radius:6px;font-size:11px">⚡ قيد العمل</span>'
        : '';
      return '<div class="azk-task-item ' + cls + '" data-azk-row="' + esc(t.id) + '">' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-weight:700;font-size:14px;color:#fff;margin-bottom:4px;line-height:1.4">' + esc(t.title) + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
            dueBadge + stBadge +
            (t.for_all ? '<span style="font-size:10.5px;color:#cbd5e1">👥 عامة للفريق</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<button type="button" data-azk-done="' + esc(t.id) + '" style="padding:7px 11px;border-radius:10px;border:0;background:#16a34a;color:#fff;font:700 12px Tajawal;cursor:pointer;white-space:nowrap" title="إنجاز المهمة فوراً">✅ إنجاز</button>' +
          '<button type="button" data-azk-open="' + esc(t.id) + '" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#f8fafc;font:600 12px Tajawal;cursor:pointer" title="فتح تفاصيل المهمة">👁️</button>' +
        '</div>' +
      '</div>';
    }).join('');
  };

  modal.innerHTML =
    '<div class="azk-adhan-card">' +
      '<div class="azk-adhan-top">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:11.5px;background:rgba(212,175,106,0.2);border:1px solid rgba(212,175,106,0.45);color:#f6e3a8;padding:3px 10px;border-radius:99px;font-weight:700">' + esc(schedBadge) + '</span>' +
          '<div style="display:flex;gap:6px">' +
            '<button type="button" id="azk_pop_mute" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#f8fafc;padding:4px 10px;border-radius:99px;font:600 11.5px Tajawal;cursor:pointer">🔇 كتم الصوت</button>' +
            '<button type="button" id="azk_pop_close_top" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#cbd5e1;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="azk-adhan-dome">🕌</div>' +
        '<div style="font-size:12px;color:#f6e3a8;font-weight:700;letter-spacing:.3px">⏰ حان وقت متابعة المهام الناقصة · ' + esc(timeAr) + '</div>' +
        '<h2 style="margin:4px 0 4px;font-size:19px;color:#fff">تذكير المهام غير المنجزة — ' + esc(userName) + '</h2>' +
        '<div style="font-size:12.5px;color:#cbd5e1">راجع مهامك الناقصة وأنجزها مباشرة من هذه الشاشة أو انتقل للوحة العمل</div>' +
        '<div class="azk-adhan-stats">' +
          '<div class="azk-stat-box" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.12)">' +
            '<b id="azk_st_late" style="color:#f87171">' + lateCnt + '</b>' +
            '<span>🚨 مهام متأخرة</span>' +
          '</div>' +
          '<div class="azk-stat-box" style="border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12)">' +
            '<b id="azk_st_today" style="color:#fbbf24">' + todayCnt + '</b>' +
            '<span>🔥 مستحقة اليوم</span>' +
          '</div>' +
          '<div class="azk-stat-box" style="border-color:rgba(56,189,248,.4);background:rgba(56,189,248,.12)">' +
            '<b id="azk_st_total" style="color:#38bdf8">' + totalIncomplete + '</b>' +
            '<span>📋 إجمالي الناقصة</span>' +
          '</div>' +
        '</div>' +
        (ordCnt > 0 ? '<div style="margin-top:8px;padding:5px 10px;border-radius:10px;background:rgba(212,175,106,.16);color:#f6e3a8;font-size:12px;font-weight:700">🛒 لديك أيضاً (' + ordCnt + ') طلبات معلقة قيد المتابعة</div>' : '') +
      '</div>' +
      '<div class="azk-adhan-body" id="azk_pop_list">' +
        renderTasksListHtml() +
      '</div>' +
      '<div class="azk-adhan-foot">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" id="azk_pop_board" style="flex:2 1 180px;padding:10px 14px;border-radius:12px;border:1px solid #d4af6a;background:linear-gradient(135deg,#d4af6a,#b58938);color:#0b1426;font:800 13.5px Tajawal;cursor:pointer">📋 فتح لوحة جميع المهام الناقصة</button>' +
          '<button type="button" id="azk_pop_settings" style="flex:1 1 120px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#e2e8f0;font:700 12.5px Tajawal;cursor:pointer">⚙️ إعدادات التنبيه</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:space-between">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;flex:1">' +
            '<button type="button" data-azk-snooze="30" style="flex:1;padding:7px 8px;border-radius:9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#cbd5e1;font:600 11.5px Tajawal;cursor:pointer">⏰ غفوة 30 د</button>' +
            '<button type="button" data-azk-snooze="60" style="flex:1;padding:7px 8px;border-radius:9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#cbd5e1;font:600 11.5px Tajawal;cursor:pointer">⏰ غفوة ساعة</button>' +
            '<button type="button" data-azk-snooze="180" style="flex:1;padding:7px 8px;border-radius:9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#cbd5e1;font:600 11.5px Tajawal;cursor:pointer">⏰ غفوة 3 ساعات</button>' +
          '</div>' +
          '<button type="button" id="azk_pop_dismiss" style="padding:7px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;font:700 12px Tajawal;cursor:pointer">تأكيد وإغلاق ✓</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const closePopup = () => {
    stopAdhanPopupRing();
    if (modal) modal.remove();
  };

  const bindTaskRows = () => {
    modal.querySelectorAll('[data-azk-done]').forEach(btn => {
      btn.onclick = async () => {
        const tid = btn.getAttribute('data-azk-done');
        stopAdhanPopupRing();
        btn.disabled = true;
        btn.textContent = '✓ تم';
        if (typeof moveTask === 'function') {
          await moveTask(tid, 'done');
        }
        const newStats = collectMyIncompleteTasks();
        if (document.getElementById('azk_st_late')) document.getElementById('azk_st_late').textContent = String(newStats.lateTasks.length);
        if (document.getElementById('azk_st_today')) document.getElementById('azk_st_today').textContent = String(newStats.todayTasks.length);
        if (document.getElementById('azk_st_total')) document.getElementById('azk_st_total').textContent = String(newStats.allIncomplete.length);
        if (document.getElementById('azk_pop_list')) {
          document.getElementById('azk_pop_list').innerHTML = renderTasksListHtml();
          bindTaskRows();
        }
        syncOverdueDigestToSw();
        if (typeof toast === 'function') toast('تم إنجاز المهمة بنجاح ✅');
      };
    });

    modal.querySelectorAll('[data-azk-open]').forEach(btn => {
      btn.onclick = () => {
        const tid = btn.getAttribute('data-azk-open');
        const taskObj = (S.tasks || []).find(x => String(x.id) === String(tid));
        closePopup();
        S.view = 'board';
        render();
        if (taskObj && typeof taskDialog === 'function') taskDialog(taskObj);
      };
    });
  };

  bindTaskRows();

  if (document.getElementById('azk_pop_mute')) {
    document.getElementById('azk_pop_mute').onclick = () => {
      stopAdhanPopupRing();
      document.getElementById('azk_pop_mute').textContent = '🔇 تم كتم الصوت';
    };
  }
  if (document.getElementById('azk_pop_close_top')) document.getElementById('azk_pop_close_top').onclick = closePopup;
  if (document.getElementById('azk_pop_dismiss')) document.getElementById('azk_pop_dismiss').onclick = closePopup;

  if (document.getElementById('azk_pop_board')) {
    document.getElementById('azk_pop_board').onclick = () => {
      closePopup();
      S.view = 'board';
      S.col = 'todo';
      if (S.tf) S.tf.due = lateCnt > 0 ? 'late' : '';
      render();
    };
  }

  if (document.getElementById('azk_pop_settings')) {
    document.getElementById('azk_pop_settings').onclick = () => {
      closePopup();
      S.view = 'set';
      S.settingsSubTab = 'notify';
      render();
    };
  }

  modal.querySelectorAll('[data-azk-snooze]').forEach(btn => {
    btn.onclick = () => {
      const mins = +(btn.getAttribute('data-azk-snooze') || 60);
      localStorage.setItem('azkar_snooze_until', String(Date.now() + mins * 60 * 1000));
      closePopup();
      if (typeof toast === 'function') toast('تم تأجيل التذكير لمدة ' + (mins >= 60 ? (mins / 60) + ' ساعة' : mins + ' دقيقة') + ' ⏰');
    };
  });
}
window.showAdhanTasksPopup = showAdhanTasksPopup;

// ===== شريط الإشعار العلوي المنبثق المصغّر (عند اختيار وضع الشريط العلوي بدلاً من الشاشة الكاملة) =====
function showHeadsUpAzkarBanner(opts) {
  if (!opts) return;
  let el = document.getElementById('azkar_headsup_banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'azkar_headsup_banner';
    document.body.appendChild(el);
  }
  const t = opts.firstTaskId && (S.tasks || []).find(x => x.id === opts.firstTaskId);
  el.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;max-width:500px;margin:0 auto;z-index:999999;background:linear-gradient(135deg,#0d1b30 0%,#172a47 100%);color:#fff;border:2px solid #d4af6a;border-radius:16px;padding:12px 14px;box-shadow:0 14px 36px rgba(0,0,0,.45);direction:rtl;font-family:Tajawal,sans-serif;animation:azkSlideDown .28s cubic-bezier(.16,1,.3,1)';
  if (!document.getElementById('azk_anim_style')) {
    const st = document.createElement('style');
    st.id = 'azk_anim_style';
    st.textContent = '@keyframes azkSlideDown{from{transform:translateY(-120%);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(st);
  }
  const linesHtml = (opts.sample || []).map(s => '<div style="font-size:12.5px;color:#f6e3a8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">• ' + esc(s) + '</div>').join('');
  el.innerHTML =
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">' +
      '<div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1">' +
        '<div style="width:38px;height:38px;border-radius:11px;background:rgba(212,175,106,.2);border:1px solid rgba(212,175,106,.45);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🕌</div>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b style="font-size:14px;color:#fff">' + esc(opts.title || '⏰ تذكير بالمهام الناقصة') + '</b>' +
            '<span style="font-size:10.5px;background:rgba(255,255,255,.12);padding:1px 7px;border-radius:99px;color:#cbd5e1">' + esc(formatDurationArabic(azkarReminderMin())) + '</span>' +
          '</div>' +
          '<div style="font-size:12.5px;color:#e2e8f0;margin-top:3px">' + esc(opts.subtitle || '') + '</div>' +
          linesHtml +
        '</div>' +
      '</div>' +
      '<button type="button" id="azk_bn_x" style="background:transparent;border:0;color:#94a3b8;font-size:18px;padding:0 4px;cursor:pointer;line-height:1">✕</button>' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12);flex-wrap:wrap">' +
      '<button type="button" id="azk_bn_full" style="flex:1;padding:6px 10px;border-radius:9px;border:1px solid #d4af6a;background:rgba(212,175,106,.22);color:#f6e3a8;font:700 12px Tajawal;cursor:pointer">🕌 فتح الشاشة المنبثقة للمهام</button>' +
      (t && (typeof eff === 'function' ? eff(t) !== 'done' : t.status !== 'done')
        ? '<button type="button" id="azk_bn_done" style="flex:1;padding:6px 10px;border-radius:9px;border:0;background:#16a34a;color:#fff;font:700 12px Tajawal;cursor:pointer">✅ إنجاز الأولى</button>'
        : '') +
      '<button type="button" id="azk_bn_snooze" style="padding:6px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#e2e8f0;font:600 11.5px Tajawal;cursor:pointer">⏰ غفوة ساعة</button>' +
    '</div>';

  clearTimeout(el._hideTm);
  el._hideTm = setTimeout(() => { if (el) el.remove(); }, 22000);

  const btnX = document.getElementById('azk_bn_x');
  if (btnX) btnX.onclick = () => el.remove();
  const btnFull = document.getElementById('azk_bn_full');
  if (btnFull) btnFull.onclick = () => {
    el.remove();
    showAdhanTasksPopup();
  };
  const btnSnooze = document.getElementById('azk_bn_snooze');
  if (btnSnooze) btnSnooze.onclick = () => {
    localStorage.setItem('azkar_snooze_until', String(Date.now() + 60 * 60 * 1000));
    el.remove();
    if (typeof toast === 'function') toast('تم تأجيل التذكير لمدة ساعة ⏰');
  };
  const btnDone = document.getElementById('azk_bn_done');
  if (btnDone && t) btnDone.onclick = () => {
    el.remove();
    if (typeof moveTask === 'function') moveTask(t.id, 'done');
  };
}

async function syncOverdueDigestToSw() {
  if (!S.me || !Array.isArray(S.tasks)) return;
  const stats = collectMyIncompleteTasks();
  const sample = stats.targetTasks.slice(0, 5).map(t => t.title);
  const firstId = (stats.targetTasks[0] && stats.targetTasks[0].id) || null;

  const digest = {
    enabled: azkarReminderOn(),
    scheduleMode: azkarScheduleMode(),
    frequency: azkarFrequency(),
    weekday: azkarWeekday(),
    times: azkarScheduledTimes(),
    intervalMin: azkarReminderMin(),
    taskScope: azkarTaskScope(),
    firedSlots: getClientFiredSlots(),
    lateCount: stats.lateTasks.length,
    todayCount: stats.todayTasks.length,
    incompleteCount: stats.targetTasks.length,
    totalIncompleteCount: stats.allIncomplete.length,
    titles: sample,
    firstTaskId: firstId,
    quietHoursEnabled: azkarQuietHoursOn(),
    quietStart: azkarQuietStart(),
    quietEnd: azkarQuietEnd(),
    updatedAt: Date.now()
  };

  try {
    if (window.AndroidApp && typeof window.AndroidApp.syncDigest === 'function') {
      window.AndroidApp.syncDigest(JSON.stringify(digest));
    }
    if (typeof syncNativeAndroidAuth === 'function') {
      syncNativeAndroidAuth();
    }
  } catch (e) {}

  try {
    if (typeof idbGet === 'function' && typeof idbSet === 'function') {
      const prev = (await idbGet('overdue_digest')) || {};
      await idbSet('overdue_digest', Object.assign({}, prev, digest));
    }
  } catch (e) {}

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.active) {
        reg.active.postMessage({ type: 'SYNC_OVERDUE_DIGEST', digest });
      }
      if (reg && 'periodicSync' in reg && azkarReminderOn()) {
        await reg.periodicSync.register('overdue-tasks-reminder', {
          minInterval: Math.max(30, azkarReminderMin()) * 60 * 1000
        }).catch(() => {});
      }
    } catch (e) {}
  }
}

// إرسال إشعار جوال خارجي حقيقي (Web Push) عبر /api/remind ليوقظ الجوال حتى والتطبيق مغلق
async function sendExternalRemindPush(title, body, firstTaskId, isTest = false, teamSlot = '') {
  if (!S.me || !S.me.email || !navigator.onLine) return false;
  try {
    const token = typeof tok === 'function' ? await tok() : '';
    const r = await fetch('/api/remind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        self: !teamSlot,
        test: !!isTest,
        team_slot: teamSlot || undefined,
        title: title || '🕌 تذكير بالمهام الناقصة',
        body: body || 'لديك مهام غير منجزة تحتاج متابعة في النظام',
        task_id: firstTaskId || undefined
      })
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function triggerAzkarCheckNow(forceTest, delayMs = 0, modeOpt = 'auto') {
  await syncOverdueDigestToSw();
  const snoozeUntil = +(localStorage.getItem('azkar_snooze_until') || 0);
  if (!forceTest && snoozeUntil > Date.now()) return;
  if (!forceTest && isQuietHoursActiveNow()) return;

  const stats = collectMyIncompleteTasks();
  const lateTasks = stats.lateTasks;
  const todayTasks = stats.todayTasks;
  const targetTasks = stats.targetTasks;
  const sample = targetTasks.slice(0, 4).map(t => t.title);
  const firstId = (targetTasks[0] && targetTasks[0].id) || null;

  let dueSlotKey = null;
  if (!forceTest) {
    if (targetTasks.length === 0 && stats.pendingOrders.length === 0) return;
    dueSlotKey = checkClientScheduleSlotDue();
    if (!dueSlotKey) return;
    markClientSlotFired(dueSlotKey);
    localStorage.setItem('azkar_last_fcm_ts', String(Date.now()));
    await syncOverdueDigestToSw();
  }

  const pTitle = lateTasks.length > 0
    ? ('🕌 تذكير: لديك ' + targetTasks.length + ' مهام ناقصة (' + lateTasks.length + ' متأخرة)')
    : targetTasks.length > 0
      ? ('🕌 تذكير دوري: لديك ' + targetTasks.length + ' مهام غير منجزة')
      : '🕌 تذكير المهام الناقصة (بأسلوب الأذان)';

  const subtitle = targetTasks.length > 0
    ? ('يا ' + ((S.me && S.me.name) || '') + '، هذه قائمة بمهامك الناقصة بانتظار الإنجاز:')
    : 'وصلك هذا التذكير الدوري بنجاح حسب إعداداتك!';

  const pBody = sample.length
    ? ('• ' + sample.join('\n• ') + (targetTasks.length > sample.length ? '\n+ ' + (targetTasks.length - sample.length) + ' مهام أخرى...' : ''))
    : subtitle;

  const voiceMsg = targetTasks.length > 0
    ? ('تذكير من مدير المهام: لديك ' + targetTasks.length + ' مهام غير منجزة' + (lateTasks.length > 0 ? ' منها ' + lateTasks.length + ' متأخرة' : ''))
    : 'تذكير دوري بالمهام المستحقة';

  const fireNow = async () => {
    // 1) إشعار خارجي على شاشة الهاتف (في شريط الإشعارات العلوي وشاشة القفل)
    if (azkarExternalPushOn() || forceTest) {
      postSystemNotification(pTitle, pBody, {
        tag: 'azkar-overdue-remind',
        forceExternal: !!forceTest,
        actions: [
          { action: 'open_popup', title: '🕌 شاشة المهام الناقصة' },
          ...(firstId ? [{ action: 'done', title: '✅ إنجاز الأولى' }] : []),
          { action: 'snooze', title: '⏰ غفوة ساعة' }
        ],
        data: { url: '/?azkar_popup=1', open_azkar_popup: true, task_id: firstId, task_title: sample[0] || '' }
      });
    }

    // 2) نغمة الأذان/التنبيه والاهتزاز والقراءة الصوتية
    playBackgroundAzkarToneAndVoice(azkarVoiceSettingOn() ? voiceMsg : '');

    // 3) إظهار الشاشة المنبثقة الشاملة كالأذان (أو الشريط العلوي حسب اختيار المستخدم في الإعدادات)
    const pMode = modeOpt !== 'auto' ? modeOpt : azkarPopupMode();
    if (!document.hidden || forceTest) {
      if (pMode === 'full') {
        showAdhanTasksPopup();
      } else if (pMode === 'banner') {
        showHeadsUpAzkarBanner({
          title: pTitle,
          subtitle,
          sample,
          firstTaskId: firstId,
          lateCount: lateTasks.length,
          todayCount: todayTasks.length
        });
      }
    } else {
      // إذا كان التطبيق في الخلفية وحان وقت التنبيه، نحفظ علامة ليفتح الشاشة المنبثقة فور عودة المستخدم للتطبيق
      localStorage.setItem('azkar_pending_popup', '1');
    }

    // 4) إرسال Web Push خارجي للخادم ليوقظ الهاتف من الخارج
    if ((dueSlotKey || forceTest) && navigator.onLine && (azkarExternalPushOn() || forceTest)) {
      sendExternalRemindPush(pTitle, pBody, firstId, !!forceTest, dueSlotKey || '');
    }
  };

  if (delayMs > 0) setTimeout(fireNow, delayMs);
  else await fireNow();
}

let _azkarWorker = null;
let _keepAliveLockHeld = false;
let _wakeLockObj = null;

async function acquireScreenAndBackgroundKeepAlive() {
  if (!_keepAliveLockHeld) {
    try {
      if (navigator.locks && navigator.locks.request) {
        _keepAliveLockHeld = true;
        navigator.locks.request('matjark_azkar_keep_alive', { mode: 'shared' }, () => new Promise(() => {})).catch(() => { _keepAliveLockHeld = false; });
      }
    } catch (e) {}
  }
  try {
    if ('wakeLock' in navigator && !_wakeLockObj && !document.hidden) {
      _wakeLockObj = await navigator.wakeLock.request('screen').catch(() => null);
      if (_wakeLockObj) {
        _wakeLockObj.addEventListener('release', () => { _wakeLockObj = null; });
      }
    }
  } catch (e) {}
}

function checkUrlOrPendingPopupTrigger() {
  try {
    const u = new URL(location.href);
    const hasParam = u.searchParams.get('azkar_popup') === '1';
    const hasPending = localStorage.getItem('azkar_pending_popup') === '1';
    if (hasParam || (hasPending && azkarPopupOnOpen())) {
      localStorage.removeItem('azkar_pending_popup');
      if (hasParam) {
        u.searchParams.delete('azkar_popup');
        history.replaceState({}, '', u.pathname + (u.search ? u.search : '') + u.hash);
      }
      setTimeout(() => {
        showAdhanTasksPopup({ fromExternalNotification: true });
      }, 450);
      return true;
    }
  } catch (e) {}
  return false;
}

function startAzkarReminderEngine() {
  syncOverdueDigestToSw();
  acquireScreenAndBackgroundKeepAlive();

  const openedFromNotif = checkUrlOrPendingPopupTrigger();

  if (!S._initialAzkarChecked) {
    S._initialAzkarChecked = true;
    setTimeout(() => {
      if (!openedFromNotif && azkarReminderOn()) {
        triggerAzkarCheckNow(false, 0, 'auto');
      }
    }, 3500);
  }

  if (_azkarWorker) return;
  try {
    const workerCode = `
      let timer = setInterval(() => { postMessage('tick'); }, 30000);
      onmessage = e => {
        if (e.data === 'ping') postMessage('tick');
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    _azkarWorker = new Worker(URL.createObjectURL(blob));
    _azkarWorker.onmessage = () => {
      if (azkarReminderOn()) triggerAzkarCheckNow(false, 0, 'auto');
    };
  } catch (e) {
    setInterval(() => {
      if (azkarReminderOn()) triggerAzkarCheckNow(false, 0, 'auto');
    }, 30000);
  }

  document.addEventListener('visibilitychange', () => {
    syncOverdueDigestToSw();
    if (!document.hidden) {
      acquireScreenAndBackgroundKeepAlive();
      if (checkUrlOrPendingPopupTrigger()) return;
    }
    if (azkarReminderOn()) {
      startSilentAudioKeepAlive();
      triggerAzkarCheckNow(false, 0, 'auto');
    }
  });
}

// ===== واجهة إعدادات التنبيهات الشاملة والمطوّرة في الإعدادات =====
function alertSettingsHtml() {
  const isOn = azkarReminderOn();
  const vOn = azkarVoiceSettingOn();
  const mode = azkarScheduleMode();
  const freq = azkarFrequency();
  const wd = azkarWeekday();
  const times = azkarScheduledTimes();
  const minVal = azkarReminderMin();
  const scope = azkarTaskScope();
  const prio = azkarPriorityFilter();
  const incAll = azkarIncludeForAll();
  const incOrd = azkarIncludePendingOrders();
  const maxTasks = azkarMaxPopupTasks();
  const popMode = azkarPopupMode();
  const extPush = azkarExternalPushOn();
  const persistNotif = azkarPersistentNotifOn();
  const popOnOpen = azkarPopupOnOpen();
  const toneStyle = azkarToneStyle();
  const toneVol = azkarToneVolume();
  const ringSec = azkarRingDurationSec();
  const vibOn = azkarVibrateOn();
  const quietOn = azkarQuietHoursOn();
  const quietS = azkarQuietStart();
  const quietE = azkarQuietEnd();

  const gCfg = azkarGlobalCfg();
  const adm = typeof isAdmin === 'function' && isAdmin();
  const locked = isAzkarLockedByAdmin();
  const disAttr = locked ? ' disabled' : '';

  const stats = collectMyIncompleteTasks();
  const permStatus = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const isAndroidApk = typeof window.AndroidApp !== 'undefined' && !!window.AndroidApp;

  const intervals = [
    [30, 'كل 30 دقيقة'],
    [60, 'كل ساعة (1 س)'],
    [120, 'كل ساعتين (2 س)'],
    [180, 'كل 3 ساعات'],
    [240, 'كل 4 ساعات'],
    [360, 'كل 6 ساعات ⭐ (الافتراضي كالأذان)'],
    [480, 'كل 8 ساعات'],
    [720, 'كل 12 ساعة (مرتين يومياً)'],
    [1440, 'كل 24 ساعة (يومياً)']
  ];

  const presetChips = [60, 180, 360, 720].map(m => {
    const active = mode === 'interval' && minVal === m;
    const lbl = m === 60 ? 'كل ساعة' : m === 180 ? 'كل 3 ساعات' : m === 360 ? '⭐ كل 6 ساعات' : 'كل 12 ساعة';
    return '<button type="button" class="s' + (active ? ' p' : '') + '" data-azk-preset-min="' + m + '"' + disAttr + ' style="border-radius:99px;padding:5px 12px;font-size:12px">' + lbl + '</button>';
  }).join('');

  const timesBadgesHtml = times.map(t =>
    '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:13px;background:var(--card);border:1px solid var(--gold,#c9a24e)">' +
      '⏰ <b>' + esc(formatTimeArabic12h(t)) + '</b> <small class="m">(' + esc(t) + ')</small>' +
      (times.length > 1 && !locked ? '<button type="button" class="s dng" data-rm-azktime="' + esc(t) + '" style="padding:1px 6px;font-size:11px;border-radius:6px" title="حذف هذا الوقت">✕</button>' : '') +
    '</span>'
  ).join(' ');

  const permBadgeHtml = isAndroidApk
    ? '<span class="chip ok">🤖 تطبيق أندرويد APK متصل (100%)</span>'
    : permStatus === 'granted'
      ? '<span class="chip ok">✅ إشعارات الجوال مفعّلة</span>'
      : permStatus === 'denied'
        ? '<span class="chip late">🚫 الإشعارات محظورة من المتصفح</span>'
        : '<span class="chip pr-chip important">⚠️ بانتظار التفعيل</span>';

  return (
    // 1) بطاقة لوحة الحالة الحية وأزرار المعاينة الفورية
    '<div class="card" style="margin-bottom:14px;border:2px solid var(--gold,#c9a24e);background:linear-gradient(145deg,var(--card),var(--col))">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:44px;height:44px;border-radius:14px;background:rgba(212,175,106,.18);border:1.5px solid var(--gold,#c9a24e);display:flex;align-items:center;justify-content:center;font-size:24px">🕌</div>' +
          '<div>' +
            '<h2 style="margin:0;font-size:16.5px">مركز التحكم الشامل بمنبّه المهام الناقصة (بأسلوب تطبيق الأذان)</h2>' +
            '<div class="m" style="font-size:12px;margin-top:2px">تنبيهات دورية (كل 6 ساعات أو حسب اختيارك) مع شاشة منبثقة شاملة للمهام الناقصة وإشعار خارجي للهاتف</div>' +
          '</div>' +
        '</div>' +
        permBadgeHtml +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px">' +
        '<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px">' +
          '<div class="m" style="font-size:11.5px">🔔 حالة المنبّه الدوري</div>' +
          '<b style="font-size:14px;color:' + (isOn ? 'var(--ok)' : 'var(--late)') + '">' + (isOn ? 'نشط ومفعّل ✓' : 'متوقف حالياً') + '</b>' +
        '</div>' +
        '<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px">' +
          '<div class="m" style="font-size:11.5px">⏳ موعد التذكير القادم</div>' +
          '<b id="azk_eta_lbl" style="font-size:13px;color:var(--gold,#c9a24e)">' + esc(getNextReminderEtaText()) + '</b>' +
        '</div>' +
        '<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px">' +
          '<div class="m" style="font-size:11.5px">📋 مهامك الناقصة الآن</div>' +
          '<b style="font-size:14px">' + stats.allIncomplete.length + ' ناقصة <small class="m">(' + stats.lateTasks.length + ' متأخرة · ' + stats.todayTasks.length + ' اليوم)</small></b>' +
        '</div>' +
      '</div>' +

      '<div class="row" style="gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="p s" id="azk_preview_popup" style="flex:1 1 200px;background:linear-gradient(135deg,#d4af6a,#b58938);border-color:#d4af6a;color:#0b1426;font-weight:800">🕌 معاينة الشاشة المنبثقة (زي الأذان) الآن</button>' +
        '<button type="button" class="p s" id="azk_test_now" style="flex:1 1 190px">📲 إرسال إشعار خارجي للهاتف فوراً</button>' +
        '<button type="button" class="s" id="azk_test_ext" style="flex:1 1 190px">⏳ تجربة من خارج التلفون (بعد 6 ثوانٍ)</button>' +
      '</div>' +
      '<div id="azk_test_status" class="m" style="margin-top:8px;font-weight:700;color:var(--gold,#c9a24e)"></div>' +
    '</div>' +

    // 2) بطاقة التحكم التفصيلي الكامل بالجدولة والشاشة المنبثقة والصوت والفلترة
    '<div class="card" style="margin-bottom:14px">' +
      '<h3>⚙️ التحكم الكامل بتفاصيل التنبيهات الدورية والشاشة المنبثقة</h3>' +
      (locked ? '<div style="background:rgba(212,175,106,.15);border:1px solid var(--gold);padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:12.5px">🔒 <b>تم ضبط وتثبيت هذه الإعدادات مركزياً من قِبل الإدارة لجميع الموظفين.</b> يمكنك معاينة الشاشة المنبثقة أو تجربة الصوت من الأزرار أعلاه.</div>' : '') +

      (adm ? (
        '<div style="background:rgba(212,175,106,.1);border:1.5px solid var(--gold,#c9a24e);padding:10px 12px;border-radius:12px;margin-bottom:12px">' +
          '<div style="font-weight:700;font-size:13.5px;margin-bottom:6px;color:var(--gold,#c9a24e)">👑 صلاحيات التحكم الإداري الشامل (للمدير):</div>' +
          '<div class="row" style="gap:14px;flex-wrap:wrap">' +
            '<label class="chk"><input type="checkbox" id="azk_global_all" ' + (gCfg.enabledForAll ? 'checked' : '') + '> <b>تعميم هذه الإعدادات تلقائياً على جميع الموظفين في كل المتاجر</b></label>' +
            '<label class="chk"><input type="checkbox" id="azk_lock_staff" ' + (gCfg.lockForStaff ? 'checked' : '') + '> <b>🔒 إلزام الموظفين ومنع إيقاف المنبّه من أجهزتهم</b></label>' +
          '</div>' +
        '</div>'
      ) : '') +

      // أ) التفعيل والجدولة الزمنية (كل 6 ساعات أو أوقات محددة)
      '<div class="obox" style="margin-bottom:12px;background:var(--col);padding:12px;border-radius:12px;border:1px solid var(--line)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
          '<label class="chk" style="font-size:14.5px"><input type="checkbox" id="azk_on" ' + (isOn ? 'checked' : '') + disAttr + '> <b>🔔 تفعيل منبّه المهام الناقصة الدوري</b></label>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' + presetChips + '</div>' +
        '</div>' +

        '<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
          '<label style="flex:1 1 240px"><b>1️⃣ نظام توقيت وتكرار التنبيه:</b>' +
            '<select id="azk_mode" style="margin-top:4px"' + disAttr + '>' +
              '<option value="interval"' + (mode === 'interval' ? ' selected' : '') + '>🔁 تكرار دوري بالساعات (الافتراضي: كل 6 ساعات)</option>' +
              '<option value="scheduled"' + (mode === 'scheduled' ? ' selected' : '') + '>🕘 في ساعات وأوقات ثابتة باليوم (مثل مواقيت الأذان)</option>' +
              '<option value="once_daily"' + (mode === 'once_daily' ? ' selected' : '') + '>🌅 مرة واحدة فقط كل يوم</option>' +
            '</select>' +
          '</label>' +

          '<div id="azk_interval_box" style="flex:1 1 220px;' + (mode === 'interval' ? '' : 'display:none;') + '">' +
            '<label><b>⏱️ الفاصل الزمني بين كل تنبيه:</b>' +
              '<select id="azk_min" style="margin-top:4px"' + disAttr + '>' +
                intervals.map(([v, l]) => '<option value="' + v + '"' + (minVal === v ? ' selected' : '') + '>' + l + '</option>').join('') +
              '</select>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div id="azk_sched_box" style="' + (mode === 'scheduled' ? '' : 'display:none;') + 'padding-top:10px;border-top:1px dashed var(--line)">' +
          '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
            '<label style="flex:1 1 180px">🔁 أيام التذكير:' +
              '<select id="azk_freq" style="margin-top:4px"' + disAttr + '>' +
                '<option value="daily"' + (freq === 'daily' ? ' selected' : '') + '>يومياً</option>' +
                '<option value="workdays"' + (freq === 'workdays' ? ' selected' : '') + '>أيام الدوام (السبت – الخميس)</option>' +
                '<option value="weekly"' + (freq === 'weekly' ? ' selected' : '') + '>أسبوعياً (يوم محدد)</option>' +
              '</select>' +
            '</label>' +
            '<label id="azk_wd_wrap" style="flex:1 1 150px;' + (freq === 'weekly' ? '' : 'display:none') + '">📆 يوم الأسبوع:' +
              '<select id="azk_wd" style="margin-top:4px"' + disAttr + '>' +
                AZKAR_WD.map((d, i) => '<option value="' + i + '"' + (wd === i ? ' selected' : '') + '>' + d + '</option>').join('') +
              '</select>' +
            '</label>' +
          '</div>' +
          '<div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
            '<b>🕘 الساعات المحددة لإطلاق التنبيه:</b>' +
            (!locked ? '<button type="button" class="s" id="azk_times_preset6h" style="font-size:11.5px;padding:3px 9px">⚡ ضبط 4 أوقات يومية (كل 6 ساعات: 8ص، 2م، 8م)</button>' : '') +
          '</div>' +
          '<div id="azk_times_list" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + timesBadgesHtml + '</div>' +
          (!locked ? (
            '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">' +
              '<input type="time" id="azk_time_in" value="14:00" style="max-width:160px">' +
              '<button type="button" class="p s" id="azk_time_add">＋ إضافة ساعة للتنبيه</button>' +
            '</div>'
          ) : '') +
        '</div>' +
      '</div>' +

      // ب) طريقة العرض والشاشة المنبثقة وإشعار الهاتف الخارجي
      '<div class="obox" style="margin-bottom:12px;background:var(--col);padding:12px;border-radius:12px;border:1px solid var(--line)">' +
        '<b style="display:block;margin-bottom:8px;font-size:14px">2️⃣ شكل وطريقة ظهور التنبيه (داخل التطبيق وخارج التلفون):</b>' +
        '<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
          '<label style="flex:1 1 240px">طريقة العرض عند حلول الموعد:' +
            '<select id="azk_popup_mode" style="margin-top:4px"' + disAttr + '>' +
              '<option value="full"' + (popMode === 'full' ? ' selected' : '') + '>🕌 شاشة منبثقة شاملة بالمهام الناقصة (زي تطبيق الأذان — موصى به)</option>' +
              '<option value="banner"' + (popMode === 'banner' ? ' selected' : '') + '>📌 شريط إشعار علوي مختصر مع زر فتح الشاشة</option>' +
              '<option value="external_only"' + (popMode === 'external_only' ? ' selected' : '') + '>📲 إشعار خارجي في شريط الهاتف فقط (تفتح الشاشة عند النقر عليه)</option>' +
            '</select>' +
          '</label>' +
          '<label style="flex:1 1 180px">عدد المهام المعروضة في الشاشة المنبثقة:' +
            '<select id="azk_max_tasks" style="margin-top:4px"' + disAttr + '>' +
              '<option value="5"' + (maxTasks === 5 ? ' selected' : '') + '>أهم 5 مهام ناقصة</option>' +
              '<option value="12"' + (maxTasks === 12 ? ' selected' : '') + '>حتى 12 مهمة ناقصة (موصى به)</option>' +
              '<option value="25"' + (maxTasks === 25 ? ' selected' : '') + '>حتى 25 مهمة ناقصة</option>' +
              '<option value="100"' + (maxTasks >= 50 ? ' selected' : '') + '>عرض كل المهام الناقصة</option>' +
            '</select>' +
          '</label>' +
        '</div>' +
        '<div class="row" style="gap:12px;flex-wrap:wrap">' +
          '<label class="chk"><input type="checkbox" id="azk_ext_push" ' + (extPush ? 'checked' : '') + disAttr + '> <span><b>📲 إشعار خارجي على شاشة الهاتف وشاشة القفل</b> (يعمل حتى والتطبيق مغلق)</span></label>' +
          '<label class="chk"><input type="checkbox" id="azk_persist_notif" ' + (persistNotif ? 'checked' : '') + disAttr + '> <span><b>📌 تثبيت الإشعار في شريط الجوال</b> حتى يضغط عليه الموظف</span></label>' +
          '<label class="chk"><input type="checkbox" id="azk_popup_open" ' + (popOnOpen ? 'checked' : '') + disAttr + '> <span><b>🔄 فتح شاشة المهام الناقصة تلقائياً</b> عند النقر على الإشعار الخارجي</span></label>' +
        '</div>' +
      '</div>' +

      // ج) فلترة ونوع المهام المشمولة في التنبيه
      '<div class="obox" style="margin-bottom:12px;background:var(--col);padding:12px;border-radius:12px;border:1px solid var(--line)">' +
        '<b style="display:block;margin-bottom:8px;font-size:14px">3️⃣ تفاصيل ونوع المهام المشمولة في التنبيه:</b>' +
        '<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
          '<label style="flex:1 1 240px">المهام التي يراقبها المنبّه:' +
            '<select id="azk_task_scope" style="margin-top:4px"' + disAttr + '>' +
              '<option value="all_incomplete"' + (scope === 'all_incomplete' ? ' selected' : '') + '>📋 جميع المهام الناقصة (المتأخرة + مهام اليوم + قيد العمل + غير المنجزة)</option>' +
              '<option value="late_and_today"' + (scope === 'late_and_today' ? ' selected' : '') + '>🔥 المهام المتأخرة والمستحقة اليوم فقط</option>' +
              '<option value="late_only"' + (scope === 'late_only' ? ' selected' : '') + '>🚨 المهام المتأخرة فقط</option>' +
            '</select>' +
          '</label>' +
          '<label style="flex:1 1 200px">فلتر الأولوية:' +
            '<select id="azk_prio_filter" style="margin-top:4px"' + disAttr + '>' +
              '<option value="all"' + (prio === 'all' ? ' selected' : '') + '>🌐 جميع الأولويات (العادية والمهمة والعاجلة)</option>' +
              '<option value="important_urgent"' + (prio === 'important_urgent' ? ' selected' : '') + '>⚡ المهام العاجلة والمهمة فقط</option>' +
            '</select>' +
          '</label>' +
        '</div>' +
        '<div class="row" style="gap:14px;flex-wrap:wrap">' +
          '<label class="chk"><input type="checkbox" id="azk_inc_forall" ' + (incAll ? 'checked' : '') + disAttr + '> <span>👥 تضمين المهام العامة الموجهة لكل الفريق</span></label>' +
          '<label class="chk"><input type="checkbox" id="azk_inc_orders" ' + (incOrd ? 'checked' : '') + disAttr + '> <span>🛒 عرض تنبيه بعدد الطلبات المعلقة غير المسلمة</span></label>' +
        '</div>' +
      '</div>' +

      // د) الصوت، النغمة، الاهتزاز، والقراءة الصوتية
      '<div class="obox" style="margin-bottom:12px;background:var(--col);padding:12px;border-radius:12px;border:1px solid var(--line)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
          '<b style="font-size:14px">4️⃣ النغمة والصوت والاهتزاز (تخصيص كامل):</b>' +
          '<button type="button" class="s p" id="azk_test_tone" style="font-size:12px;padding:4px 12px">🔊 تجربة وسماع النغمة المختارة</button>' +
        '</div>' +
        '<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
          '<label style="flex:1 1 200px">🎵 نوع نغمة المنبّه:' +
            '<select id="azk_tone_style" style="margin-top:4px"' + disAttr + '>' +
              '<option value="adhan_chime"' + (toneStyle === 'adhan_chime' ? ' selected' : '') + '>🕌 نغمة تذكير روحانية هادئة (بأسلوب الأذان)</option>' +
              '<option value="classic_bell"' + (toneStyle === 'classic_bell' ? ' selected' : '') + '>🔔 جرس تنبيه كلاسيكي واضح</option>' +
              '<option value="urgent_alarm"' + (toneStyle === 'urgent_alarm' ? ' selected' : '') + '>🚨 رنين منبّه قوي للمهام</option>' +
              '<option value="soft_beep"' + (toneStyle === 'soft_beep' ? ' selected' : '') + '>✨ نبضة خفيفة قصيرة</option>' +
              '<option value="silent"' + (toneStyle === 'silent' ? ' selected' : '') + '>🔇 صامت (بدون نغمة صوتية)</option>' +
            '</select>' +
          '</label>' +
          '<label style="flex:1 1 150px">🔊 مستوى الصوت:' +
            '<select id="azk_tone_vol" style="margin-top:4px"' + disAttr + '>' +
              '<option value="1"' + (toneVol >= 0.9 ? ' selected' : '') + '>100% (مرتفع وواضح)</option>' +
              '<option value="0.65"' + (toneVol >= 0.5 && toneVol < 0.9 ? ' selected' : '') + '>65% (متوسط)</option>' +
              '<option value="0.35"' + (toneVol < 0.5 ? ' selected' : '') + '>35% (هادئ)</option>' +
            '</select>' +
          '</label>' +
          '<label style="flex:1 1 160px">⏱️ مدة رنين المنبّه:' +
            '<select id="azk_ring_sec" style="margin-top:4px"' + disAttr + '>' +
              '<option value="3"' + (ringSec <= 4 ? ' selected' : '') + '>نغمة واحدة قصيرة (3 ثوانٍ)</option>' +
              '<option value="15"' + (ringSec > 4 && ringSec <= 20 ? ' selected' : '') + '>رنين متوسط (15 ثانية)</option>' +
              '<option value="30"' + (ringSec > 20 && ringSec <= 35 ? ' selected' : '') + '>رنين مطوّل (30 ثانية)</option>' +
              '<option value="45"' + (ringSec > 35 ? ' selected' : '') + '>رنين مستمر كالمنبّه (45 ثانية)</option>' +
            '</select>' +
          '</label>' +
        '</div>' +
        '<div class="row" style="gap:14px;flex-wrap:wrap">' +
          '<label class="chk"><input type="checkbox" id="azk_vibrate" ' + (vibOn ? 'checked' : '') + disAttr + '> <span><b>📳 تفعيل اهتزاز الهاتف (Vibration)</b></span></label>' +
          '<label class="chk"><input type="checkbox" id="azk_voice" ' + (vOn ? 'checked' : '') + disAttr + '> <span><b>🗣️ القراءة الصوتية بالعربية</b> (ينطق عدد المهام الناقصة بصوت واضح)</span></label>' +
          '<label class="chk"><input type="checkbox" id="al_snd" ' + (alertSoundOn() ? 'checked' : '') + '> <span>🔔 تفعيل صوت التنبيهات الإدارية الفورية</span></label>' +
        '</div>' +
      '</div>' +

      // هـ) ساعات الهدوء وعدم الإزعاج
      '<div class="obox" style="margin-bottom:12px;background:var(--col);padding:12px;border-radius:12px;border:1px solid var(--line)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
          '<label class="chk"><input type="checkbox" id="azk_quiet_on" ' + (quietOn ? 'checked' : '') + disAttr + '> <b>🌙 تفعيل ساعات الهدوء وعدم الإزعاج (كتم التنبيهات أثناء النوم)</b></label>' +
          (isQuietHoursActiveNow() ? '<span class="chip all">🌙 ساعات الهدوء نشطة الآن</span>' : '') +
        '</div>' +
        '<div id="azk_quiet_box" class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px;' + (quietOn ? '' : 'display:none;') + '">' +
          '<label style="flex:1 1 150px">من الساعة (مساءً):<input type="time" id="azk_quiet_start" value="' + esc(quietS) + '" style="margin-top:4px"' + disAttr + '></label>' +
          '<label style="flex:1 1 150px">إلى الساعة (صباحاً):<input type="time" id="azk_quiet_end" value="' + esc(quietE) + '" style="margin-top:4px"' + disAttr + '></label>' +
        '</div>' +
      '</div>' +

      '<div style="margin-top:12px;padding:12px;border-radius:12px;background:rgba(22,163,74,.1);border:1.5px solid rgba(22,163,74,.4);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div>' +
          '<b style="color:#16a34a;font-size:13.5px">🤖 تطبيق أندرويد المستقل للجوال (APK) — يعمل كمنبّه الأذان 24 ساعة</b>' +
          '<div class="m" style="font-size:12px;margin-top:2px">يعمل في خلفية الهاتف ويفتح شاشة المهام الناقصة المنبثقة حتى لو كان التطبيق مغلقاً تماماً.</div>' +
        '</div>' +
        '<button type="button" class="p s" id="azk_open_apk_dlg" style="background:#16a34a;border-color:#16a34a;color:#fff;font-weight:700">📥 تثبيت تطبيق APK الآن</button>' +
      '</div>' +
    '</div>'
  );
}

function bindAlertSettings() {
  const saveAllSettings = async (overrideTimes) => {
    const mode = $('azk_mode') ? $('azk_mode').value : azkarScheduleMode();
    const freq = $('azk_freq') ? $('azk_freq').value : azkarFrequency();
    const wd = $('azk_wd') ? +$('azk_wd').value : azkarWeekday();
    const times = overrideTimes || azkarScheduledTimes();
    const minVal = $('azk_min') ? +$('azk_min').value : azkarReminderMin();
    const scope = $('azk_task_scope') ? $('azk_task_scope').value : azkarTaskScope();
    const prio = $('azk_prio_filter') ? $('azk_prio_filter').value : azkarPriorityFilter();
    const incAll = $('azk_inc_forall') ? $('azk_inc_forall').checked : azkarIncludeForAll();
    const incOrd = $('azk_inc_orders') ? $('azk_inc_orders').checked : azkarIncludePendingOrders();
    const maxTasks = $('azk_max_tasks') ? +$('azk_max_tasks').value : azkarMaxPopupTasks();
    const popMode = $('azk_popup_mode') ? $('azk_popup_mode').value : azkarPopupMode();
    const extPush = $('azk_ext_push') ? $('azk_ext_push').checked : azkarExternalPushOn();
    const persistNotif = $('azk_persist_notif') ? $('azk_persist_notif').checked : azkarPersistentNotifOn();
    const popOnOpen = $('azk_popup_open') ? $('azk_popup_open').checked : azkarPopupOnOpen();
    const toneStyle = $('azk_tone_style') ? $('azk_tone_style').value : azkarToneStyle();
    const toneVol = $('azk_tone_vol') ? +$('azk_tone_vol').value : azkarToneVolume();
    const ringSec = $('azk_ring_sec') ? +$('azk_ring_sec').value : azkarRingDurationSec();
    const vibOn = $('azk_vibrate') ? $('azk_vibrate').checked : azkarVibrateOn();
    const vOn = $('azk_voice') ? $('azk_voice').checked : azkarVoiceSettingOn();
    const quietOn = $('azk_quiet_on') ? $('azk_quiet_on').checked : azkarQuietHoursOn();
    const quietS = $('azk_quiet_start') ? $('azk_quiet_start').value : azkarQuietStart();
    const quietE = $('azk_quiet_end') ? $('azk_quiet_end').value : azkarQuietEnd();

    localStorage.setItem('azkar_schedule_mode', mode);
    localStorage.setItem('azkar_frequency', freq);
    localStorage.setItem('azkar_weekday', String(wd));
    localStorage.setItem('azkar_times_v1', JSON.stringify(times));
    localStorage.setItem('azkar_reminder_min', String(minVal));
    localStorage.setItem('azkar_task_scope', scope);
    localStorage.setItem('azkar_prio_filter', prio);
    localStorage.setItem('azkar_inc_forall', incAll ? 'on' : 'off');
    localStorage.setItem('azkar_inc_orders', incOrd ? 'on' : 'off');
    localStorage.setItem('azkar_max_tasks', String(maxTasks));
    localStorage.setItem('azkar_popup_mode', popMode);
    localStorage.setItem('azkar_ext_push', extPush ? 'on' : 'off');
    localStorage.setItem('azkar_persist_notif', persistNotif ? 'on' : 'off');
    localStorage.setItem('azkar_popup_on_open', popOnOpen ? 'on' : 'off');
    localStorage.setItem('azkar_tone_style', toneStyle);
    localStorage.setItem('azkar_tone_vol', String(toneVol));
    localStorage.setItem('azkar_ring_sec', String(ringSec));
    localStorage.setItem('azkar_vibrate', vibOn ? 'on' : 'off');
    localStorage.setItem('azkar_voice_on', vOn ? 'on' : 'off');
    localStorage.setItem('azkar_quiet_on', quietOn ? 'on' : 'off');
    localStorage.setItem('azkar_quiet_start', quietS);
    localStorage.setItem('azkar_quiet_end', quietE);

    if (typeof isAdmin === 'function' && isAdmin() && typeof saveGlobalAzkarConfig === 'function') {
      await saveGlobalAzkarConfig({
        enabledForAll: $('azk_global_all') ? $('azk_global_all').checked : true,
        lockForStaff: $('azk_lock_staff') ? $('azk_lock_staff').checked : false,
        scheduleMode: mode,
        frequency: freq,
        weekday: wd,
        times,
        intervalMin: minVal,
        taskScope: scope,
        priorityFilter: prio,
        includeForAll: incAll,
        includePendingOrders: incOrd,
        maxPopupTasks: maxTasks,
        popupMode: popMode,
        externalPush: extPush,
        persistentNotif: persistNotif,
        popupOnOpen: popOnOpen,
        toneStyle,
        toneVolume: toneVol,
        ringDurationSec: ringSec,
        vibrateEnabled: vibOn,
        voiceEnabled: vOn,
        quietHoursEnabled: quietOn,
        quietStart: quietS,
        quietEnd: quietE,
        bannerEnabled: $('azk_on') ? $('azk_on').checked : true
      });
    }
    if ($('azk_eta_lbl')) $('azk_eta_lbl').textContent = getNextReminderEtaText();
    await syncOverdueDigestToSw();
  };

  if ($('al_snd')) $('al_snd').onchange = e => { localStorage.setItem('alert_sound', e.target.checked ? 'on' : 'off'); if (typeof toast === 'function') toast('تم حفظ إعداد صوت التنبيه الإداري ✓'); };

  if ($('azk_preview_popup')) {
    $('azk_preview_popup').onclick = () => {
      unlockAudio();
      const stats = collectMyIncompleteTasks();
      const voiceMsg = stats.targetTasks.length > 0
        ? ('تذكير من مدير المهام: لديك ' + stats.targetTasks.length + ' مهام غير منجزة')
        : 'جميع مهامك مكتملة بنجاح';
      playBackgroundAzkarToneAndVoice(azkarVoiceSettingOn() ? voiceMsg : '');
      showAdhanTasksPopup({ isPreview: true });
    };
  }

  if ($('azk_test_tone')) {
    $('azk_test_tone').onclick = () => {
      unlockAudio();
      const st = $('azk_tone_style') ? $('azk_tone_style').value : azkarToneStyle();
      if (st === 'silent') {
        if (typeof toast === 'function') toast('الوضع الحالي صامت (بدون نغمة) 🔇');
        return;
      }
      playBackgroundAzkarToneAndVoice(azkarVoiceSettingOn() ? 'هذه تجربة نغمة وصوت منبّه المهام الناقصة' : '', st);
      if (typeof toast === 'function') toast('🔊 جاري تشغيل النغمة المختارة...');
    };
  }

  document.querySelectorAll('[data-azk-preset-min]').forEach(btn => {
    btn.onclick = async () => {
      const m = +(btn.getAttribute('data-azk-preset-min') || 360);
      if ($('azk_mode')) $('azk_mode').value = 'interval';
      if ($('azk_min')) $('azk_min').value = String(m);
      if ($('azk_sched_box')) $('azk_sched_box').style.display = 'none';
      if ($('azk_interval_box')) $('azk_interval_box').style.display = '';
      localStorage.setItem('azkar_reminder_on', 'on');
      if ($('azk_on')) $('azk_on').checked = true;
      await saveAllSettings();
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('تم ضبط المنبّه الدوري ' + formatDurationArabic(m) + ' ✓');
    };
  });

  if ($('azk_times_preset6h')) {
    $('azk_times_preset6h').onclick = async () => {
      const preset = ['08:00', '14:00', '20:00'];
      await saveAllSettings(preset);
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('تم ضبط أوقات التذكير كل 6 ساعات (8 صباحاً، 2 ظهراً، 8 مساءً) ⏰');
    };
  }

  if ($('azk_open_apk_dlg')) {
    $('azk_open_apk_dlg').onclick = () => {
      if (typeof apkInstallDialog === 'function') apkInstallDialog();
    };
  }

  if ($('azk_global_all')) {
    $('azk_global_all').onchange = async e => {
      await saveAllSettings();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تعميم إعدادات التنبيه لجميع الموظفين ✓' : 'تم إلغاء التعميم');
    };
  }
  if ($('azk_lock_staff')) {
    $('azk_lock_staff').onchange = async e => {
      await saveAllSettings();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم قفل الإعدادات وإلزام جميع الموظفين بها 🔒' : 'تم السماح للموظفين بتخصيص إعداداتهم');
    };
  }
  if ($('azk_on')) {
    $('azk_on').onchange = async e => {
      localStorage.setItem('azkar_reminder_on', e.target.checked ? 'on' : 'off');
      if (e.target.checked) unlockAudio();
      await saveAllSettings();
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تفعيل منبّه المهام الناقصة الدوري ✓' : 'تم إيقاف المنبّه');
    };
  }
  if ($('azk_voice')) {
    $('azk_voice').onchange = async e => {
      localStorage.setItem('azkar_voice_on', e.target.checked ? 'on' : 'off');
      if (!e.target.checked && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (err) {}
      }
      await saveAllSettings();
      if (e.target.checked) {
        playBackgroundAzkarToneAndVoice('تم تفعيل القراءة الصوتية للمهام الناقصة بنجاح');
      } else if (typeof toast === 'function') {
        toast('تم إيقاف القراءة الصوتية والاكتفاء بالنغمة 🔔');
      }
    };
  }
  if ($('azk_mode')) {
    $('azk_mode').onchange = async e => {
      const m = e.target.value;
      if ($('azk_sched_box')) $('azk_sched_box').style.display = m === 'scheduled' ? '' : 'none';
      if ($('azk_interval_box')) $('azk_interval_box').style.display = m === 'interval' ? '' : 'none';
      await saveAllSettings();
      if (typeof toast === 'function') toast('تم تحديث نظام توقيت التنبيه ✓');
    };
  }
  if ($('azk_freq')) {
    $('azk_freq').onchange = async e => {
      if ($('azk_wd_wrap')) $('azk_wd_wrap').style.display = e.target.value === 'weekly' ? '' : 'none';
      await saveAllSettings();
      if (typeof toast === 'function') toast('تم تحديث أيام التذكير ✓');
    };
  }
  if ($('azk_wd')) {
    $('azk_wd').onchange = async () => {
      await saveAllSettings();
      if (typeof toast === 'function') toast('تم تحديد يوم الأسبوع ✓');
    };
  }
  if ($('azk_min')) {
    $('azk_min').onchange = async e => {
      await saveAllSettings();
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('تم ضبط التكرار الدوري ' + formatDurationArabic(+e.target.value) + ' ✓');
    };
  }

  ['azk_popup_mode', 'azk_max_tasks', 'azk_ext_push', 'azk_persist_notif', 'azk_popup_open',
   'azk_task_scope', 'azk_prio_filter', 'azk_inc_forall', 'azk_inc_orders',
   'azk_tone_style', 'azk_tone_vol', 'azk_ring_sec', 'azk_vibrate',
   'azk_quiet_start', 'azk_quiet_end'].forEach(id => {
    if ($(id)) {
      $(id).onchange = async () => {
        await saveAllSettings();
        if (typeof toast === 'function') toast('تم حفظ إعدادات الإشعارات فوراً ✓');
      };
    }
  });

  if ($('azk_quiet_on')) {
    $('azk_quiet_on').onchange = async e => {
      if ($('azk_quiet_box')) $('azk_quiet_box').style.display = e.target.checked ? '' : 'none';
      await saveAllSettings();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تفعيل ساعات الهدوء وعدم الإزعاج 🌙' : 'تم إيقاف ساعات الهدوء');
    };
  }

  if ($('azk_time_add')) {
    $('azk_time_add').onclick = async () => {
      const val = ($('azk_time_in') && $('azk_time_in').value || '').trim();
      if (!/^\d{2}:\d{2}$/.test(val)) return;
      const cur = azkarScheduledTimes();
      if (!cur.includes(val)) cur.push(val);
      cur.sort();
      await saveAllSettings(cur);
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('تمت إضافة الساعة ' + formatTimeArabic12h(val) + ' إلى جدول التنبيهات ⏰');
    };
  }
  document.querySelectorAll('[data-rm-azktime]').forEach(btn => {
    btn.onclick = async () => {
      const target = btn.getAttribute('data-rm-azktime');
      const cur = azkarScheduledTimes().filter(x => x !== target);
      if (!cur.length) return;
      await saveAllSettings(cur);
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('تم حذف الساعة ' + formatTimeArabic12h(target));
    };
  });

  // زر تجربة الإشعار فوراً في شريط إشعارات الجوال + الشاشة المنبثقة
  if ($('azk_test_now')) {
    $('azk_test_now').onclick = async () => {
      unlockAudio();
      if (typeof autoEnablePush === 'function') await autoEnablePush(true);
      const st = $('azk_test_status');
      if (st) st.textContent = '🚀 جارٍ إرسال الإشعار الخارجي للهاتف وفتح شاشة المهام الناقصة...';
      await triggerAzkarCheckNow(true, 0, 'full');
      if (st) st.textContent = '✅ ظهر الإشعار الآن في شريط الهاتف العلوي مع الشاشة المنبثقة!';
    };
  }

  // زر اختبار الإشعار مع الخروج لشاشة الجوال (ينتظر 6 ثوانٍ ليخرج المستخدم من التطبيق)
  if ($('azk_test_ext')) {
    $('azk_test_ext').onclick = async () => {
      unlockAudio();
      startSilentAudioKeepAlive();
      if (typeof autoEnablePush === 'function') await autoEnablePush(true);
      const btn = $('azk_test_ext');
      const st = $('azk_test_status');
      let sec = 6;
      btn.disabled = true;
      const updateMsg = s => {
        const txt = '⏳ اخرج الآن لشاشة الجوال الرئيسية أو اقفل الشاشة! سيصلك الإشعار بعد (' + s + ') ثوانٍ...';
        if (st) st.textContent = txt;
        btn.textContent = '⏳ اخرج لشاشة الجوال (' + s + ' ث)...';
      };
      updateMsg(sec);
      if (typeof toast === 'function') toast('📲 اخرج الآن لشاشة الجوال الرئيسية! سيصلك تنبيه المهام الناقصة بعد 6 ثوانٍ 🔔');
      triggerAzkarCheckNow(true, 6000, 'full');
      const iv = setInterval(() => {
        sec--;
        if (sec > 0) {
          updateMsg(sec);
        } else {
          clearInterval(iv);
          btn.disabled = false;
          btn.textContent = '⏳ تجربة من خارج التلفون (بعد 6 ثوانٍ)';
          if (st) st.textContent = '✅ تم إرسال التنبيه الخارجي! عند النقر عليه من شريط الجوال ستفتح شاشة المهام الناقصة.';
        }
      }, 1000);
    };
  }
}
