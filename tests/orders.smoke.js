const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path').resolve(__dirname, '..') + '/';
let base = fs.readFileSync(path + 'index.html', 'utf8');
base = base.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => s === '/api/config' ? '' : '<script>' + fs.readFileSync(path + s.replace(/^\//, ''), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
base = base.replace(/<link rel="stylesheet"[^>]*>/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function boot(email, data, rpcData) {
  const log = { errs: [], writes: [], rpc: [] };
  const dom = new JSDOM(base, { runScripts: 'dangerously', url: 'https://t.example/', pretendToBeVisual: true, beforeParse(w) {
    w.localStorage.setItem('sbs', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { email } }));
    w.addEventListener('error', e => log.errs.push('ERR ' + e.message));
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
    w.alert = m => log.errs.push('ALERT ' + m); w.confirm = () => true; w.open = u => log.writes.push('OPEN ' + u.slice(0, 60));
    w.WebSocket = class { constructor() { this.readyState = 1; } send() {} close() {} };
    w.fetch = async (u, o) => { const s = String(u), t = s.split('/rest/v1/')[1], k = t ? t.split('?')[0] : '';
      const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
      if (s.includes('/api/')) { log.writes.push('API ' + s.split('/api/')[1] + ' ' + (o && o.body || '').slice(0, 120)); return ok({}); }
      if (k.startsWith('rpc/')) { log.rpc.push(k + ' ' + (o.body || '')); return ok(k === 'rpc/rep_orders' ? rpcData : null); }
      if (o && o.method && o.method !== 'GET') { log.writes.push(o.method + ' ' + k + ' ' + (t.split('?')[1] || '') + ' ' + (o.body || '').slice(0, 1500)); return ok({}); }
      return ok(data[k] || []); };
  } });
  return { dom, log, w: dom.window, d: dom.window.document };
}
(async () => {
  // ===== staff =====
  const staff = { members: [{ email: 'm@x.com', name: 'مروان', role: 'admin' }, { email: 'o@x.com', name: 'عثمان', role: 'member' }, { email: 'rep1@x.com', name: 'شهاب', role: 'rep' }],
    ord_orders: [{ id: 'o1', order_no: 101, order_date: new Date().toISOString().slice(0, 10), customer_name: 'أحمد', phone: '777123456', address: 'صنعاء - حدة', status: 'new', rep_email: null, delivery_fee: 500, discount: 0, subtotal: 3000, paid: 1000, total: 3500, balance: 2500, created_by: 'o@x.com', notes: 'اتصل قبل الوصول' },
      { id: 'o2', order_no: 100, order_date: '2026-10-01', customer_name: 'سالم', phone: '777000111', status: 'delivered', rep_email: 'rep1@x.com', subtotal: 1000, paid: 0, total: 1000, balance: 1000, delivery_fee: 0, discount: 0, created_by: 'm@x.com' }],
    ord_items: [{ id: 'i1', order_id: 'o1', pos: 0, name: 'ساعة', qty: 2, price: 1500, line_total: 3000 }, { id: 'i2', order_id: 'o2', pos: 0, name: 'سوار', qty: 1, price: 1000, line_total: 1000 }],
    ord_payments: [{ id: 'p1', order_id: 'o1', amount: 1000, method: 'نقداً', paid_on: '2026-10-16', created_by: 'o@x.com' }], ord_events: [{ id: 1, order_id: 'o1', at: new Date().toISOString(), actor: 'o@x.com', kind: 'created', detail: {} }], tasks: [], notifications: [] };
  const S1 = boot('m@x.com', staff, []); await sleep(1500); const { d, w, log } = S1; const out = { staff: {} }, o = out.staff;
  o.nav = [...d.querySelectorAll('.nav button')].map(b => b.dataset.nv).join(',');
  d.querySelector('[data-nv=more]').click(); o.more = [...d.querySelectorAll('.more-i')].map(b => b.dataset.go).join(','); d.querySelector('[data-go=set]').click(); o.moreSetView = !!d.getElementById('send_ping') || d.body.textContent.includes('إعدادات'); d.querySelector('[data-nv=orders]').click();
  o.kpis = [...d.querySelectorAll('.stats.kpis .stat')].map(e => e.querySelector('span').textContent + '=' + e.querySelector('b').textContent).join(' | ');
  o.cols = [...d.querySelectorAll('.ob .col .ch')].map(e => e.textContent).join(',');
  o.card = d.querySelector('.oc[data-oid=o1]').textContent.replace(/\s+/g, ' ').slice(0, 130);
  d.getElementById('o_q').value = 'سالم'; d.getElementById('o_q').dispatchEvent(new w.Event('input')); o.searchCards = d.querySelectorAll('.oc').length; d.getElementById('o_q').value = ''; d.getElementById('o_q').dispatchEvent(new w.Event('input'));
  d.querySelector('[data-oa=assign][data-id=o1]').click(); o.assignOpts = d.querySelectorAll('#as_r option').length; d.getElementById('as_ok').click(); await sleep(200);
  o.assignWrite = log.writes.find(x => x.startsWith('PATCH ord_orders')); o.pushCalled = log.writes.some(x => x.startsWith('API order-push'));
  d.getElementById('o_new').click(); d.getElementById('o_nm').value = 'عميل جديد'; d.getElementById('o_ph').value = '777123456'; d.getElementById('o_ph').dispatchEvent(new w.Event('change'));
  o.autofillAddress = d.getElementById('o_ad').value; o.custInfo = d.getElementById('o_info').textContent.trim().slice(0, 60);
  const inn = d.querySelector('#o_items .in'), iq = d.querySelector('#o_items .iq'), ip = d.querySelector('#o_items .ip'); inn.value = 'ساعة'; inn.dispatchEvent(new w.Event('input')); inn.dispatchEvent(new w.Event('change'));
  o.priceAutofill = d.querySelector('#o_items .ip').value; d.querySelector('#o_items .iq').value = '3'; d.querySelector('#o_items .iq').dispatchEvent(new w.Event('input')); d.getElementById('o_fee').value = '500'; d.getElementById('o_fee').dispatchEvent(new w.Event('input'));
  o.totals = d.getElementById('o_tot').textContent.replace(/\s+/g, ' ');
  d.getElementById('o_sv').click(); await sleep(250);
  const wr = log.writes.filter(x => x.startsWith('POST ord_')); o.createWrites = wr.map(x => x.slice(0, 60)); o.itemsPayload = (wr.find(x => x.startsWith('POST ord_items')) || '').includes('"name":"ساعة"');
  const o2 = d.querySelector('[data-oid=o2]'); 
  d.querySelector('[data-oid=o1]').click(); o.editDialog = !!d.getElementById('o_pays'); o.events = d.getElementById('o_ev') ? 'ok' : 'none'; d.getElementById('o_cx').click();
  d.querySelector('[data-nv=orders]').click(); w.eval("S.ocol='delivered'"); w.render(); d.querySelector('[data-oa=inv][data-id=o2]').click(); o.invoice = d.querySelector('.inv') ? d.querySelector('.inv-s').textContent.replace(/\s+/g, ' ').slice(0, 90) : 'none'; d.getElementById('iv_x').click();
  d.querySelector('[data-oa=pay][data-id=o2]').click(); d.getElementById('pm_ok').click(); await sleep(150); o.payWrite = log.writes.find(x => x.startsWith('POST ord_payments'))?.slice(0, 120);
  w.eval("S.ocol='preparing'"); w.render(); const cb = d.querySelector('[data-oa=cancel]'); if (cb) { cb.click(); o.cancelDisabledInitially = d.getElementById('cn_ok').disabled; d.getElementById('cn_r').value = 'العميل لا يرد'; d.getElementById('cn_r').dispatchEvent(new w.Event('input')); d.getElementById('cn_ok').click(); await sleep(150); o.cancelWrite = log.writes.filter(x => x.startsWith('PATCH ord_orders')).pop()?.slice(0, 160); }
  o.errs = log.errs;
  // ===== rep =====
  const repData = { members: [{ email: 'rep1@x.com', name: 'شهاب', role: 'rep' }], notifications: [{ id: 'n1', to_email: 'rep1@x.com', title: '🛵 طلب جديد للتوصيل #101', body: 'أحمد', order_id: 'o1', created_at: new Date().toISOString(), read_at: null }] };
  const rows = [{ id: 'o1', order_no: 101, order_date: '2026-10-17', customer_name: 'أحمد', phone: '777123456', address: 'صنعاء - حدة', notes: 'اتصل قبل الوصول', status: 'preparing', created_by_name: 'عثمان', collect: 2500, items: [{ name: 'ساعة', qty: 2 }, { name: 'سوار', qty: 1 }] },
    { id: 'o9', order_no: 99, order_date: '2026-10-16', customer_name: 'خالد', status: 'cancelled', cancel_reason: 'لا يرد', created_by_name: 'عثمان', collect: 0, items: [] }];
  const R = boot('rep1@x.com', repData, rows); await sleep(1500); const rd = R.d, rw = R.w, rl = R.log; out.rep = {}; const r = out.rep;
  r.nav = rd.querySelectorAll('.nav').length; r.cards = rd.querySelectorAll('.rcard').length; r.hasTasksUI = !!rd.querySelector('[data-nv=board]');
  r.cardText = rd.querySelector('.rcard').textContent.replace(/\s+/g, ' ').slice(0, 220); r.noPriceWord = !/السعر|price/.test(rd.querySelector('.rcard').innerHTML);
  r.alertOnOpen = rd.querySelector('#alert_ov h2')?.textContent; r.alertHasOrderBtn = !!rd.getElementById('al_order'); rd.getElementById('al_x').click();
  rd.querySelector('[data-re]').click(); r.preview = rd.querySelector('.msgp')?.textContent.split('\n').slice(0, 3).join(' | '); rd.getElementById('rv_x').click();
  rd.querySelector('[data-rc]').click(); r.cancelBtnDisabled = rd.getElementById('rc_ok').disabled; rd.getElementById('rc_r').value = 'ab'; rd.getElementById('rc_r').dispatchEvent(new rw.Event('input')); r.shortReasonStillDisabled = rd.getElementById('rc_ok').disabled;
  rd.getElementById('rc_r').value = 'العميل لا يرد'; rd.getElementById('rc_r').dispatchEvent(new rw.Event('input')); rd.getElementById('rc_ok').click(); await sleep(200);
  r.rpcCalls = rl.rpc; r.pushAfter = rl.writes.some(x => x.startsWith('API order-push'));
  rd.querySelector('[data-rd]') && (rd.querySelector('[data-rd]').click(), rd.getElementById('rdv_ok').click(), await sleep(150)); r.rpcCalls2 = rl.rpc.length;
  r.recent = rd.querySelectorAll('.rdone').length; r.errs = rl.errs;
  console.log(JSON.stringify(out, null, 1)); process.exit(0);
})();
