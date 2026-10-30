// ===== نافذة التنبيه المنبثقة + نغمة مطوّلة + الحل الذهبي للتنبيه بالخلفية =====
const ALERT = { q: [], cur: null, ctx: null, timer: null, keepAliveAudio: null };
const alertSoundOn = () => localStorage.getItem('alert_sound') !== 'off';
const azkarVoiceOn = () => localStorage.getItem('azkar_voice_on') === 'on';

// توليد ملف WAV صامت متناهي الصغر لإبقاء جلسة الخلفية نشطة في أندرويد (مثل تطبيقات الأذكار)
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
function chime(ctx, t0) {
  [[659.25, 0], [783.99, .18], [1046.5, .36], [783.99, .62], [1046.5, .8]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + d;
    o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.45, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + .55);
    o.start(s); o.stop(s + .6);
  });
}
function playBackgroundAzkarToneAndVoice(spokenText) {
  try {
    unlockAudio();
    const ctx = ALERT.ctx;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      chime(ctx, ctx.currentTime + 0.02);
      setTimeout(() => { try { chime(ctx, ctx.currentTime + 0.02); } catch (e) {} }, 1200);
    }
    if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 800]);
    if (azkarVoiceSettingOn() && spokenText && 'speechSynthesis' in window) {
      setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(spokenText);
          u.lang = 'ar-SA';
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
        } catch (e) {}
      }, 900);
    } else if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  } catch (e) {}
}
function stopRing() { clearInterval(ALERT.timer); ALERT.timer = null; try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {} }
function startRing() {
  stopRing();
  if (!alertSoundOn()) return;
  unlockAudio();
  const ctx = ALERT.ctx; let n = 0;
  const tick = () => {
    try { if (ctx) { if (ctx.state === 'suspended') ctx.resume(); chime(ctx, ctx.currentTime + .02); } if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 800]); } catch (e) {}
    if (++n >= 18) stopRing();      // نحو 45 ثانية كحد أقصى
  };
  tick(); ALERT.timer = setInterval(tick, 2600);
}
function closeAlertOs(a) {
  // لا نغلق إشعار الجوال العلوي أبداً حتى يتمكن المستخدم من التفاعل معه من شريط إشعارات الجوال
  return;
}
function ackAlert(a) { if (!a) return; if (a.nid && typeof markRead === 'function') markRead([a.nid]); if (a.nids && typeof markRead === 'function') markRead(a.nids); }
function showAlert(a) { ALERT.q.push(a); if (!ALERT.cur) nextAlert(); }
function nextAlert() {
  const a = ALERT.q.shift(); ALERT.cur = a || null;
  let ov = document.getElementById('alert_ov');
  if (!a) { stopRing(); if (ov) ov.remove(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'alert_ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  const t = a.task_id && S.tasks.find(x => x.id === a.task_id);
  ov.innerHTML = '<div class="al-box"><div class="al-bell">🔔</div><h2>' + esc(a.title || 'تنبيه') + '</h2><p>' + esc(a.body || '') + '</p>' +
    (ALERT.q.length ? '<div class="al-more">+ ' + ALERT.q.length + ' تنبيهات أخرى بانتظارك</div>' : '') +
    '<div class="al-act">' + (a.summary ? '<button class="al-ok" id="al_inbox">فتح صندوق التنبيهات</button>' : '') + (t && eff(t) !== 'done' ? '<button class="al-ok" id="al_done">إنجاز ✓</button>' : '') + (t ? '<button id="al_open">عرض المهمة</button>' : '') + (a.order_id ? '<button class="al-ok" id="al_order">عرض الطلب</button>' : '') + '<button id="al_x">إغلاق</button></div></div>';
  startRing();
  document.getElementById('al_x').onclick = () => { ackAlert(a); nextAlert(); };
  if (document.getElementById('al_inbox')) document.getElementById('al_inbox').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); inboxDialog(); };
  if (t) document.getElementById('al_open').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); S.view = 'board'; render(); taskDialog(S.tasks.find(x => x.id === t.id)); };
  if (document.getElementById('al_order')) document.getElementById('al_order').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); gotoOrder(a.order_id); };
  if (document.getElementById('al_done')) document.getElementById('al_done').onclick = () => { ackAlert(a); moveTask(t.id, 'done'); nextAlert(); };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ALERT.cur) startRing(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { const m = e.data; if (m && typeof m === 'object' && m.type === 'alert') { if (m.nid) { if (INBOX.alerted.has(m.nid)) return; INBOX.alerted.add(m.nid); } showAlert(m); } });

