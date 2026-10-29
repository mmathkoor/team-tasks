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

const azkarReminderOn = () => localStorage.getItem('azkar_reminder_on') !== 'off';
const azkarReminderMin = () => +(localStorage.getItem('azkar_reminder_min') || 30);

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
    if (typeof autoEnablePush === 'function') await autoEnablePush();
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
  const td = typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const myTasks = (S.tasks || []).filter(t => typeof mine === 'function' && mine(t) && (typeof eff === 'function' ? eff(t) !== 'done' : t.status !== 'done'));
  const lateTasks = myTasks.filter(t => t.due_on && t.due_on < td);
  const todayTasks = myTasks.filter(t => t.due_on && t.due_on === td);
  const sample = (lateTasks.length ? lateTasks : todayTasks).slice(0, 3).map(t => t.title);
  const firstId = (lateTasks[0] && lateTasks[0].id) || (todayTasks[0] && todayTasks[0].id) || null;

  // 1) إرسال أمر فوري لـ Service Worker (مع مهلة داخل waitUntil حتى يعمل حتى لو خرجت للشاشة الرئيسية)
  if ('serviceWorker' in navigator) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.active) {
        reg.active.postMessage({ type: 'CHECK_OVERDUE_NOW', force: !!forceTest, delayMs: delayMs || 0 });
      }
    } catch (e) {}
  }

  // 2) تشغيل النغمة والتنبيه الصوتي وإشعار السيرفر بعد المهلة المحددة
  const fireExtra = () => {
    const lastPush = +(localStorage.getItem('azkar_last_fcm_ts') || 0);
    const minMs = Math.max(5, azkarReminderMin()) * 60 * 1000;
    const dueNow = forceTest || ((lateTasks.length > 0 || todayTasks.length > 0) && (Date.now() - lastPush >= minMs));
    if (!dueNow) return;
    localStorage.setItem('azkar_last_fcm_ts', String(Date.now()));

    const pTitle = lateTasks.length > 0
      ? ('🚨 تذكير: لديك ' + lateTasks.length + ' مهام متأخرة')
      : todayTasks.length > 0
        ? ('🔥 تذكير: لديك ' + todayTasks.length + ' مهام مستحقة اليوم')
        : '📿 منبّه المهام الذكي يعمل بنجاح!';
    const pBody = sample.length
      ? ('أبرز المهام:\n• ' + sample.join('\n• '))
      : 'الإشعار المنبثق والتنبيه الصوتي بالخلفية يعملان بنجاح!';
    const voiceMsg = lateTasks.length > 0
      ? ('تذكير من مدير المهام: لديك ' + lateTasks.length + ' مهام متأخرة بانتظار الإنجاز')
      : todayTasks.length > 0
        ? ('تذكير: لديك ' + todayTasks.length + ' مهام مستحقة اليوم')
        : 'منبّه المهام الذكي يعمل بنجاح خارج التطبيق';

    // تشغيل نغمة وتذكير صوتي حتى لو كنت خارج التطبيق تتصفح جوالك (مثل تطبيق ذكر)
    playBackgroundAzkarToneAndVoice(voiceMsg);

    // إرسال إشعار سحابي عبر Google FCM
    if (S.me && navigator.onLine) {
      sendServerPushToSelf(pTitle, pBody, firstId);
    }
  };

  if (delayMs > 0) setTimeout(fireExtra, delayMs);
  else fireExtra();
}

let _azkarWorker = null;
let _keepAliveLockHeld = false;
function acquireBackgroundKeepAlive() {
  if (_keepAliveLockHeld) return;
  try {
    if (navigator.locks && navigator.locks.request) {
      _keepAliveLockHeld = true;
      navigator.locks.request('matjark_azkar_keep_alive', { mode: 'shared' }, () => new Promise(() => {})).catch(() => { _keepAliveLockHeld = false; });
    }
  } catch (e) {}
}

