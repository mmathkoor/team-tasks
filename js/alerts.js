// ===== نافذة التنبيه المنبثقة + نغمة مطوّلة + الحل الذهبي للتنبيه بالخلفية =====
const ALERT = { q: [], cur: null, ctx: null, timer: null, keepAliveAudio: null };
const alertSoundOn = () => localStorage.getItem('alert_sound') !== 'off';
const azkarVoiceOn = () => localStorage.getItem('azkar_voice_on') !== 'off';

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
    if (azkarVoiceOn() && spokenText && 'speechSynthesis' in window) {
      setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(spokenText);
          u.lang = 'ar-SA';
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
        } catch (e) {}
      }, 900);
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
  // مهم جداً: لا نغلق إشعار الجوال العلوي أبداً إذا كان المستخدم خارج التطبيق (document.hidden)!
  if (document.hidden || !a || !a.tag || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(r => r.getNotifications({ tag: a.tag }).then(l => l.forEach(n => n.close()))).catch(() => {});
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
  startRing(); closeAlertOs(a);
  document.getElementById('al_x').onclick = () => { ackAlert(a); nextAlert(); };
  if (document.getElementById('al_inbox')) document.getElementById('al_inbox').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); inboxDialog(); };
  if (t) document.getElementById('al_open').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); S.view = 'board'; render(); taskDialog(S.tasks.find(x => x.id === t.id)); };
  if (document.getElementById('al_order')) document.getElementById('al_order').onclick = () => { ackAlert(a); ALERT.q = []; nextAlert(); gotoOrder(a.order_id); };
  if (document.getElementById('al_done')) document.getElementById('al_done').onclick = () => { ackAlert(a); moveTask(t.id, 'done'); nextAlert(); };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ALERT.cur) startRing(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { const m = e.data; if (m && typeof m === 'object' && m.type === 'alert') { if (m.nid) { if (INBOX.alerted.has(m.nid)) return; INBOX.alerted.add(m.nid); } showAlert(m); } });

const azkarGlobalCfg = () => typeof getGlobalAzkarConfig === 'function' ? getGlobalAzkarConfig() : { enabledForAll: true, intervalMin: 15, voiceEnabled: true, bannerEnabled: true };
const azkarReminderOn = () => {
  const g = azkarGlobalCfg();
  if (g.enabledForAll) return localStorage.getItem('azkar_reminder_on') !== 'off';
  return localStorage.getItem('azkar_reminder_on') === 'on';
};
const azkarReminderMin = () => +(localStorage.getItem('azkar_reminder_min') || azkarGlobalCfg().intervalMin || 15);
const azkarVoiceSettingOn = () => {
  const local = localStorage.getItem('azkar_voice_on');
  if (local === 'on' || local === 'off') return local === 'on';
  return azkarGlobalCfg().voiceEnabled !== false;
};

// ===== شريط الإشعار العلوي المنبثق (بنفس شكل إشعار أندرويد/تطبيق ذكر — يعمل تلقائياً لجميع الموظفين بدون أي إذن!) =====
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
        '<div style="width:38px;height:38px;border-radius:11px;background:rgba(212,175,106,.2);border:1px solid rgba(212,175,106,.45);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📿</div>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b style="font-size:14px;color:#fff">' + esc(opts.title || '⏰ تذكير بالمهام المتأخرة') + '</b>' +
            '<span style="font-size:10.5px;background:rgba(255,255,255,.12);padding:1px 7px;border-radius:99px;color:#cbd5e1">تذكير تلقائي</span>' +
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
      '<button type="button" id="azk_bn_snooze" style="padding:6px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#e2e8f0;font:600 11.5px Tajawal;cursor:pointer">⏰ غفوة 15د</button>' +
    '</div>';

  clearTimeout(el._hideTm);
  el._hideTm = setTimeout(() => { if (el) el.remove(); }, 22000);

  const btnX = document.getElementById('azk_bn_x');
  if (btnX) btnX.onclick = () => el.remove();
  const btnSnooze = document.getElementById('azk_bn_snooze');
  if (btnSnooze) btnSnooze.onclick = () => {
    localStorage.setItem('azkar_snooze_until', String(Date.now() + 15 * 60 * 1000));
    el.remove();
    if (typeof toast === 'function') toast('تم تأجيل التذكير لمدة 15 دقيقة ⏰');
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
    intervalMin: azkarReminderMin(),
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
          minInterval: azkarReminderMin() * 60 * 1000
        }).catch(() => {});
      }
    } catch (e) {}
  }
}

