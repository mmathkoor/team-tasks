const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path').resolve(__dirname, '..') + '/';
let base = fs.readFileSync(path + 'index.html', 'utf8');
base = base.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => s === '/api/config' ? '' : '<script>' + fs.readFileSync(path + s.replace(/^\//, ''), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
base = base.replace(/<link rel="stylesheet"[^>]*>/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [], writes = []; let confirmAns = false;
const data = { members: [{ email: 'm@x.com', name: 'مروان', role: 'admin' }, { email: 'Ali@x.com', name: 'علي', role: 'member' }, { email: 'ali@x.com', name: 'علي', role: 'member' }],
  tasks: [{ id: 'a1', title: 'تقرير', assignee_email: 'ali@x.com', status: 'todo', due_on: '2026-10-20', created_at: '2026-10-18T08:00:00Z' }, { id: 'a2', title: 'تقرير ', assignee_email: 'ali@x.com', status: 'todo', due_on: '2026-10-20', created_at: '2026-10-18T08:00:05Z' }, { id: 'b1', title: 'أخرى', assignee_email: 'm@x.com', status: 'done', created_at: '2026-10-18T08:00:00Z' }],
  ord_orders: [], ord_settings: [{ id: true }], notifications: [] };
const dom = new JSDOM(base, { runScripts: 'dangerously', url: 'https://t.example/', pretendToBeVisual: true, beforeParse(w) {
  w.localStorage.setItem('sbs', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { email: 'm@x.com' } }));
  w.addEventListener('error', e => errs.push('ERR ' + e.message)); w.alert = m => errs.push('ALERT ' + m); w.confirm = () => confirmAns;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.WebSocket = class { constructor() { this.readyState = 1; } send() {} close() {} };
  w.fetch = async (u, o) => { const s = String(u), t = s.split('/rest/v1/')[1], k = t ? t.split('?')[0] : ''; const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => '[]' }); if (s.includes('/api/')) return ok({});
    if (o && o.method && o.method !== 'GET') { writes.push(o.method + ' ' + k + ' ' + (t.split('?')[1] || '') + ' ' + (o.body || '').slice(0, 900)); return ok({}); } return ok(data[k] || []); };
} });
const w = dom.window, d = w.document; const dlg = d.getElementById('dlg');
setTimeout(async () => {
  const out = {};
  // dirty dialog survives backdrop click
  d.getElementById('nt').click(); out.openBefore = dlg.open; d.getElementById('f_ti').value = 'مهمة مهمة'; d.getElementById('f_ti').dispatchEvent(new w.Event('input', { bubbles: true }));
  dlg.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); out.stillOpenAfterBackdropWhenDirty = dlg.open; out.titleKept = d.getElementById('f_ti').value;
  const ev = new w.Event('cancel', { cancelable: true }); confirmAns = false; dlg.dispatchEvent(ev); out.escPreventedWhenDirty = ev.defaultPrevented;
  d.getElementById('f_cx').click(); out.closedByButton = !dlg.open;
  // clean dialog closes on backdrop
  d.getElementById('nt').click(); dlg.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); out.cleanClosesOnBackdrop = !dlg.open;
  // group creation: no duplicate copy per person (Ali@ vs ali@)
  d.getElementById('nt').click(); d.getElementById('f_ti').value = 'للكل'; d.getElementById('f_as').value = '__all'; d.getElementById('f_as').dispatchEvent(new w.Event('change'));
  d.getElementById('f_sv').click(); await sleep(250);
  const ins = writes.find(x => x.startsWith('POST tasks')) || ''; out.groupRows = (ins.match(/"assignee_email"/g) || []).length;
  // duplicate scanner
  w.eval("S.view='set'"); w.render(); out.dupGroups = w.dupGroups().length; out.dupBtn = d.querySelector('[data-dup]')?.dataset.dup;
  confirmAns = true; d.querySelector('[data-dup]').click(); await sleep(150); out.dupDelete = writes.find(x => x.startsWith('DELETE tasks'));
  out.errs = errs; console.log(JSON.stringify(out, null, 1)); process.exit(0);
}, 1500);