function startAzkarReminderEngine() {
  syncOverdueDigestToSw();
  acquireBackgroundKeepAlive();
  if (typeof autoEnablePush === 'function') {
    setTimeout(() => autoEnablePush().catch(() => {}), 2500);
  }
  if (_azkarWorker) return;
  try {
    const workerCode = `
      let timer = setInterval(() => { postMessage('tick'); }, 35000);
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
    }, 35000);
  }

  document.addEventListener('visibilitychange', () => {
    syncOverdueDigestToSw();
    if (document.hidden && azkarReminderOn()) {
      startSilentAudioKeepAlive();
      triggerAzkarCheckNow(false, 0);
    }
  });
}

function alertSettingsHtml() {
  const isOn = azkarReminderOn();
  const vOn = azkarVoiceOn();
  const minVal = azkarReminderMin();
  const intervals = [
    [5, 'كل 5 دقائق (تذكير فائق القوة)'],
    [15, 'كل 15 دقيقة (تذكير مكثّف)'],
    [30, 'كل 30 دقيقة (موصى به)'],
    [60, 'كل ساعة'],
    [120, 'كل ساعتين'],
    [240, 'كل 4 ساعات']
  ];
  return '<div class="card" style="margin-bottom:12px;border:2px solid var(--gold,#c9a24e)">' +
    '<h2>📿 الحل الذهبي لمنبّه المهام المتأخرة (إشعار منبثق + ناطق صوتي بالخلفية مثل تطبيق ذكر)</h2>' +
    '<p class="m" style="margin-bottom:10px">يبقي محرك التذكير حيّاً في الخلفية حتى لو خرجت من البرنامج لتصفح واتساب أو تيك توك، وينبّهك بـ <b>إشعار علوي + نغمة + قراءة صوتية عربية</b> بعدد مهامك المتأخرة.</p>' +
    '<label class="chk" style="margin-bottom:8px"><input type="checkbox" id="azk_on" ' + (isOn ? 'checked' : '') + '> <b>تفعيل المنبّه الذكي للمهام المتأخرة بالخلفية</b></label>' +
    '<label class="chk" style="margin-bottom:10px"><input type="checkbox" id="azk_voice" ' + (vOn ? 'checked' : '') + '> <b>🗣️ تفعيل المنبّه الناطق بالصوت العربي («لديك مهام متأخرة...») حتى وأنت خارج التطبيق</b></label>' +
    '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">' +
      '<label style="flex:1 1 200px">⏱️ تكرار التذكير:<select id="azk_min" style="margin-top:4px">' +
        intervals.map(([v, l]) => '<option value="' + v + '"' + (minVal === v ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label>' +
      '<button type="button" class="p s" id="azk_test" style="margin-top:18px">📲 جرّب الحل الذهبي الآن (اضغط واخرج للشاشة الرئيسية)</button>' +
    '</div>' +
  '</div>' +
  '<div class="card"><h2>🚨 نافذة التنبيه المنبثقة داخل التطبيق</h2>' +
    '<p class="m" style="margin-bottom:10px">عند وصول تنبيه والتطبيق مفتوح تظهر نافذة كبيرة مع نغمة واهتزاز حتى تتفاعل معها.</p>' +
    '<label class="chk"><input type="checkbox" id="al_snd" ' + (alertSoundOn() ? 'checked' : '') + '> تشغيل النغمة والاهتزاز</label>' +
    '<div class="row" style="margin-top:10px"><button class="s" id="al_test">🔔 جرّب النافذة الآن</button></div></div>';
}
function bindAlertSettings() {
  if ($('al_snd')) $('al_snd').onchange = e => { localStorage.setItem('alert_sound', e.target.checked ? 'on' : 'off'); };
  if ($('al_test')) $('al_test').onclick = () => { unlockAudio(); showAlert({ title: '🔔 تنبيه تجريبي', body: 'هكذا ستظهر لك التنبيهات والتطبيق مفتوح.' }); };
  if ($('azk_on')) {
    $('azk_on').onchange = async e => {
      localStorage.setItem('azkar_reminder_on', e.target.checked ? 'on' : 'off');
      if (e.target.checked) {
        unlockAudio();
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          await Notification.requestPermission().catch(() => {});
        }
        if (typeof autoEnablePush === 'function') await autoEnablePush().catch(() => {});
      }
      await syncOverdueDigestToSw();
      if (typeof toast === 'function') toast(e.target.checked ? 'تم تفعيل المنبّه الذهبي بالخلفية ✓' : 'تم إيقاف المنبّه الدوري');
    };
  }
  if ($('azk_voice')) {
    $('azk_voice').onchange = e => {
      localStorage.setItem('azkar_voice_on', e.target.checked ? 'on' : 'off');
      if (e.target.checked) playBackgroundAzkarToneAndVoice('تم تفعيل المنبّه الناطق بنجاح');
    };
  }
  if ($('azk_min')) {
    $('azk_min').onchange = async e => {
      localStorage.setItem('azkar_reminder_min', e.target.value);
      await syncOverdueDigestToSw();
      if (typeof toast === 'function') toast('تم ضبط تكرار التذكير كل ' + e.target.value + ' دقيقة ✓');
    };
  }
  if ($('azk_test')) {
    $('azk_test').onclick = async () => {
      unlockAudio();
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') return alert('الرجاء السماح بالإشعارات أولاً.');
      }
      if (typeof autoEnablePush === 'function') {
        autoEnablePush().catch(() => {});
      }
      if (typeof toast === 'function') toast('⏳ اخرج للشاشة الرئيسية الآن فوراً! سينطلق الإشعار والصوت خلال 4 ثوانٍ...');
      // نمرر المهلة (4000ms) مباشرة للـ Service Worker وللمحرك الصوتي حتى لا يتجمد عند الخروج للشاشة الرئيسية
      triggerAzkarCheckNow(true, 4000);
    };
  }
}