async function sendServerPushToSelf(title, body, firstTaskId) {
  if (!S.me || !S.me.email || !navigator.onLine) return false;
  try {
    const token = typeof tok === 'function' ? await tok() : '';
    const r = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        title: title || '⏰ تذكير بالمهام المتأخرة',
        body: body || 'لديك مهام تحتاج متابعة في النظام',
        assignee_email: S.me.email,
        for_all: false,
        is_custom: true,
        priority: 'urgent',
        task_id: firstTaskId || undefined
      })
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function triggerAzkarCheckNow(forceTest, delayMs = 0) {
  await syncOverdueDigestToSw();
  const snoozeUntil = +(localStorage.getItem('azkar_snooze_until') || 0);
  if (!forceTest && snoozeUntil > Date.now()) return;

  const td = typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const myTasks = (S.tasks || []).filter(t => typeof mine === 'function' && mine(t) && (typeof eff === 'function' ? eff(t) !== 'done' : t.status !== 'done'));
  const lateTasks = myTasks.filter(t => t.due_on && t.due_on < td);
  const todayTasks = myTasks.filter(t => t.due_on && t.due_on === td);
  const sample = (lateTasks.length ? lateTasks : todayTasks).slice(0, 3).map(t => t.title);
  const firstId = (lateTasks[0] && lateTasks[0].id) || (todayTasks[0] && todayTasks[0].id) || null;

  // 1) إرسال أمر لـ Service Worker بصمت إذا كانت صلاحية إشعارات المتصفح متوفرة (بدون إجبار أو توقف)
  if ('serviceWorker' in navigator && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.active) {
        reg.active.postMessage({ type: 'CHECK_OVERDUE_NOW', force: !!forceTest, delayMs: delayMs || 0 });
      }
    } catch (e) {}
  }

  // 2) الحل الذهبي التلقائي لجميع الموظفين (يعمل 100% بدون أي أذونات من الجوال!)
  const fireGolden = () => {
    const lastPush = +(localStorage.getItem('azkar_last_fcm_ts') || 0);
    const minMs = Math.max(5, azkarReminderMin()) * 60 * 1000;
    const dueNow = forceTest || ((lateTasks.length > 0 || todayTasks.length > 0) && (Date.now() - lastPush >= minMs));
    if (!dueNow) return;
    localStorage.setItem('azkar_last_fcm_ts', String(Date.now()));

    const pTitle = lateTasks.length > 0
      ? ('🚨 تذكير: لديك ' + lateTasks.length + ' مهام متأخرة')
      : todayTasks.length > 0
        ? ('🔥 تذكير: لديك ' + todayTasks.length + ' مهام مستحقة اليوم')
        : '📿 المنبّه الذهبي التلقائي يعمل بنجاح!';
    const subtitle = lateTasks.length > 0
      ? ('يا ' + ((S.me && S.me.name) || '') + '، لديك مهام تجاوزت موعد التسليم وتحتاج إنجازاً:')
      : todayTasks.length > 0
        ? ('لديك مهام مستحقة اليوم بانتظار التنفيذ:')
        : 'يظهر هذا الإشعار العلوي المنبثق تلقائياً لجميع الموظفين مع الصوت بدون الحاجة لأي إذن في الجوال!';
    const pBody = sample.length
      ? ('أبرز المهام:\n• ' + sample.join('\n• '))
      : subtitle;
    const voiceMsg = lateTasks.length > 0
      ? ('تذكير من مدير المهام: لديك ' + lateTasks.length + ' مهام متأخرة بانتظار الإنجاز')
      : todayTasks.length > 0
        ? ('تذكير: لديك ' + todayTasks.length + ' مهام مستحقة اليوم')
        : 'المنبّه الذهبي للمهام يعمل بنجاح';

    // أ) إظهار شريط الإشعار العلوي المنبثق فوراً (بدون أي إذن من المتصفح!)
    showHeadsUpAzkarBanner({
      title: pTitle,
      subtitle,
      sample,
      firstTaskId: firstId,
      lateCount: lateTasks.length,
      todayCount: todayTasks.length
    });

    // ب) تشغيل النغمة + القراءة الصوتية العربية بالخلفية والواجهة
    if (azkarVoiceSettingOn()) {
      playBackgroundAzkarToneAndVoice(voiceMsg);
    } else {
      playBackgroundAzkarToneAndVoice('');
    }

    // ج) إرسال إشعار سحابي إضافي إن كان متاحاً
    if (S.me && navigator.onLine && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      sendServerPushToSelf(pTitle, pBody, firstId);
    }
  };

  if (delayMs > 0) setTimeout(fireGolden, delayMs);
  else fireGolden();
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

  // عند أول دخول للموظف، إذا كان لديه مهام متأخرة ينزل له الإشعار العلوي تلقائياً بعد 6 ثوانٍ بدون أي إذن!
  if (!S._initialAzkarChecked) {
    S._initialAzkarChecked = true;
    setTimeout(() => {
      if (azkarReminderOn()) triggerAzkarCheckNow(false, 0);
    }, 6000);
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
      if (azkarReminderOn()) triggerAzkarCheckNow(false, 0);
    };
  } catch (e) {
    setInterval(() => {
      if (azkarReminderOn()) triggerAzkarCheckNow(false, 0);
    }, 30000);
  }

  document.addEventListener('visibilitychange', () => {
    syncOverdueDigestToSw();
    if (!document.hidden) {
      acquireScreenAndBackgroundKeepAlive();
    }
    if (azkarReminderOn()) {
      startSilentAudioKeepAlive();
      triggerAzkarCheckNow(false, 0);
    }
  });
}

