// ===== التحديث اللحظي (Supabase Realtime عبر WebSocket بدون مكتبات) =====
const RT = { ws: null, ref: 0, hb: null, tk: null, retry: 0, timer: null, rc: null, dirty: false };
const RT_TABLES = ['tasks', 'task_done', 'proposals', 'votes', 'meetings', 'members'];
function rtStart() {
  if (RT.ws || !S.me || !AUTH.s || !navigator.onLine) return;
  let ws;
  try { ws = new WebSocket(API.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + KEY + '&vsn=1.0.0'); } catch (e) { return; }
  RT.ws = ws;
  const send = (topic, event, payload) => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++RT.ref) })); };
  ws.onopen = async () => {
    RT.retry = 0;
    send('realtime:public', 'phx_join', { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: RT_TABLES.map(table => ({ event: '*', schema: 'public', table })) }, access_token: await tok() });
    RT.hb = setInterval(() => send('phoenix', 'heartbeat', {}), 25000);
    RT.tk = setInterval(async () => send('realtime:public', 'access_token', { access_token: await tok() }), 10 * 60 * 1000);
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m.event === 'postgres_changes') rtChanged(); };
  ws.onclose = () => {
    clearInterval(RT.hb); clearInterval(RT.tk); RT.ws = null;
    clearTimeout(RT.rc); RT.rc = setTimeout(rtStart, Math.min(30000, 1500 * Math.pow(2, RT.retry++)));
  };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
function rtChanged() {
  clearTimeout(RT.timer);
  RT.timer = setTimeout(() => {
    if (document.hidden || (typeof dlg !== 'undefined' && dlg.open) || document.querySelector('.tk.drag')) { RT.dirty = true; return; }
    load();
  }, 500);
}
dlg.addEventListener('close', () => { if (RT.dirty) { RT.dirty = false; load(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) rtStart(); });
window.addEventListener('online', () => { RT.retry = 0; rtStart(); });
