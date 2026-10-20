const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path').resolve(__dirname, '..') + '/';
let base = fs.readFileSync(path + 'index.html', 'utf8');
base = base.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => s === '/api/config' ? '' : '<script>' + fs.readFileSync(path + s.replace(/^\//, ''), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
base = base.replace(/<link rel="stylesheet"[^>]*>/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);
const data = { members: [{ email: 'm@x.com', name: 'مروان', role: 'admin' }, { email: 'o@x.com', name: 'عثمان', role: 'member' }, { email: 'rep967@rep.invalid', name: 'شهاب', role: 'rep', phone: '967777000111' }],
  ord_orders: [
    { id: 'o1', order_no: 3, order_date: today, customer_name: 'أحمد', phone: '777123456', status: 'delivered', rep_email: 'rep967@rep.invalid', created_by: 'o@x.com', channel: 'واتساب', subtotal: 5000, delivery_fee: 500, discount: 0, total: 5500, paid: 5500, balance: 0, created_at: today + 'T08:00:00Z', delivered_at: today + 'T11:00:00Z' },
    { id: 'o2', order_no: 2, order_date: today, customer_name: 'سالم', phone: '777000222', status: 'cancelled', rep_email: 'rep967@rep.invalid', created_by: 'm@x.com', channel: 'تيك توك', subtotal: 2000, delivery_fee: 0, discount: 0, total: 2000, paid: 0, balance: 2000, cancel_reason: 'العميل لا يرد', created_at: today + 'T08:00:00Z' },
    { id: 'o3', order_no: 1, order_date: today, customer_name: 'خالد', phone: '777000333', status: 'delivered', rep_email: 'rep967@rep.invalid', created_by: 'o@x.com', channel: 'واتساب', subtotal: 3000, delivery_fee: 0, discount: 0, total: 3000, paid: 1000, balance: 2000, created_at: today + 'T08:00:00Z', delivered_at: today + 'T12:00:00Z' }],
  ord_items: [{ id: 'i1', order_id: 'o1', pos: 0, name: 'ساعة', qty: 2, price: 2500, line_total: 5000, supplier: 'تاجر الأمل' }, { id: 'i2', order_id: 'o3', pos: 0, name: 'سوار', qty: 1, price: 3000, line_total: 3000, supplier: 'تاجر النور' }, { id: 'i3', order_id: 'o2', pos: 0, name: 'ساعة', qty: 1, price: 2000, line_total: 2000, supplier: 'تاجر الأمل' }],
  ord_item_costs: [{ item_id: 'i1', cost: 1800 }, { item_id: 'i2', cost: 2200 }], ord_payments: [], ord_settings: [{ id: true, staff_can_cost: false, store_name: 'مذكور ستور' }], tasks: [], notifications: [] };
const errs = [], writes = [];
const dom = new JSDOM(base, { runScripts: 'dangerously', url: 'https://t.example/', pretendToBeVisual: true, beforeParse(w) {
  w.localStorage.setItem('sbs', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { email: 'm@x.com' } }));
  w.addEventListener('error', e => errs.push('ERR ' + e.message)); w.alert = m => errs.push('ALERT ' + m); w.confirm = () => true; w.open = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.WebSocket = class { constructor() { this.readyState = 1; } send() {} close() {} };
  w.URL.createObjectURL = () => 'blob:x';
  w.fetch = async (u, o) => { const s = String(u), t = s.split('/rest/v1/')[1], k = t ? t.split('?')[0] : ''; const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
    if (s.includes('/api/')) { writes.push('API ' + s.split('/api/')[1] + ' ' + (o && o.body || '').slice(0, 200)); return ok({ ok: true }); }
    if (o && o.method && o.method !== 'GET') { writes.push(o.method + ' ' + k + ' ' + (o.body || '').slice(0, 300)); return ok({}); }
    return ok(data[k] || []); };
} });
const w = dom.window, d = w.document;
setTimeout(async () => {
  const out = {};
  d.querySelector('[data-nv=orders]').click(); d.querySelector('[data-otab=reports]').click();
  const txt = d.querySelector('.view').textContent.replace(/\s+/g, ' ');
  out.reportHeads = [...d.querySelectorAll('.view h2, .view h3')].map(e => e.textContent.trim()).slice(0, 14);
  out.hasRepTable = txt.includes('شهاب'); out.hasSupplier = txt.includes('تاجر الأمل') && txt.includes('تاجر النور'); out.hasProfitWord = /ربح/.test(txt);
  out.kpis = [...d.querySelectorAll('.rpk .stat')].map(e => e.querySelector('span').textContent + '=' + e.querySelector('b').textContent).join(' | ');
  out.csvButtons = d.querySelectorAll('[data-ex]').length; if (d.querySelector('[data-ex]')) d.querySelector('[data-ex]').click();
  out.cancelReasons = txt.includes('العميل لا يرد');
  // settings: reps admin card
  w.eval("S.view='set'"); w.render(); out.repsCard = d.querySelector('.view').textContent.includes('مندوبو التوصيل'); out.repPhoneShown = d.querySelector('.view').textContent.includes('777000111');
  const hasForm = !!d.getElementById('rp_phone') || !!d.querySelector('[id*=rep][id*=phone]'); out.repForm = hasForm;
  out.ids = [...d.querySelectorAll('.view [id]')].map(e => e.id).filter(i => /rp|rep|cost|store|img/i.test(i)).slice(0, 14);
  out.errs = errs; console.log(JSON.stringify(out, null, 1)); process.exit(0);
}, 1700);