const AZKAR_WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const azkarGlobalCfg = () => typeof getGlobalAzkarConfig === 'function'
  ? getGlobalAzkarConfig()
  : { enabledForAll: true, scheduleMode: 'scheduled', frequency: 'daily', weekday: 0, times: ['09:00', '20:00'], intervalMin: 120, voiceEnabled: false, bannerEnabled: true };

const azkarReminderOn = () => {
  const g = azkarGlobalCfg();
  if (g.enabledForAll) return localStorage.getItem('azkar_reminder_on') !== 'off';
  return localStorage.getItem('azkar_reminder_on') === 'on';
};
const azkarScheduleMode = () => localStorage.getItem('azkar_schedule_mode') || azkarGlobalCfg().scheduleMode || 'scheduled';
const azkarFrequency = () => localStorage.getItem('azkar_frequency') || azkarGlobalCfg().frequency || 'daily';
const azkarWeekday = () => {
  const v = localStorage.getItem('azkar_weekday');
  return v != null && v !== '' ? +v : +(azkarGlobalCfg().weekday || 0);
};
const azkarScheduledTimes = () => {
  try {
    const raw = localStorage.getItem('azkar_times_v1');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {}
  return azkarGlobalCfg().times || ['09:00', '20:00'];
};
const azkarReminderMin = () => +(localStorage.getItem('azkar_reminder_min') || azkarGlobalCfg().intervalMin || 120);
const azkarVoiceSettingOn = () => {
  const local = localStorage.getItem('azkar_voice_on');
  if (local === 'on' || local === 'off') return local === 'on';
  return azkarGlobalCfg().voiceEnabled === true;
};

function formatTimeArabic12h(hhmm) {
  const parts = String(hhmm || '09:00').split(':');
  const h24 = +parts[0] || 0;
  const m = String(parts[1] || '00').padStart(2, '0');
  const period = h24 >= 12 ? 'مساءً' : 'صباحاً';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ':' + m + ' ' + period;
}

function getClientFiredSlots() {
  try { return JSON.parse(localStorage.getItem('azkar_fired_slots_v1') || '{}') || {}; } catch (e) { return {}; }
}
function markClientSlotFired(slotKey) {
  if (!slotKey) return;
  const map = getClientFiredSlots();
  map[slotKey] = Date.now();
  // تنظيف المفاتيح القديمة (أكثر من 7 أيام)
  const cutoff = Date.now() - 7 * 864e5;
  Object.keys(map).forEach(k => { if (map[k] < cutoff) delete map[k]; });
  try { localStorage.setItem('azkar_fired_slots_v1', JSON.stringify(map)); } catch (e) {}
}

// فحص ما إذا كان قد حان موعد التنبيه حسب الجدول المحدد (مثل المهام المتكررة)
function checkClientScheduleSlotDue() {
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
  // الوضع الافتراضي: scheduled (في أوقات وساعات محددة مثل المهام المتكررة)
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
    // ينطلق خلال نافذة الساعة المحددة (حتى 20 دقيقة من حلولها) ولمرة واحدة فقط لهذه الساعة
    if (nowMins >= slotMins && nowMins <= slotMins + 20) {
      const slotKey = ymdStr + '_' + tStr;
      if (!fired[slotKey]) return slotKey;
    }
  }
  return null;
}

