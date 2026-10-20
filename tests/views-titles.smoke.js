const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path').resolve(__dirname, '..') + '/';
let base = fs.readFileSync(path + 'index.html', 'utf8');
base = base.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => s === '/api/config' ? '<script>window.__CFG=null;</script>' : '<script>' + fs.readFileSync(path + s.replace(/^\//, ''), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
base = base.replace(/<link rel="stylesheet"[^>]*>/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [], writes = [];
const data = { members: [{ email: 'm@x.com', name: 'مروان', role: 'admin', title: 'المدير العام' }, { email: 'o@x.com', name: 'عثمان', role: 'member', title: 'مسؤول التسويق' }],
  ord_settings: [{ id: true, hidden_views: ['orders', 'log'], app_name: 'متجرك' }], tasks: [], notifications: [], ord_orders: [] };
const dom = new JSDOM(base, { runScripts: 'dangerously', url: 'https://t.example/', pretendToBeVisual: true, beforeParse(w) {
  w.localStorage.setItem('sbs', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { email: 'm@x.com' } }));
  w.addEventListener('error', e => errs.push('ERR ' + e.message)); w.alert = m => errs.push('ALERT ' + m); w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.WebSocket = class { constructor() { this.readyState = 1; } send() {} close() {} };
  w.fetch = async (u, o) => { const s = String(u), t = s.split('/rest/v1/')[1], k = t ? t.split('?')[0] : ''; const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => '[]' }); if (s.includes('/api/')) return ok({});
    if (o && o.method && o.method !== 'GET') { writes.push(o.method + ' ' + k + ' ' + (t.split('?')[1] || '') + ' ' + (o.body || '')); return ok({}); } return ok(data[k] || []); };
} });
const w = dom.window, d = w.document;
setTimeout(async () => {
  const out = {};
  out.nav = [...d.querySelectorAll('.nav button')].map(b => b.dataset.nv).join(',');
  out.appName = d.querySelector('.brand h1')?.textContent; out.docTitle = d.title; out.sub = d.querySelector('.brand .sub')?.textContent.slice(0, 50);
  d.querySelector('[data-nv=more]').click(); out.more = [...d.querySelectorAll('.more-i')].map(b => b.dataset.go).join(','); d.querySelector('[data-go=set]').click();
  out.titleInputs = d.querySelectorAll('[data-mt]').length; const ti = d.querySelector('[data-mt="o@x.com"]'); ti.value = 'المسؤول المالي'; d.querySelector('[data-mts="o@x.com"]').click(); await sleep(100);
  out.titleWrite = writes.find(x => x.includes('members') && x.includes('title'));
  out.viewsCard = [...d.querySelectorAll('[data-vw]')].map(c => c.dataset.vw + ':' + (c.checked ? 'on' : 'off')).join(' ');
  d.querySelector('[data-vw=orders]').checked = true; d.querySelector('[data-vw=dash]').checked = false; d.getElementById('vw_sv').click(); await sleep(120);
  out.viewsWrite = writes.find(x => x.includes('ord_settings')); out.errs = errs; console.log(JSON.stringify(out, null, 1)); process.exit(0);
}, 1500);
