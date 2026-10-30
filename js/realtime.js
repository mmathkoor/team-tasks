// ===== التحديث اللحظي (Supabase Realtime عبر WebSocket بدون مكتبات) =====
const RT = { ws: null, ref: 0, hb: null, tk: null, retry: 0, timer: null, rc: null, dirty: false };
const RT_BASE = ['tasks', 'task_done', 'proposals', 'votes', 'members', 'notifications'];
const RT_ORD = ['ord_orders', 'ord_items', 'ord_payments', 'ord_settings'];
const rtTables = () => (S.me && S.me.role === 'rep') ? ['notifications'] : RT.safe ? RT_BASE : RT_BASE.concat(RT_ORD);
function rtStart() {
  if (RT.ws || !S.me || !AUTH.s || !navigator.onLine) return;
  let ws;
  try { ws = new WebSocket(API.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + KEY + '&vsn=1.0.0'); } catch (e) { return; }
  RT.ws = ws;
  const send = (topic, event, payload) => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++RT.ref) })); };
  ws.onopen = async () => {
    RT.retry = 0;
    send('realtime:public', 'phx_join', { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: rtTables().map(table => ({ event: '*', schema: 'public', table })) }, access_token: await tok() });
    RT.hb = setInterval(() => send('phoenix', 'heartbeat', {}), 25000);
    RT.tk = setInterval(async () => send('realtime:public', 'access_token', { access_token: await tok() }), 10 * 60 * 1000);
  };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.event === 'postgres_changes') {
      try {
        const d = m.payload && m.payload.data;
        if (d && d.table === 'notifications' && d.type === 'INSERT' && d.record) {
          const r = d.record;
          if (S.me && same(r.to_email, S.me.email) && typeof showAlert === 'function') {
            showAlert({ title: r.title, body: r.body, task_id: r.task_id, order_id: r.order_id, nid: r.id });
          }
        }
      } catch (err) {}
      rtChanged();
    }
    else if (m.event === 'phx_reply' && m.topic === 'realtime:public' && m.payload && m.payload.status === 'error' && !RT.safe) { RT.safe = true; try { ws.close(); } catch (_) {} }
  };
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
