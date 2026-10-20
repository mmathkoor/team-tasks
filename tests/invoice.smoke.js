const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path').resolve(__dirname, '..') + '/';
let base = fs.readFileSync(path + 'index.html', 'utf8');
base = base.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => s === '/api/config' ? '' : '<script>' + fs.readFileSync(path + s.replace(/^\//, ''), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
base = base.replace(/<link rel="stylesheet"[^>]*>/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const data = { members: [{ email: 'm@x.com', name: 'مروان', role: 'admin' }],
  ord_orders: [{ id: 'o1', order_no: 7, order_date: '2026-10-18', customer_name: 'أحمد', phone: '777123456', address: 'صنعاء', status: 'delivered', subtotal: 5000, delivery_fee: 500, discount: 0, total: 5500, paid: 1000, balance: 4500, created_by: 'm@x.com' }],
  ord_items: [{ id: 'i1', order_id: 'o1', pos: 0, name: 'ساعة', qty: 2, price: 2500, line_total: 5000, supplier: 'تاجر سري' }], ord_item_costs: [{ item_id: 'i1', cost: 1800 }], tasks: [], notifications: [] };
const errs = [], opened = [];
const dom = new JSDOM(base, { runScripts: 'dangerously', url: 'https://t.example/', pretendToBeVisual: true, beforeParse(w) {
  w.localStorage.setItem('sbs', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { email: 'm@x.com' } }));
  w.addEventListener('error', e => errs.push('ERR ' + e.message)); w.alert = m => errs.push('ALERT ' + m); w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.WebSocket = class { constructor() { this.readyState = 1; } send() {} close() {} };
  w.open = () => { const doc = new w.DOMParser().parseFromString('<html><body></body></html>', 'text/html'); const fake = { document: { _h: '', open() {}, write(h) { this._h += h; }, close() {} } }; opened.push(fake); return fake; };
  w.fetch = async (u, o) => { const s = String(u), t = s.split('/rest/v1/')[1], k = t ? t.split('?')[0] : ''; const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => '[]' }); if (s.includes('/api/')) return ok({}); return ok(data[k] || []); };
} });
const w = dom.window, d = w.document;
setTimeout(async () => {
  const out = {}; const o = w.eval("S.orders[0]");
  const html = w.invoiceDoc(o, false);
  out.docOk = html.startsWith('<!DOCTYPE html>') && html.includes('dir="rtl"') && html.includes('فاتورة #7');
  out.hasItemsAndTotals = html.includes('ساعة') && html.includes('5,500') && html.includes('4,500');
  out.hidesSupplierAndCost = !html.includes('تاجر سري') && !html.includes('1,800') && !/سعر الشراء|cost/i.test(html);
  out.hasFont = html.includes('/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2');
  w.eval("S.view='orders'"); w.render(); d.querySelector('[data-oc=delivered]')?.click(); d.querySelector('[data-oa=inv][data-id=o1]').click();
  out.btns = [...d.querySelectorAll('.dact button')].map(b => b.id).join(',');
  d.getElementById('iv_o').click(); out.openedWindow = opened.length === 1 && opened[0].document._h.includes('window.print()');
  let printed = false; const origCreate = d.createElement.bind(d);
  d.createElement = tag => { const el = origCreate(tag); if (tag === 'iframe') { const iv = setInterval(() => { try { if (el.contentWindow) { el.contentWindow.print = () => { printed = true; }; clearInterval(iv); } } catch (e) {} }, 1); } return el; };
  d.getElementById('iv_p').click(); await sleep(3200);
  out.iframePrinted = printed; out.errs = errs; console.log(JSON.stringify(out, null, 1)); process.exit(0);
}, 1600);