function alertSettingsHtml() {
  const isOn = azkarReminderOn();
  const vOn = azkarVoiceSettingOn();
  const minVal = azkarReminderMin();
  const gCfg = azkarGlobalCfg();
  const adm = typeof isAdmin === 'function' && isAdmin();
  const intervals = [
    [5, 'كل 5 دقائق (تذكير فائق القوة)'],
    [15, 'كل 15 دقيقة (موصى به لجميع الموظفين)'],
    [30, 'كل 30 دقيقة'],
    [60, 'كل ساعة'],
    [120, 'كل ساعتين'],
    [240, 'كل 4 ساعات']
  ];
  return '<div class="card" style="margin-bottom:12px;border:2px solid var(--gold,#c9a24e)">' +
    '<h2>📿 الحل الذهبي التلقائي لمنبّه المهام المتأخرة (يعمل لجميع الموظفين بدون أذونات!)</h2>' +
    '<p class="m" style="margin-bottom:10px">يُظهر <b>شريط إشعار علوي منبثق (بنفس شكل إشعارات الجوال وتطبيق ذكر)</b> مع <b>نغمة + ناطق صوتي عربي</b> تلقائياً عند كل موظف لديه مهام متأخرة، <b>بدون الحاجة لأن يفعّل الموظف أي إذن أو يدخل لإعدادات جواله</b>.</p>' +
    (adm ? '<label class="chk" style="margin-bottom:8px;background:var(--col);padding:8px 10px;border-radius:10px;border:1px solid var(--gold)"><input type="checkbox" id="azk_global_all" ' + (gCfg.enabledForAll ? 'checked' : '') + '> <b>👑 تعميم وتفعيل تلقائي لجميع الموظفين في كل المتاجر (بدون طلب إذن منهم)</b></label>' : '') +
    '<label class="chk" style="margin-bottom:8px"><input type="checkbox" id="azk_on" ' + (isOn ? 'checked' : '') + '> <b>تفعيل الإشعار العلوي المنبثق للمهام المتأخرة</b></label>' +
    '<label class="chk" style="margin-bottom:10px"><input type="checkbox" id="azk_voice" ' + (vOn ? 'checked' : '') + '> <b>🗣️ تفعيل الناطق الصوتي العربي («تذكير: لديك مهام متأخرة...»)</b></label>' +
    '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">' +
      '<label style="flex:1 1 200px">⏱️ تكرار التذكير التلقائي للموظفين:<select id="azk_min" style="margin-top:4px">' +
        intervals.map(([v, l]) => '<option value="' + v + '"' + (minVal === v ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label>' +
      '<button type="button" class="p s" id="azk_test" style="margin-top:18px">📲 جرّب الحل الذهبي الآن (فوري + بعد 4 ثوانٍ)</button>' +
    '</div>' +
  '</div>' +
  '<div class="card"><h2>🚨 نافذة التنبيه المنبثقة داخل التطبيق</h2>' +
    '<p class="m" style="margin-bottom:10px">عند وصول تنبيه إداري مباشر تظهر نافذة كبيرة مع نغمة واهتزاز حتى يتفاعل معها الموظف.</p>' +
    '<label class="chk"><input type="checkbox" id="al_snd" ' + (alertSoundOn() ? 'checked' : '') + '> تشغيل النغمة والاهتزاز</label>' +
    '<div class="row" style="margin-top:10px"><button class="s" id="al_test">🔔 جرّب النافذة الآن</button></div></div>';
}
function bindAlertSettings() {
  const persistGlobalIfAdmin = async () => {
    if (typeof isAdmin === 'function' && isAdmin() && typeof saveGlobalAzkarConfig === 'function') {
      await saveGlobalAzkarConfig({
        enabledForAll: $('azk_global_all') ? $('azk_global_all').checked : true,
        intervalMin: $('azk_min') ? +$('azk_min').value : 15,
        voiceEnabled: $('azk_voice') ? $('azk_voice').checked : true,
        bannerEnabled: $('azk_on') ? $('azk_on').checked : true
      });
    }
  };
  if ($('al_snd')) $('al_snd').onchange = e => { localStorage.setItem('alert_sound', e.target.checked ? 'on' : 'off'); };
  if ($('al_test')) $('al_test').onclick = () => { unlockAudio(); showAlert({ title: '🔔 تنبيه تجريبي', body: 'هكذا ستظهر لك التنبيهات والتطبيق مفتوح.' }); };
  if ($('azk_global_all')) {
    $('azk_global_all').onchange = async e => {
      await persistGlobalIfAdmin();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تعميم المنبّه التلقائي لجميع الموظفين في كل المتاجر ✓' : 'تم إلغاء التعميم الإجباري');
    };
  }
  if ($('azk_on')) {
    $('azk_on').onchange = async e => {
      localStorage.setItem('azkar_reminder_on', e.target.checked ? 'on' : 'off');
      if (e.target.checked) unlockAudio();
      await persistGlobalIfAdmin();
      await syncOverdueDigestToSw();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تفعيل المنبّه الذهبي التلقائي ✓' : 'تم إيقاف المنبّه الدوري');
    };
  }
  if ($('azk_voice')) {
    $('azk_voice').onchange = async e => {
      localStorage.setItem('azkar_voice_on', e.target.checked ? 'on' : 'off');
      await persistGlobalIfAdmin();
      if (e.target.checked) playBackgroundAzkarToneAndVoice('تم تفعيل المنبّه الناطق لجميع الموظفين بنجاح');
    };
  }
  if ($('azk_min')) {
    $('azk_min').onchange = async e => {
      localStorage.setItem('azkar_reminder_min', e.target.value);
      await persistGlobalIfAdmin();
      await syncOverdueDigestToSw();
      if (typeof toast === 'function') toast('تم ضبط تكرار التذكير التلقائي كل ' + e.target.value + ' دقيقة ✓');
    };
  }
  if ($('azk_test')) {
    $('azk_test').onclick = async () => {
      unlockAudio();
      localStorage.removeItem('azkar_snooze_until');
      // نعرض الإشعار العلوي المنبثق + الصوت فوراً بدون طلب أي إذن، ونكرره بعد 4 ثوانٍ لاختبار الخلفية
      triggerAzkarCheckNow(true, 0);
      if (typeof toast === 'function') toast('✨ انظر أعلى الشاشة! وسيتكرر أيضاً بعد 4 ثوانٍ بالخلفية...');
      triggerAzkarCheckNow(true, 4000);
    };
  }
}
