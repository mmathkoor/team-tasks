// ===== نافذة التنبيه المنبثقة + نغمة مطوّلة (تعمل والتطبيق مفتوح) =====
const ALERT = { q: [], cur: null, ctx: null, timer: null };
const alertSoundOn = () => localStorage.getItem('alert_sound') !== 'off';
function unlockAudio() {
  try {
    if (!ALERT.ctx) ALERT.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ALERT.ctx.state === 'suspended') ALERT.ctx.resume();
  } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
function chime(ctx, t0) {
  [[659.25, 0], [783.99, .18], [1046.5, .36], [783.99, .62], [1046.5, .8]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + d;
    o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.35, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + .55);
    o.start(s); o.stop(s + .6);
  });
}
function stopRing() { clearInterval(ALERT.timer); ALERT.timer = null; try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {} }
function startRing() {
  stopRing();
  if (!alertSoundOn() || document.hidden) return;
  unlockAudio();
  const ctx = ALERT.ctx; let n = 0;
  const tick = () => {
    try { if (ctx) { if (ctx.state === 'suspended') ctx.resume(); chime(ctx, ctx.currentTime + .02); } if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 800]); } catch (e) {}
    if (++n >= 18) stopRing();      // نحو 45 ثانية كحد أقصى
  };
  tick(); ALERT.timer = setInterval(tick, 2600);
}
function closeAlertOs(a) {
  if (!a || !a.tag || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(r => r.getNotifications({ tag: a.tag }).then(l => l.forEach(n => n.close()))).catch(() => {});
}
function showAlert(a) { ALERT.q.push(a); if (!ALERT.cur) nextAlert(); }
function nextAlert() {
  const a = ALERT.q.shift(); ALERT.cur = a || null;
  let ov = document.getElementById('alert_ov');
  if (!a) { stopRing(); if (ov) ov.remove(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'alert_ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  const t = a.task_id && S.tasks.find(x => x.id === a.task_id);
  ov.innerHTML = '<div class="al-box"><div class="al-bell">🔔</div><h2>' + esc(a.title || 'تنبيه') + '</h2><p>' + esc(a.body || '') + '</p>' +
    (ALERT.q.length ? '<div class="al-more">+ ' + ALERT.q.length + ' تنبيهات أخرى بانتظارك</div>' : '') +
    '<div class="al-act">' + (t && eff(t) !== 'done' ? '<button class="al-ok" id="al_done">إنجاز ✓</button>' : '') + (t ? '<button id="al_open">عرض المهمة</button>' : '') + '<button id="al_x">إغلاق</button></div></div>';
  startRing(); closeAlertOs(a);
  document.getElementById('al_x').onclick = nextAlert;
  if (t) document.getElementById('al_open').onclick = () => { ALERT.q = []; nextAlert(); S.view = 'board'; render(); taskDialog(S.tasks.find(x => x.id === t.id)); };
  if (document.getElementById('al_done')) document.getElementById('al_done').onclick = () => { moveTask(t.id, 'done'); nextAlert(); };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ALERT.cur) startRing(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { const m = e.data; if (m && typeof m === 'object' && m.type === 'alert') showAlert(m); });

function alertSettingsHtml() {
  return '<div class="card"><h2>🚨 نافذة التنبيه المنبثقة</h2>' +
    '<p class="m" style="margin-bottom:10px">عند وصول تنبيه والتطبيق مفتوح تظهر نافذة كبيرة مع نغمة واهتزاز حتى تتفاعل معها. (إذا كان التطبيق مغلقاً يصلك إشعار النظام المعتاد.)</p>' +
    '<label class="chk"><input type="checkbox" id="al_snd" ' + (alertSoundOn() ? 'checked' : '') + '> تشغيل النغمة والاهتزاز</label>' +
    '<div class="row" style="margin-top:10px"><button class="s" id="al_test">🔔 جرّب النافذة الآن</button></div></div>';
}
function bindAlertSettings() {
  $('al_snd').onchange = e => { localStorage.setItem('alert_sound', e.target.checked ? 'on' : 'off'); };
  $('al_test').onclick = () => { unlockAudio(); showAlert({ title: '🔔 تنبيه تجريبي', body: 'هكذا ستظهر لك التنبيهات والتطبيق مفتوح.' }); };
}