// ===== شريط الإشعار العلوي المنبثق (داخل التطبيق) =====
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
        '<div style="width:38px;height:38px;border-radius:11px;background:rgba(212,175,106,.2);border:1px solid rgba(212,175,106,.45);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">⏰</div>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b style="font-size:14px;color:#fff">' + esc(opts.title || '⏰ تذكير بالمهام المتأخرة') + '</b>' +
            '<span style="font-size:10.5px;background:rgba(255,255,255,.12);padding:1px 7px;border-radius:99px;color:#cbd5e1">تذكير مجدول</span>' +
          '</div>' +
          '<div style="font-size:12.5px;color:#e2e8f0;margin-top:3px">' + esc(opts.subtitle || '') + '</div>' +
          linesHtml +
        '</div>' +
      '</div>' +
      '<button type="button" id="azk_bn_x" style="background:transparent;border:0;color:#94a3b8;font-size:18px;padding:0 4px;cursor:pointer;line-height:1">✕</button>' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12);flex-wrap:wrap">' +
      (t && (typeof eff === 'function' ? eff(t) !== 'done' : t.status !== 'done')
        ? '<button type="button" id="azk_bn_done" style="flex:1;padding:6px 10px;border-radius:9px;border:0;background:#16a34a;color:#fff;font:700 12px Tajawal;cursor:pointer">✅ إنجاز المهمة فوراً</button>'
        : '') +
      '<button type="button" id="azk_bn_open" style="flex:1;padding:6px 10px;border-radius:9px;border:1px solid #d4af6a;background:rgba(212,175,106,.18);color:#f6e3a8;font:700 12px Tajawal;cursor:pointer">📋 فتح المهام المتأخرة</button>' +
      '<button type="button" id="azk_bn_snooze" style="padding:6px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#e2e8f0;font:600 11.5px Tajawal;cursor:pointer">⏰ غفوة ساعة</button>' +
    '</div>';

  clearTimeout(el._hideTm);
  el._hideTm = setTimeout(() => { if (el) el.remove(); }, 20000);

  const btnX = document.getElementById('azk_bn_x');
  if (btnX) btnX.onclick = () => el.remove();
  const btnSnooze = document.getElementById('azk_bn_snooze');
  if (btnSnooze) btnSnooze.onclick = () => {
    localStorage.setItem('azkar_snooze_until', String(Date.now() + 60 * 60 * 1000));
    el.remove();
    if (typeof toast === 'function') toast('تم تأجيل التذكير لمدة ساعة ⏰');
  };
  const btnOpen = document.getElementById('azk_bn_open');
  if (btnOpen) btnOpen.onclick = () => {
    el.remove();
    S.view = 'board';
    if (S.tf) S.tf.due = (opts.lateCount > 0 ? 'late' : '');
    render();
    if (t && typeof taskDialog === 'function') taskDialog(t);
  };
  const btnDone = document.getElementById('azk_bn_done');
  if (btnDone && t) btnDone.onclick = () => {
    el.remove();
    if (typeof moveTask === 'function') moveTask(t.id, 'done');
  };
}

async function syncOverdueDigestToSw() {
  if (!S.me || !Array.isArray(S.tasks)) return;
  const td = typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const myTasks = S.tasks.filter(t => typeof mine === 'function' && mine(t) && (typeof eff === 'function' ? eff(t) !== 'done' : t.status !== 'done'));
  const lateTasks = myTasks.filter(t => t.due_on && t.due_on < td);
  const todayTasks = myTasks.filter(t => t.due_on && t.due_on === td);
  const sample = (lateTasks.length ? lateTasks : todayTasks).slice(0, 4).map(t => t.title);
  const firstId = (lateTasks[0] && lateTasks[0].id) || (todayTasks[0] && todayTasks[0].id) || null;

  const digest = {
    enabled: azkarReminderOn(),
    scheduleMode: azkarScheduleMode(),
    frequency: azkarFrequency(),
    weekday: azkarWeekday(),
    times: azkarScheduledTimes(),
    intervalMin: azkarReminderMin(),
    firedSlots: getClientFiredSlots(),
    lateCount: lateTasks.length,
    todayCount: todayTasks.length,
    titles: sample,
    firstTaskId: firstId,
    updatedAt: Date.now()
  };

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
          minInterval: 30 * 60 * 1000
        }).catch(() => {});
      }
    } catch (e) {}
  }
}

