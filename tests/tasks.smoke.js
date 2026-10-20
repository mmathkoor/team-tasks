const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path').resolve(__dirname, '..') + '/';
let html = fs.readFileSync(path + 'index.html', 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => s === '/api/config' ? '' : '<script>' + fs.readFileSync(path + s.replace(/^\//, ''), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
html = html.replace(/<link rel="stylesheet"[^>]*>/g, '');
const errs = [], writes = []; let wsInst = null;
const now = new Date(); const iso = d => new Date(now.getTime() + d * 864e5).toISOString();
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://t.example/', pretendToBeVisual: true, beforeParse(w) {
  w.localStorage.setItem('sbs', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { email: 'm@x.com' } }));
  w.addEventListener('error', e => errs.push('ERR ' + e.message));
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.alert = m => errs.push('ALERT ' + m); w.confirm = () => false;
  w.WebSocket = class { constructor(u) { this.readyState = 1; wsInst = this; } send() {} close() {} };
  const G = 'g1';
  const data = {
    members: [{ email: 'm@x.com', name: 'مروان', role: 'member' }, { email: 'b@x.com', name: 'علي', role: 'admin' }],
    meetings: [{ id: 'mt1', title: 'قسم الجودة', held_on: '2026-10-01' }],
    tasks: [
      { id: 'g-m', title: 'جماعية', status: 'todo', assignee_email: 'm@x.com', group_id: G, created_by: 'b@x.com', due_on: '2026-10-20' },
      { id: 'g-b', title: 'جماعية', status: 'done', assignee_email: 'b@x.com', group_id: G, created_by: 'b@x.com', done_note: 'أنهيت التقرير', completed_at: iso(-1) },
      { id: 'n1', title: 'عادية', status: 'todo', assignee_email: 'm@x.com', due_on: '2020-01-01', progress: 50 },
      { id: 'd1', title: 'منجزة', status: 'done', assignee_email: 'm@x.com', due_on: '2026-12-01', completed_at: iso(-2) } ],
    task_items: [{ id: 'i1', task_id: 'n1', text: 'بند أول', done: true, pos: 0 }, { id: 'i2', task_id: 'n1', text: 'بند ثان', done: false, pos: 1 }],
    notifications: [{ id: 'nn1', to_email: 'm@x.com', title: '🆕 مهمة جديدة', body: 'تم تكليفك', task_id: 'g-m', created_at: iso(0), read_at: null }, { id: 'nn2', to_email: 'm@x.com', title: 'تنبيه إداري', body: 'مرحبا', created_at: iso(0), read_at: null }],
    proposals: [], votes: [], task_done: [], recurring_tasks: [{ id: 'r1', title: 'متكررة', frequency: 'daily', for_all: true }] };
  w.fetch = async (u, o) => { const s = String(u); const t = s.split('/rest/v1/')[1]; const k = t ? t.split('?')[0] : '';
    if (s.includes('/api/')) { writes.push('API ' + s.split('/api/')[1] + ' ' + (o && o.body || '').slice(0, 400)); return { ok: true, status: 200, json: async () => ({ created: 0 }), text: async () => '' }; }
    if (o && o.method && o.method !== 'GET') { writes.push(o.method + ' ' + k + ' ' + (t.split('?')[1] || '') + ' ' + (o.body || '').slice(0, 2000)); return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; }
    if (s.includes('/api/')) return { ok: true, status: 200, json: async () => ({ created: 0 }), text: async () => '' };
    if (s.includes('order=created_at') && k === 'recurring_tasks') errs.push('recurring still orders by created_at');
    return { ok: true, status: 200, json: async () => (data[k] || []), text: async () => '' }; };
} });
const w = dom.window, d = w.document; const sleep = ms => new Promise(r => setTimeout(r, ms));
setTimeout(async () => {
  const out = {};
  out.bell = d.querySelector('.bn')?.textContent; out.alertOnOpen = d.querySelector('#alert_ov h2')?.textContent;
  d.getElementById('al_x').click(); await sleep(60); out.markedRead = writes.filter(x => x.startsWith('PATCH notifications')).length;
  out.kpis = [...d.querySelectorAll('.stats.kpis .stat')].map(e => e.querySelector('span').textContent + '=' + e.querySelector('b').textContent);
  out.groupChip = d.querySelector('.tk[data-id=g-m] .chip.all')?.textContent;
  out.ckRows = d.querySelectorAll('.tk[data-id=n1] .ckrow').length; out.doneNoteOnCard = false;
  out.meetBtn = !!d.getElementById('nmt');
  // checklist toggle from card
  d.querySelector('[data-ci=i2]').checked = true; d.querySelector('[data-ci=i2]').dispatchEvent(new w.Event('change')); await sleep(100);
  out.ckWrites = writes.filter(x => /task_items|PATCH tasks/.test(x)).map(x => x.slice(0, 110));
  // group completion asks for note
  d.querySelector('[data-mv=g-m][data-to=done]').click(); out.askDone = !!d.getElementById('dn_t');
  d.getElementById('dn_t').value = 'أنجزت الجزء الخاص بي'; d.getElementById('dn_ok').click(); await sleep(100);
  out.doneWrite = writes.filter(x => x.includes('done_note')).pop()?.slice(0, 160);
  // create group task via dialog
  d.getElementById('nt').click(); d.getElementById('f_ti').value = 'مهمة للكل'; d.getElementById('f_as').value = '__all'; d.getElementById('f_as').dispatchEvent(new w.Event('change'));
  out.ckBoxVisibleOnGroupCreate = d.getElementById('ck_box').style.display !== 'none';
  d.getElementById('f_sv').click(); await sleep(200);
  const ins = writes.find(x => x.startsWith('POST tasks')); out.notifyBody = writes.filter(x => x.startsWith('API notify')).pop().slice(0, 420); out.groupInsertRows = ins ? (ins.match(/"assignee_email"/g) || []).length : 0; out.sameGroup = ins ? (new Set(ins.match(/"group_id":"[^"]+"/g)).size) : 0;
  out.notifyCall = true;
  // inbox + theme
  d.getElementById('bell').click(); out.inboxItems = d.querySelectorAll('.inb-i').length; d.getElementById('inb_x').click();
  d.getElementById('thm').click(); out.theme = d.documentElement.getAttribute('data-theme');
  // dashboard + settings
  d.querySelector('[data-nv=dash]').click(); out.dashLeader = d.body.textContent.includes('ترتيب الأعضاء'); out.dashNote = d.body.textContent.includes('أنهيت التقرير');
  w.eval("S.view='set'"); w.render(); out.recurList = d.getElementById('rc_list')?.textContent.slice(0, 40); await sleep(50); out.recurList2 = d.getElementById('rc_list')?.textContent.slice(0, 40);
  out.recurRunBtn = !!d.getElementById('rc_run');
  out.errs = errs; console.log(JSON.stringify(out, null, 1)); process.exit(0);
}, 1800);