// إرسال إشعار جوال خارجي حقيقي (Web Push) عبر /api/remind بدون مسح الإشعار من شريط الجوال
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
        title: title || '⏰ تذكير بالمهام المتأخرة',
        body: body || 'لديك مهام تحتاج متابعة في النظام',
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

  const td = typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const myTasks = (S.tasks || []).filter(t => typeof mine === 'function' && mine(t) && (typeof eff === 'function' ? eff(t) !== 'done' : t.status !== 'done'));
  const lateTasks = myTasks.filter(t => t.due_on && t.due_on < td);
  const todayTasks = myTasks.filter(t => t.due_on && t.due_on === td);
  const sample = (lateTasks.length ? lateTasks : todayTasks).slice(0, 3).map(t => t.title);
  const firstId = (lateTasks[0] && lateTasks[0].id) || (todayTasks[0] && todayTasks[0].id) || null;

  let dueSlotKey = null;
  if (!forceTest) {
    if (lateTasks.length === 0 && todayTasks.length === 0) return;
    dueSlotKey = checkClientScheduleSlotDue();
    if (!dueSlotKey) return;
    markClientSlotFired(dueSlotKey);
    localStorage.setItem('azkar_last_fcm_ts', String(Date.now()));
    await syncOverdueDigestToSw();
  }

  const pTitle = lateTasks.length > 0
    ? ('🚨 تذكير: لديك ' + lateTasks.length + ' مهام متأخرة')
    : todayTasks.length > 0
      ? ('🔥 تذكير: لديك ' + todayTasks.length + ' مهام مستحقة اليوم')
      : '🔔 إشعار خارجي من مدير المهام';
  const subtitle = lateTasks.length > 0
    ? ('يا ' + ((S.me && S.me.name) || '') + '، لديك مهام تجاوزت موعد التسليم وتحتاج إنجازاً:')
    : todayTasks.length > 0
      ? ('لديك مهام مستحقة اليوم بانتظار التنفيذ:')
      : 'وصلك هذا الإشعار بنجاح بحسب الأوقات المجدولة!';
  const pBody = sample.length
    ? ('• ' + sample.join('\n• '))
    : subtitle;
  const voiceMsg = lateTasks.length > 0
    ? ('تذكير من مدير المهام: لديك ' + lateTasks.length + ' مهام متأخرة')
    : 'تذكير بالمهام المستحقة';

  const fireNow = async () => {
    // 1) إشعار نظام أندرويد الرسمي دائماً (في شريط إشعارات الهاتف مثل الصورة 2)
    if ('serviceWorker' in navigator && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(pTitle, {
          body: pBody,
          icon: '/icon-192.png',
          badge: '/badge-96.png',
          vibrate: [500, 150, 500, 150, 800],
          requireInteraction: true,
          renotify: true,
          silent: false,
          tag: 'azkar-overdue-remind',
          timestamp: Date.now(),
          actions: firstId
            ? [{ action: 'done', title: '✅ تم الإنجاز' }, { action: 'open', title: '📋 فتح المهام' }]
            : [{ action: 'open', title: '📋 عرض المهام' }],
          data: { url: '/', task_id: firstId, task_title: sample[0] || '' }
        });
      } catch (e) {}
    }

    // 2) نغمة واهتزاز وقراءة صوتية
    playBackgroundAzkarToneAndVoice(azkarVoiceSettingOn() ? voiceMsg : '');

    // 3) إذا كان المستخدم داخل التطبيق، لا نغطي الشاشة ببانر مزعج إلا إذا كان مفعّلاً اختيارياً
    if (!document.hidden && (modeOpt === 'inapp_banner' || localStorage.getItem('azkar_inapp_banner') === 'on')) {
      showHeadsUpAzkarBanner({
        title: pTitle,
        subtitle,
        sample,
        firstTaskId: firstId,
        lateCount: lateTasks.length,
        todayCount: todayTasks.length
      });
    } else if (!document.hidden && typeof toast === 'function') {
      toast('🔔 إشعار جديد في شريط إشعارات الجوال: ' + pTitle);
    }

    // 4) إرسال Web Push للخادم إذا كان وقت مجدول فعلي لجميع أجهزة الموظف
    if (dueSlotKey && navigator.onLine) {
      sendExternalRemindPush(pTitle, pBody, firstId, false, dueSlotKey);
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

function startAzkarReminderEngine() {
  syncOverdueDigestToSw();
  acquireScreenAndBackgroundKeepAlive();

  // فحص جدول المواعيد المحددة فقط (بدون إزعاج عشوائي عند كل فتح للتطبيق!)
  if (!S._initialAzkarChecked) {
    S._initialAzkarChecked = true;
    setTimeout(() => {
      if (azkarReminderOn()) triggerAzkarCheckNow(false, 0, 'auto');
    }, 4000);
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
    }
    if (azkarReminderOn()) {
      startSilentAudioKeepAlive();
      triggerAzkarCheckNow(false, 0, 'auto');
    }
  });
}

function alertSettingsHtml() {
  const isOn = azkarReminderOn();
  const vOn = azkarVoiceSettingOn();
  const mode = azkarScheduleMode();
  const freq = azkarFrequency();
  const wd = azkarWeekday();
  const times = azkarScheduledTimes();
  const minVal = azkarReminderMin();
  const gCfg = azkarGlobalCfg();
  const adm = typeof isAdmin === 'function' && isAdmin();
  const intervals = [
    [60, 'كل ساعة'],
    [120, 'كل ساعتين (موصى به)'],
    [240, 'كل 4 ساعات'],
    [360, 'كل 6 ساعات'],
    [30, 'كل 30 دقيقة']
  ];

  const timesBadgesHtml = times.map(t =>
    '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:13px;background:var(--card);border:1px solid var(--gold,#c9a24e)">' +
      '⏰ <b>' + esc(formatTimeArabic12h(t)) + '</b> <small class="m">(' + esc(t) + ')</small>' +
      (times.length > 1 ? '<button type="button" class="s dng" data-rm-azktime="' + esc(t) + '" style="padding:1px 6px;font-size:11px;border-radius:6px" title="حذف هذا الوقت">✕</button>' : '') +
    '</span>'
  ).join(' ');

  return '<div class="card" style="margin-bottom:12px;border:2px solid var(--gold,#c9a24e)">' +
    '<h2>⏰ جدولة تنبيهات المهام المتأخرة (بأوقات وساعات محددة مثل المهام المتكررة)</h2>' +
    '<p class="m" style="margin-bottom:10px">حدد الساعات والأيام الدقيقة التي ينطلق فيها تذكير المهام المتأخرة لجميع الموظفين <b>بدون إزعاج متكرر</b>، مع إرسال <b>إشعار خارجي لشاشة الجوال</b> في الأوقات المحددة.</p>' +
    (adm ? '<label class="chk" style="margin-bottom:8px;background:var(--col);padding:8px 10px;border-radius:10px;border:1px solid var(--gold)"><input type="checkbox" id="azk_global_all" ' + (gCfg.enabledForAll ? 'checked' : '') + '> <b>👑 تعميم هذا الجدول تلقائياً على جميع الموظفين في كل المتاجر</b></label>' : '') +
    '<div class="row" style="gap:12px;flex-wrap:wrap;margin-bottom:10px">' +
      '<label class="chk"><input type="checkbox" id="azk_on" ' + (isOn ? 'checked' : '') + '> <b>🔔 تفعيل منبّه المهام المتأخرة</b></label>' +
      '<label class="chk"><input type="checkbox" id="azk_voice" ' + (vOn ? 'checked' : '') + '> <b>🗣️ القراءة الصوتية بالكلام (مغلق افتراضياً — نغمة فقط)</b></label>' +
    '</div>' +

    '<div style="background:var(--col);padding:12px;border-radius:12px;border:1px solid var(--line);margin-bottom:12px">' +
      '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
        '<label style="flex:1 1 240px"><b>📅 طريقة جدولة التنبيه:</b>' +
          '<select id="azk_mode" style="margin-top:4px">' +
            '<option value="scheduled"' + (mode === 'scheduled' ? ' selected' : '') + '>⏰ في أوقات وساعات محددة (مثل المهام المتكررة — بدون إزعاج)</option>' +
            '<option value="once_daily"' + (mode === 'once_daily' ? ' selected' : '') + '>🌅 مرة واحدة فقط في اليوم</option>' +
            '<option value="interval"' + (mode === 'interval' ? ' selected' : '') + '>🔁 تكرار دوري كل عدة ساعات</option>' +
          '</select>' +
        '</label>' +
      '</div>' +

      '<div id="azk_sched_box" style="' + (mode === 'scheduled' ? '' : 'display:none;') + 'padding-top:8px;border-top:1px dashed var(--line)">' +
        '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
          '<label style="flex:1 1 180px">🔁 أيام التذكير:' +
            '<select id="azk_freq" style="margin-top:4px">' +
              '<option value="daily"' + (freq === 'daily' ? ' selected' : '') + '>يومياً</option>' +
              '<option value="workdays"' + (freq === 'workdays' ? ' selected' : '') + '>أيام الدوام (السبت – الخميس)</option>' +
              '<option value="weekly"' + (freq === 'weekly' ? ' selected' : '') + '>أسبوعياً (يوم محدد)</option>' +
            '</select>' +
          '</label>' +
          '<label id="azk_wd_wrap" style="flex:1 1 150px;' + (freq === 'weekly' ? '' : 'display:none') + '">📆 يوم الأسبوع:' +
            '<select id="azk_wd" style="margin-top:4px">' +
              AZKAR_WD.map((d, i) => '<option value="' + i + '"' + (wd === i ? ' selected' : '') + '>' + d + '</option>').join('') +
            '</select>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:8px"><b>🕘 الساعات المحددة لإطلاق التنبيه:</b></div>' +
        '<div id="azk_times_list" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + timesBadgesHtml + '</div>' +
        '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">' +
          '<input type="time" id="azk_time_in" value="14:00" style="max-width:160px">' +
          '<button type="button" class="p s" id="azk_time_add">＋ إضافة ساعة للتنبيه</button>' +
          '<span class="m" style="font-size:12px">ينطلق التنبيه في هذه الساعات فقط إذا كان لدى الموظف مهام متأخرة.</span>' +
        '</div>' +
      '</div>' +

      '<div id="azk_interval_box" style="' + (mode === 'interval' ? '' : 'display:none;') + 'padding-top:8px;border-top:1px dashed var(--line)">' +
        '<label>⏱️ المدة بين كل تذكير والآخر:<select id="azk_min" style="margin-top:4px">' +
          intervals.map(([v, l]) => '<option value="' + v + '"' + (minVal === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select></label>' +
      '</div>' +
    '</div>' +

    '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button type="button" class="p s" id="azk_test_now" style="flex:1 1 200px">📲 تجربة إشعار نظام الجوال فوراً (في شريط الهاتف العلوي)</button>' +
      '<button type="button" class="s" id="azk_test_ext" style="flex:1 1 200px">⏳ تجربة بعد 6 ثوانٍ (مع الخروج لشاشة الجوال)</button>' +
    '</div>' +
    '<div class="row" style="margin-bottom:10px">' +
      '<label class="chk"><input type="checkbox" id="azk_banner_opt" ' + (localStorage.getItem('azkar_inapp_banner') === 'on' ? 'checked' : '') + '> <b>📌 إظهار شريط إضافي داخل التطبيق (مغلق افتراضياً — يظهر إشعار نظام الجوال الرسمي دائماً بدون تغطية الشاشة)</b></label>' +
    '</div>' +
    '<div id="azk_test_status" class="m" style="margin-top:6px;font-weight:700;color:var(--gold,#c9a24e)"></div>' +
    '<div style="margin-top:14px;padding:12px;border-radius:12px;background:rgba(22,163,74,.1);border:1.5px solid rgba(22,163,74,.4);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
      '<div>' +
        '<b style="color:#16a34a;font-size:13.5px">🤖 الحل الجذري الشامل: تطبيق أندرويد المستقل للجوال (APK)</b>' +
        '<div class="m" style="font-size:12px;margin-top:2px">تطبيق أندرويد مخصص يعمل في خلفية الجوال 24 ساعة ويستقبل التنبيهات بدون أي قيود للمتصفح.</div>' +
      '</div>' +
      '<button type="button" class="p s" id="azk_open_apk_dlg" style="background:#16a34a;border-color:#16a34a;color:#fff;font-weight:700">📥 تثبيت تطبيق APK الآن</button>' +
    '</div>' +
  '</div>' +
  '<div class="card"><h2>🚨 نافذة التنبيه المنبثقة داخل التطبيق</h2>' +
    '<p class="m" style="margin-bottom:10px">عند وصول تنبيه إداري مباشر تظهر نافذة مع نغمة واهتزاز حتى يتفاعل معها الموظف.</p>' +
    '<label class="chk"><input type="checkbox" id="al_snd" ' + (alertSoundOn() ? 'checked' : '') + '> تشغيل النغمة والاهتزاز</label>' +
    '<div class="row" style="margin-top:10px"><button class="s" id="al_test">🔔 جرّب النافذة الآن</button></div></div>';
}

function bindAlertSettings() {
  const saveAllSettings = async (overrideTimes) => {
    const mode = $('azk_mode') ? $('azk_mode').value : azkarScheduleMode();
    const freq = $('azk_freq') ? $('azk_freq').value : azkarFrequency();
    const wd = $('azk_wd') ? +$('azk_wd').value : azkarWeekday();
    const times = overrideTimes || azkarScheduledTimes();
    const minVal = $('azk_min') ? +$('azk_min').value : azkarReminderMin();

    localStorage.setItem('azkar_schedule_mode', mode);
    localStorage.setItem('azkar_frequency', freq);
    localStorage.setItem('azkar_weekday', String(wd));
    localStorage.setItem('azkar_times_v1', JSON.stringify(times));
    localStorage.setItem('azkar_reminder_min', String(minVal));

    if (typeof isAdmin === 'function' && isAdmin() && typeof saveGlobalAzkarConfig === 'function') {
      await saveGlobalAzkarConfig({
        enabledForAll: $('azk_global_all') ? $('azk_global_all').checked : true,
        scheduleMode: mode,
        frequency: freq,
        weekday: wd,
        times,
        intervalMin: minVal,
        voiceEnabled: $('azk_voice') ? $('azk_voice').checked : false,
        bannerEnabled: $('azk_on') ? $('azk_on').checked : true
      });
    }
    await syncOverdueDigestToSw();
  };

  if ($('al_snd')) $('al_snd').onchange = e => { localStorage.setItem('alert_sound', e.target.checked ? 'on' : 'off'); };
  if ($('al_test')) $('al_test').onclick = () => { unlockAudio(); showAlert({ title: '🔔 تنبيه تجريبي', body: 'هكذا ستظهر لك التنبيهات والتطبيق مفتوح.' }); };

  if ($('azk_banner_opt')) {
    $('azk_banner_opt').onchange = e => {
      localStorage.setItem('azkar_inapp_banner', e.target.checked ? 'on' : 'off');
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تفعيل الشريط الإضافي داخل التطبيق' : 'تم الاكتفاء بإشعار نظام الجوال الرسمي دائماً (بدون تغطية الشاشة) ✓');
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
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تعميم جدول التنبيهات لجميع الموظفين في كل المتاجر ✓' : 'تم إلغاء التعميم');
    };
  }
  if ($('azk_on')) {
    $('azk_on').onchange = async e => {
      localStorage.setItem('azkar_reminder_on', e.target.checked ? 'on' : 'off');
      if (e.target.checked) unlockAudio();
      await saveAllSettings();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تفعيل منبّه المهام المتأخرة ✓' : 'تم إيقاف المنبّه');
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
        playBackgroundAzkarToneAndVoice('تم تفعيل القراءة الصوتية بنجاح');
      } else {
        if (typeof toast === 'function') toast('تم إيقاف الكلام الصوتي — سيتم الاكتفاء بالنغمة فقط 🔔');
      }
    };
  }
  if ($('azk_mode')) {
    $('azk_mode').onchange = async e => {
      const m = e.target.value;
      if ($('azk_sched_box')) $('azk_sched_box').style.display = m === 'scheduled' ? '' : 'none';
      if ($('azk_interval_box')) $('azk_interval_box').style.display = m === 'interval' ? '' : 'none';
      await saveAllSettings();
      if (typeof toast === 'function') toast('تم تحديث طريقة جدولة التنبيه ✓');
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
      if (typeof toast === 'function') toast('تم ضبط التكرار كل ' + e.target.value + ' دقيقة ✓');
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

  // زر تجربة الإشعار فوراً في شريط إشعارات الجوال
  if ($('azk_test_now')) {
    $('azk_test_now').onclick = async () => {
      unlockAudio();
      if (typeof autoEnablePush === 'function') await autoEnablePush(true);
      const st = $('azk_test_status');
      if (st) st.textContent = '🚀 جارٍ إرسال الإشعار لشريط إشعارات الجوال...';
      await triggerAzkarCheckNow(true, 0, 'auto');
      if (st) st.textContent = '✅ ظهر الإشعار الآن في شريط إشعارات الجوال العلوي!';
    };
  }

  // زر اختبار الإشعار مع الخروج لشاشة الجوال (ينتظر 6 ثوانٍ)
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
        const txt = '⏳ اخرج الآن لشاشة الجوال الرئيسية! سيصلك الإشعار بعد (' + s + ') ثوانٍ...';
        if (st) st.textContent = txt;
        btn.textContent = '⏳ اخرج لشاشة الجوال (' + s + ' ث)...';
      };
      updateMsg(sec);
      if (typeof toast === 'function') toast('📲 اخرج الآن لشاشة الجوال الرئيسية! سيصلك الإشعار بعد 6 ثوانٍ 🔔');
      triggerAzkarCheckNow(true, 6000, 'auto');
      const iv = setInterval(() => {
        sec--;
        if (sec > 0) {
          updateMsg(sec);
        } else {
          clearInterval(iv);
          btn.disabled = false;
          btn.textContent = '⏳ تجربة بعد 6 ثوانٍ (مع الخروج لشاشة الجوال)';
          if (st) st.textContent = '✅ تم إرسال الإشعار لشريط إشعارات الجوال!';
        }
      }, 1000);
    };
  }
}
