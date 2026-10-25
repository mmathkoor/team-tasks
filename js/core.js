let AUTH = { s: null };
try { AUTH.s = JSON.parse(localStorage.getItem('sbs') || 'null'); } catch(e){}
const saveS = s => { AUTH.s = s; s ? localStorage.setItem('sbs', JSON.stringify(s)) : localStorage.removeItem('sbs'); idbSet('sbs', s || null); };

async function tok() {
  const s = AUTH.s;
  if (!s) return KEY;
  if (s.expires_at && s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try {
    const r = await fetch(API + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    const j = await r.json();
    if (!r.ok) { saveS(null); return KEY; }
    j.expires_at = Math.floor(Date.now() / 1000) + j.expires_in; saveS(j); return j.access_token;
  } catch (e) { return s?.access_token || KEY; }
}

function getOfflineTableRef(table) {
  if (table === 'ord_settings') return S.ordSet ? [S.ordSet] : [];
  const map = {
    members: 'rawMembers',
    meetings: 'rawMeetings',
    tasks: 'rawTasks',
    task_done: 'done',
    task_items: 'items',
    proposals: 'rawProps',
    votes: 'votes',
    notifications: 'notes',
    ord_orders: 'rawOrders',
    ord_items: 'rawOitems',
    ord_payments: 'rawOpay',
    companies: 'companiesRows',
    erp_supplier_payments: 'dbSupPay',
    erp_rep_handovers: 'dbRepHand',
    erp_expenses: 'dbExpenses'
  };
  const k = map[table];
  if (k && Array.isArray(S[k])) return S[k];
  if (Array.isArray(S[table])) return S[table];
  return [];
}

function parseSearchParamsEq(params) {
  const filters = [];
  if (!params || !params.entries) return filters;
  for (const [k, v] of params.entries()) {
    if (String(v).startsWith('eq.')) filters.push([k, String(v).slice(3)]);
    else if (String(v).startsWith('ilike.')) filters.push([k, String(v).slice(6)]);
  }
  return filters;
}

function applyOptimisticLocal(table, method, params, body) {
  try {
    if (table === 'ord_settings' && (method === 'PATCH' || method === 'POST') && body) {
      S.ordSet = Object.assign({}, S.ordSet || { id: true }, body);
      if (typeof saveCache === 'function') saveCache();
      return;
    }
    const map = {
      members: ['rawMembers', 'allMembers', 'members'],
      meetings: ['rawMeetings', 'meetings'],
      tasks: ['rawTasks', 'tasks'],
      task_done: ['done'],
      task_items: ['items'],
      proposals: ['rawProps', 'props'],
      votes: ['votes'],
      ord_orders: ['rawOrders', 'orders'],
      ord_items: ['rawOitems', 'oitems'],
      ord_payments: ['rawOpay', 'opay'],
      erp_supplier_payments: ['dbSupPay', 'rawSupPay', 'supPay'],
      erp_rep_handovers: ['dbRepHand', 'rawRepHand', 'repHand'],
      erp_expenses: ['dbExpenses', 'rawExpenses', 'expenses']
    };
    const keys = map[table];
    if (!keys) return;
    const eqs = parseSearchParamsEq(params);
    const matchRow = r => eqs.length > 0 && eqs.every(([col, val]) => String(r[col] ?? '').toLowerCase() === String(val ?? '').toLowerCase());

    if (method === 'POST' && body) {
      const rows = (Array.isArray(body) ? body : [body]).filter(Boolean).map(r => Object.assign({ created_at: new Date().toISOString() }, r, r.id ? {} : { id: crypto.randomUUID() }));
      keys.forEach(k => {
        if (!Array.isArray(S[k])) S[k] = [];
        rows.forEach(nr => {
          const idx = S[k].findIndex(x => (nr.id && x.id === nr.id) || (table === 'task_done' && x.task_id === nr.task_id && same(x.email, nr.email)) || (table === 'votes' && x.proposal_id === nr.proposal_id && same(x.email, nr.email)));
          if (idx >= 0) S[k][idx] = Object.assign({}, S[k][idx], nr);
          else S[k].unshift(nr);
        });
      });
    } else if (method === 'PATCH' && body) {
      keys.forEach(k => {
        if (!Array.isArray(S[k])) return;
        S[k] = S[k].map(r => matchRow(r) ? Object.assign({}, r, body) : r);
      });
    } else if (method === 'DELETE') {
      keys.forEach(k => {
        if (!Array.isArray(S[k])) return;
        S[k] = S[k].filter(r => !matchRow(r));
      });
    }
    if (typeof saveCache === 'function') saveCache();
  } catch (e) {}
}

class Q {
  constructor(t) { this.t = t; this.m = 'GET'; this.p = new URLSearchParams(); this.b = null; this.pf = ''; }
  select(c) { this.p.set('select', c || '*'); return this; }
  order(c, o = {}) { this.p.set('order', c + (o.ascending === false ? '.desc' : '.asc') + (o.nullsFirst ? '.nullsfirst' : '.nullslast')); return this; }
  eq(c, v) { this.p.append(c, 'eq.' + v); return this; }
  insert(o) { this.m = 'POST'; this.b = o; return this; }
  upsert(o) { this.m = 'POST'; this.b = o; this.pf = 'resolution=merge-duplicates'; return this; }
  update(o) { this.m = 'PATCH'; this.b = o; return this; }
  delete() { this.m = 'DELETE'; return this; }
  limit(n) { this.p.set('limit', n); return this; }
  offset(n) { this.p.set('offset', n); return this; }
  is(c, v) { this.p.append(c, 'is.' + v); return this; }
  in(c, arr) { this.p.append(c, 'in.(' + arr.join(',') + ')'); return this; }
  lt(c, v) { this.p.append(c, 'lt.' + v); return this; }
  ilike(c, v) { this.p.append(c, 'ilike.' + v); return this; }
  single() { this.p.set('limit', 1); return this; }
  then(res, rej) { return this.run().then(res, rej); }
  async run() {
    const mut = this.m !== 'GET';
    if (!navigator.onLine) {
      if (!mut) {
        const rows = getOfflineTableRef(this.t).slice();
        const eqs = parseSearchParamsEq(this.p);
        const filtered = eqs.length ? rows.filter(r => eqs.every(([col, val]) => String(r[col] ?? '').toLowerCase() === String(val ?? '').toLowerCase())) : rows;
        return { data: filtered, error: null, offline: true };
      }
      applyOptimisticLocal(this.t, this.m, this.p, this.b);
      await enqueue({ path: '/rest/v1/' + this.t + '?' + this.p, m: this.m, pf: (this.pf ? this.pf + ',' : '') + 'return=minimal', b: this.b ? JSON.stringify(this.b) : null });
      return { data: null, error: null, queued: true };
    }
    try {
      const h = { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' };
      const pf = [this.pf, mut ? 'return=minimal' : ''].filter(Boolean).join(','); if (pf) h.Prefer = pf;
      const r = await fetch(API + '/rest/v1/' + this.t + '?' + this.p, { method: this.m, headers: h, body: this.b ? JSON.stringify(this.b) : undefined });
      if (!r.ok) { const e = await r.json().catch(() => ({})); return { data: null, error: { message: e.message || r.statusText } }; }
      return { data: mut ? null : await r.json(), error: null };
    } catch (e) {
      if (mut) {
        applyOptimisticLocal(this.t, this.m, this.p, this.b);
        await enqueue({ path: '/rest/v1/' + this.t + '?' + this.p, m: this.m, pf: (this.pf ? this.pf + ',' : '') + 'return=minimal', b: this.b ? JSON.stringify(this.b) : null });
        return { data: null, error: null, queued: true };
      }
      const rows = getOfflineTableRef(this.t).slice();
      const eqs = parseSearchParamsEq(this.p);
      const filtered = eqs.length ? rows.filter(r => eqs.every(([col, val]) => String(r[col] ?? '').toLowerCase() === String(val ?? '').toLowerCase())) : rows;
      return { data: filtered, error: null, offline: true };
    }
  }
}

const sb = {
  from: t => new Q(t),
  rpc: async (fn, args) => {
    try {
      const r = await fetch(API + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
      const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
      return r.ok ? { data: j, error: null } : { data: null, error: { message: (j && j.message) || r.statusText } };
    } catch (e) { return { data: null, error: { message: 'تعذّر الاتصال بالإنترنت' } }; }
  },
  auth: {
    getSession: async () => ({ data: { session: AUTH.s } }),
    signInWithPassword: async ({ email, password }) => {
      try {
        const r = await fetch(API + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const j = await r.json();
        if (!r.ok) {   // رسالة واضحة بحسب سبب الرفض الحقيقي (مع الرمز ليسهل التشخيص)
          const code = j.error_code || j.error || '', st = r.status, d = String(j.error_description || j.msg || j.message || '');
          const bad = code === 'invalid_credentials' || code === 'invalid_grant' || /invalid login credentials/i.test(d);
          const m = bad ? 'البريد أو كلمة المرور غير صحيحة'
            : code === 'email_not_confirmed' ? 'البريد الإلكتروني غير مؤكَّد — اطلب من الأدمن تأكيده'
            : code === 'user_banned' ? 'هذا الحساب موقوف'
            : st === 429 || /rate limit/i.test(code + d) ? 'محاولات كثيرة، انتظر بضع دقائق ثم أعد المحاولة'
            : st === 401 || st === 403 ? 'مفتاح الاتصال بالخادم (anon key) غير صالح — راجع إعدادات النشر'
            : st >= 500 ? 'الخادم لا يستجيب حالياً، حاول بعد قليل' : 'تعذّر تسجيل الدخول';
          return { error: { message: m + ' [' + st + (code ? ' · ' + code : '') + ']' } };
        }
        j.expires_at = Math.floor(Date.now() / 1000) + j.expires_in; saveS(j); init(); return { error: null };
      } catch (e) { return { error: { message: 'تعذّر الاتصال' } }; }
    },
    signOut: async () => saveS(null),
    updateUser: async ({ password }) => {
      try {
        const r = await fetch(API + '/auth/v1/user', { method: 'PUT', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        const j = await r.json().catch(() => ({}));
        return { error: r.ok ? null : { message: j.msg || 'تعذّر التحديث' } };
      } catch (e) { return { error: { message: 'تعذّر الاتصال' } }; }
    }
  }
};

const $ = id => document.getElementById(id);
const $app = $('app'), dlg = $('dlg');
const S = { me: null, members: [], meetings: [], tasks: [], done: [], props: [], votes: [], propsErr: false, view: 'board', filter: 'mine', meeting: '', col: 'todo', pf: 'open' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0, 10);
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const daysTo = d => Math.round((new Date(d) - new Date(today())) / 864e5);
const ST = { todo: 'للتنفيذ', doing: 'قيد العمل', done: 'منجزة' };
const ACT = { todo: [['doing', 'بدء التنفيذ'], ['done', 'إنجاز ✓']], doing: [['done', 'إنجاز ✓'], ['todo', 'إيقاف']], done: [['doing', 'إعادة فتح']] };
const ACT_ALL = { todo: [['done', 'إنجاز المهمة ✓']], done: [['todo', 'تراجع']] };
const PST = { open: 'قيد التصويت', accepted: 'مُعتمد', rejected: 'مرفوض', closed: 'مغلق' };
const isClosed = p => ['accepted', 'rejected', 'closed'].includes(p.status);

const nm = e => (S.allMembers || S.members || []).find(m => same(m.email, e))?.name || S.members.find(m => same(m.email, e))?.name || 'غير مُسند';
const isAdmin = () => S.me && S.me.role === 'admin';
const canDel = t => isAdmin() || (S.me && same(t.created_by, S.me.email));
const mine = t => t.for_all || (S.me && same(t.assignee_email, S.me.email));
const doneBy = t => S.done.filter(d => d.task_id === t.id);
const eff = t => t.for_all ? (S.me && doneBy(t).some(d => same(d.email, S.me.email)) ? 'done' : 'todo') : t.status;
const run = async p => { const { error } = await p; if (error) alert('خطأ: ' + error.message); load(); };

function toast(msg, ok = true) {
  let el = document.getElementById('app_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app_toast';
    document.body.appendChild(el);
  }
  el.className = 'app-toast ' + (ok === false ? 'err' : 'ok');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._tm);
  el._tm = setTimeout(() => { el.style.display = 'none'; }, 3200);
}

function waSummaryDialog(title, txt, phoneOpt) {
  try { navigator.clipboard?.writeText(txt); } catch (e) {}
  toast('تم تجهيز ونسخ ملخص الواتساب 📋');
  const ph = phoneOpt && typeof waPhone === 'function' ? waPhone(phoneOpt) : '';
  dlg.innerHTML = '<h2>💬 ' + esc(title || 'ملخص التقرير عبر واتساب') + '</h2>' +
    '<p class="m" style="margin-bottom:8px">تم نسخ الملخص تلقائياً للحافظة، ويمكنك تعديله أو إرساله مباشرة عبر واتساب:</p>' +
    '<textarea id="wa_sum_txt" rows="10" style="font-family:inherit;line-height:1.7;margin-bottom:10px">' + esc(txt) + '</textarea>' +
    '<div class="row" style="margin-bottom:10px"><label style="flex:1">📱 رقم واتساب المستلم (اختياري — اتركه فارغاً لاختيار جهة الاتصال من واتساب)<input id="wa_sum_ph" dir="ltr" inputmode="tel" value="' + esc(phoneOpt || '') + '" placeholder="مثال: 77xxxxxxx"></label></div>' +
    '<div class="row dact">' +
      '<button class="s" type="button" id="wa_sum_cp">📋 نسخ النص</button>' +
      '<button class="p s" type="button" id="wa_sum_go" style="background:#128c7e;border-color:#128c7e;color:#fff">📲 فتح وإرسال عبر واتساب</button>' +
      '<button class="s" type="button" id="wa_sum_x">إغلاق</button>' +
    '</div>';
  $('wa_sum_x').onclick = () => dlg.close();
  $('wa_sum_cp').onclick = async () => {
    try { await navigator.clipboard.writeText($('wa_sum_txt').value); $('wa_sum_cp').textContent = 'تم النسخ ✓'; toast('تم نسخ النص للحافظة ✓'); }
    catch (e) { alert('تعذّر النسخ'); }
  };
  $('wa_sum_go').onclick = () => {
    const rawP = ($('wa_sum_ph') && $('wa_sum_ph').value.trim()) || '';
    const cleanP = rawP && typeof waPhone === 'function' ? waPhone(rawP) : rawP.replace(/\D/g, '');
    const url = 'https://wa.me/' + (cleanP || ph || '') + '?text=' + encodeURIComponent($('wa_sum_txt').value);
    window.open(url, '_blank');
  };
  dlg.showModal();
}

/* ===== الشركات والإدارات والهوية الاحترافية لكل شركة (الشعار + الاسم + الفاتورة + عزل البيانات) ===== */
const DEFAULT_COMPANY = 'متجرك';

function parseMemberMeta(m) {
  if (!m) return { company: '', department: '', phone: '', perms: {} };
  let co = m.company || '', dep = m.department || '', ph = m.phone || '';
  let perms = {};
  if (m.permissions) {
    if (typeof m.permissions === 'object') perms = Object.assign({}, m.permissions);
    else { try { perms = JSON.parse(m.permissions); } catch (e) {} }
  }
  if (m.telegram_chat_id && String(m.telegram_chat_id).trim().startsWith('{')) {
    try {
      const j = JSON.parse(m.telegram_chat_id);
      if (!co) co = j.co || j.company || '';
      if (!dep) dep = j.dep || j.department || '';
      if (!ph) ph = j.ph || j.phone || '';
      if (!Object.keys(perms).length && j.perms && typeof j.perms === 'object') perms = Object.assign({}, j.perms);
    } catch (e) {}
  }
  co = String(co || '').trim();
  dep = String(dep || '').trim();
  ph = String(ph || '').trim();
  // جميع الموظفين والمناديب (غير المدير العام) يتبعون تلقائياً شركة «متجرك» ما لم تُحدَّد لهم شركة أخرى أو __all للمندوب المشترك
  if (!co && m.role !== 'admin') co = DEFAULT_COMPANY;
  return { company: co, department: dep, phone: ph, perms };
}

function encodeMemberMeta(co, dep, ph, perms) {
  const c = String(co || '').trim(), d = String(dep || '').trim(), p = String(ph || '').trim();
  const obj = {};
  if (c) obj.co = c;
  if (d) obj.dep = d;
  if (p) obj.ph = p;
  if (perms && typeof perms === 'object' && Object.keys(perms).length) obj.perms = perms;
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}

// استرجاع صلاحيات الموظف الدقيقة
function memberPerms(mOrEmail) {
  const m = typeof mOrEmail === 'string'
    ? (S.allMembers || S.members || S.rawMembers || []).find(x => same(x.email, mOrEmail))
    : mOrEmail;
  if (!m) return { screens: ['board', 'pub', 'kb', 'orders', 'erp', 'dash', 'props', 'log'], ordersScope: 'all', canCost: false, settingsTabs: [] };
  if (m.role === 'admin') return { screens: ['board', 'pub', 'kb', 'orders', 'erp', 'dash', 'props', 'log', 'set'], ordersScope: 'all', canCost: true, settingsTabs: ['staff', 'reps', 'stores', 'orders_cfg', 'notify', 'recur', 'tools', 'account'] };
  if (m.role === 'rep') return { screens: ['rep'], ordersScope: 'own', canCost: false, settingsTabs: ['account'] };

  const meta = parseMemberMeta(m);
  const p = meta.perms || {};
  const setTabs = Array.isArray(p.settingsTabs) ? p.settingsTabs : [];
  const screens = Array.isArray(p.screens) && p.screens.length ? p.screens.slice() : ['board', 'pub', 'kb', 'orders', 'dash', 'props', 'log'];
  if (!p._v52) {
    if (!screens.includes('pub')) screens.push('pub');
    if (!screens.includes('kb')) screens.push('kb');
  }
  if (!screens.includes('set')) screens.push('set');

  return {
    screens: screens,
    ordersScope: p.ordersScope === 'own' ? 'own' : 'all',
    canCost: !!p.canCost,
    settingsTabs: setTabs
  };
}

function canMemberAccessScreen(screenId, m) {
  const member = m || S.me;
  if (!member) return false;
  if (member.role === 'admin') return true;
  const p = memberPerms(member);
  if (screenId === 'set') return true;
  return p.screens.includes(screenId);
}

function canMemberAccessSettingsTab(tabId, m) {
  const member = m || S.me;
  if (!member) return false;
  if (tabId === 'account') return true;
  if (member.role === 'admin') return true;
  const p = memberPerms(member);
  return Array.isArray(p.settingsTabs) && p.settingsTabs.includes(tabId);
}

function canMemberViewOtherOrders(m) {
  const member = m || S.me;
  if (!member) return false;
  if (member.role === 'admin') return true;
  const p = memberPerms(member);
  return p.ordersScope !== 'own';
}
function memberCompany(email) {
  if (!email) return DEFAULT_COMPANY;
  const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, email));
  if (!m) return DEFAULT_COMPANY;
  const c = parseMemberMeta(m).company;
  return (!c || c === '__all') ? DEFAULT_COMPANY : c;
}
function memberDept(email) {
  if (!email) return '';
  const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, email));
  return m ? parseMemberMeta(m).department : '';
}
function memberPhone(email) {
  if (!email) return '';
  const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, email));
  if (!m) return '';
  return m.phone || parseMemberMeta(m).phone || '';
}
function getLocalOrgMeta() {
  try { return JSON.parse(localStorage.getItem('org_meta_v1') || '{"companies":[],"departments":[],"profiles":{}}'); }
  catch (e) { return { companies: [], departments: [], profiles: {} }; }
}
function companyProfilesMap() {
  const map = {};
  const loc = getLocalOrgMeta().profiles || {};
  Object.entries(loc).forEach(([k, v]) => { if (k && v && typeof v === 'object') map[k] = Object.assign({}, v); });
  const hv = (S.ordSet && Array.isArray(S.ordSet.hidden_views)) ? S.ordSet.hidden_views : [];
  hv.forEach(x => {
    if (String(x).startsWith('__cop:')) {
      try {
        const j = JSON.parse(String(x).slice(6));
        if (j && j.id) map[j.id] = Object.assign({}, map[j.id] || {}, j);
      } catch (e) {}
    }
  });
  // الجدول الصريح للشركات (companies) له الأولوية القصوى عند توفره
  (S.companiesRows || []).forEach(r => {
    if (!r || !r.id) return;
    map[r.id] = Object.assign({}, map[r.id] || {}, {
      id: r.id,
      displayName: r.display_name || r.id,
      slogan: r.slogan || '',
      logo: r.logo || '',
      phone: r.phone || '',
      address: r.address || '',
      currency: r.currency || 'ر.ي',
      taxNo: r.tax_no || '',
      accent: r.accent || '#c9a24e',
      footer: r.footer || 'شكراً لتعاملكم معنا 🌹',
      staffCanCost: !!r.staff_can_cost,
      imageKeepDays: r.image_keep_days != null ? +r.image_keep_days : 1
    });
  });
  return map;
}
function getCompanyProfile(coName) {
  const name = String(coName || '').trim();
  const map = companyProfilesMap();
  const key = Object.keys(map).find(k => same(k, name));
  const p = (key && map[key]) || {};
  const isDef = !name || same(name, DEFAULT_COMPANY);
  return {
    id: name || DEFAULT_COMPANY,
    displayName: p.displayName || (isDef ? ((S.ordSet && S.ordSet.store_name) || DEFAULT_COMPANY) : name),
    appTitle: p.appTitle || (isDef ? ((S.ordSet && S.ordSet.app_name) || '') : ('منصة ' + name)),
    slogan: p.slogan || '',
    phone: p.phone || (isDef ? ((S.ordSet && S.ordSet.store_phone) || BRAND.phone || '') : ''),
    address: p.address || (isDef ? ((S.ordSet && S.ordSet.store_address) || BRAND.address || '') : ''),
    currency: p.currency || BRAND.currency || 'ر.ي',
    color: p.color || '#0b1426',
    accent: p.accent || '#d4af6a',
    logo: p.logo || '',
    footer: p.footer || 'شكراً لتعاملكم معنا 🌹',
    taxNo: p.taxNo || '',
    staffCanCost: p.staffCanCost !== undefined ? !!p.staffCanCost : !!(S.ordSet && S.ordSet.staff_can_cost),
    imageKeepDays: p.imageKeepDays !== undefined ? +p.imageKeepDays : (S.ordSet && S.ordSet.image_keep_days != null ? +S.ordSet.image_keep_days : 1)
  };
}
function activeBrand() {
  const co = activeCompanyFilter();
  if (co) return getCompanyProfile(co);
  return getCompanyProfile(DEFAULT_COMPANY);
}
function extractRecordCompany(text) {
  const m = String(text || '').match(/\[شركة:\s*([^\]]+)\]/);
  return m ? m[1].trim() : '';
}
function orderCompany(o) {
  if (!o) return DEFAULT_COMPANY;
  const tag = extractRecordCompany(o.notes);
  if (o.company_id && String(o.company_id).trim() && (!same(o.company_id, DEFAULT_COMPANY) || !tag)) return String(o.company_id).trim();
  if (o.company && String(o.company).trim() && (!same(o.company, DEFAULT_COMPANY) || !tag)) return String(o.company).trim();
  if (tag) return tag;
  if (o.rep_email) {
    const mRep = (S.rawMembers || S.allMembers || []).find(x => same(x.email, o.rep_email));
    const rc = mRep ? parseMemberMeta(mRep).company : '';
    if (rc && rc !== '__all') return rc;
  }
  if (o.created_by) {
    const m = (S.rawMembers || S.allMembers || []).find(x => same(x.email, o.created_by));
    if (m && m.role !== 'admin') return parseMemberMeta(m).company || DEFAULT_COMPANY;
    if (m) {
      const mc = String(m.company || (m.telegram_chat_id && m.telegram_chat_id.startsWith('{') ? (JSON.parse(m.telegram_chat_id).co || '') : '') || '').trim();
      if (mc && mc !== '__all') return mc;
    }
  }
  return DEFAULT_COMPANY;
}
function taskCompany(t) {
  if (!t) return DEFAULT_COMPANY;
  const tag = extractRecordCompany(t.notes);
  if (t.company_id && String(t.company_id).trim() && (!same(t.company_id, DEFAULT_COMPANY) || !tag)) return String(t.company_id).trim();
  if (t.company && String(t.company).trim() && (!same(t.company, DEFAULT_COMPANY) || !tag)) return String(t.company).trim();
  if (tag) return tag;
  if (t.assignee_email) {
    const m = (S.rawMembers || S.allMembers || []).find(x => same(x.email, t.assignee_email));
    if (m && m.role !== 'admin') return parseMemberMeta(m).company || DEFAULT_COMPANY;
    if (m) {
      const mc = String(m.company || (m.telegram_chat_id && m.telegram_chat_id.startsWith('{') ? (JSON.parse(m.telegram_chat_id).co || '') : '') || '').trim();
      if (mc && mc !== '__all') return mc;
    }
  }
  if (t.created_by) {
    const m = (S.rawMembers || S.allMembers || []).find(x => same(x.email, t.created_by));
    if (m && m.role !== 'admin') return parseMemberMeta(m).company || DEFAULT_COMPANY;
  }
  return DEFAULT_COMPANY;
}
function companiesList() {
  const set = new Set([DEFAULT_COMPANY]);
  const addCo = v => { const s = String(v || '').trim(); if (s && s !== '__all') set.add(s); };
  (S.companiesRows || []).forEach(r => addCo(r.id));
  const hv = (S.ordSet && Array.isArray(S.ordSet.hidden_views)) ? S.ordSet.hidden_views : [];
  hv.forEach(x => { if (String(x).startsWith('__co:')) addCo(String(x).slice(5)); });
  Object.keys(companyProfilesMap()).forEach(addCo);
  (getLocalOrgMeta().companies || []).forEach(addCo);
  (S.rawMembers || S.allMembers || S.members || []).forEach(m => addCo(parseMemberMeta(m).company));
  return [...set];
}
function departmentsList() {
  const set = new Set();
  const hv = (S.ordSet && Array.isArray(S.ordSet.hidden_views)) ? S.ordSet.hidden_views : [];
  hv.forEach(x => { if (String(x).startsWith('__dep:')) { const v = String(x).slice(6).trim(); if (v) set.add(v); } });
  (getLocalOrgMeta().departments || []).forEach(v => { if (v && String(v).trim()) set.add(String(v).trim()); });
  (S.rawMembers || S.allMembers || S.members || []).forEach(m => { const d = parseMemberMeta(m).department; if (d) set.add(d); });
  return [...set];
}
async function persistOrgLists(companies, departments, profilesOpt) {
  const cleanCo = [...new Set([DEFAULT_COMPANY].concat((companies || []).map(x => String(x || '').trim()).filter(x => x && x !== '__all')))];
  const cleanDep = [...new Set((departments || []).map(x => String(x || '').trim()).filter(Boolean))];
  const profs = profilesOpt || companyProfilesMap();
  try { localStorage.setItem('org_meta_v1', JSON.stringify({ companies: cleanCo, departments: cleanDep, profiles: profs })); } catch (e) {}
  // حفظ في جدول الشركات الصريح إن كان مفعّلاً
  if (!S.companiesErr) {
    const rows = cleanCo.map(c => {
      const k = Object.keys(profs).find(x => same(x, c));
      const p = (k && profs[k]) || getCompanyProfile(c);
      return {
        id: c,
        display_name: p.displayName || c,
        slogan: p.slogan || '',
        logo: p.logo || '',
        phone: p.phone || '',
        address: p.address || '',
        currency: p.currency || 'ر.ي',
        tax_no: p.taxNo || '',
        accent: p.accent || '#c9a24e',
        footer: p.footer || 'شكراً لتعاملكم معنا 🌹',
        staff_can_cost: !!p.staffCanCost,
        image_keep_days: p.imageKeepDays != null ? +p.imageKeepDays : 1,
        updated_at: new Date().toISOString()
      };
    });
    await sb.from('companies').upsert(rows).catch(() => {});
  }
  if (S.ordSet) {
    const baseViews = (S.ordSet.hidden_views || []).filter(x => !String(x).startsWith('__co:') && !String(x).startsWith('__dep:') && !String(x).startsWith('__cop:'));
    const profEntries = cleanCo.map(c => {
      const k = Object.keys(profs).find(x => same(x, c));
      const p = k ? profs[k] : null;
      return p ? '__cop:' + JSON.stringify(Object.assign({}, p, { id: c })) : null;
    }).filter(Boolean);
    const nextHidden = baseViews.concat(cleanCo.map(c => '__co:' + c)).concat(cleanDep.map(d => '__dep:' + d)).concat(profEntries);
    S.ordSet.hidden_views = nextHidden;
    await sb.from('ord_settings').update({ hidden_views: nextHidden }).eq('id', true);
  }
}
async function saveCompanyProfile(coName, profileData) {
  const name = String(coName || DEFAULT_COMPANY).trim();
  const profs = companyProfilesMap();
  const existingKey = Object.keys(profs).find(k => same(k, name)) || name;
  profs[existingKey] = Object.assign({}, profs[existingKey] || {}, profileData, { id: name });
  const cos = companiesList();
  if (!cos.some(c => same(c, name))) cos.push(name);
  await persistOrgLists(cos, departmentsList(), profs);
  if (same(name, DEFAULT_COMPANY) && S.ordSet) {
    const patch = {};
    if (profileData.displayName !== undefined) patch.store_name = profileData.displayName || null;
    if (profileData.phone !== undefined) patch.store_phone = profileData.phone || null;
    if (profileData.address !== undefined) patch.store_address = profileData.address || null;
    if (profileData.appTitle !== undefined && profileData.appTitle) patch.app_name = profileData.appTitle;
    if (profileData.staffCanCost !== undefined) patch.staff_can_cost = !!profileData.staffCanCost;
    if (profileData.imageKeepDays !== undefined) patch.image_keep_days = +profileData.imageKeepDays;
    if (Object.keys(patch).length) {
      Object.assign(S.ordSet, patch);
      await sb.from('ord_settings').update(patch).eq('id', true);
    }
  }
}
const isSuperAdmin = () => isAdmin() && !String(S.me && (S.me.company || (S.me.telegram_chat_id && S.me.telegram_chat_id.startsWith('{') ? (JSON.parse(S.me.telegram_chat_id).co || '') : '')) || '').trim();
function activeCompanyFilter() {
  if (!S.me) return '';
  if (!isSuperAdmin()) return parseMemberMeta(S.me).company || DEFAULT_COMPANY;
  return S.activeCompany || '';
}
function applyCompanyScope() {
  if (!S.rawMembers) return;
  const co = activeCompanyFilter();
  if (!co) {
    S.allMembers = S.rawMembers.slice();
    S.members = S.allMembers.filter(m => m.role !== 'rep');
    S.reps = S.allMembers.filter(m => m.role === 'rep');
    S.tasks = (S.rawTasks || []).slice();
    S.orders = (S.rawOrders || []).slice();
    S.oitems = (S.rawOitems || []).slice();
    S.opay = (S.rawOpay || []).slice();
    S.meetings = (S.rawMeetings || []).slice();
    S.props = (S.rawProps || []).slice();
    S.supPay = (S.rawSupPay || []).slice();
    S.repHand = (S.rawRepHand || []).slice();
    S.expenses = (S.rawExpenses || []).slice();
    return;
  }
  S.allMembers = S.rawMembers.filter(m => {
    const mc = parseMemberMeta(m).company;
    return same(mc, co) || (m.role === 'rep' && mc === '__all') || same(m.email, S.me && S.me.email);
  });
  S.members = S.allMembers.filter(m => m.role !== 'rep');
  S.reps = S.allMembers.filter(m => m.role === 'rep');
  S.tasks = (S.rawTasks || []).filter(t => same(taskCompany(t), co));
  let compOrders = (S.rawOrders || []).filter(o => same(orderCompany(o), co));
  // عزل صلاحيات الطلبات: إذا لم يُسمح للموظف برؤية طلبات زملائه يرى طلباته الخاصة فقط
  if (S.me && S.me.role !== 'admin' && typeof canMemberViewOtherOrders === 'function' && !canMemberViewOtherOrders(S.me)) {
    compOrders = compOrders.filter(o => same(o.created_by, S.me.email) || same(o.rep_email, S.me.email));
  }
  S.orders = compOrders;
  const ordIds = new Set(S.orders.map(o => o.id));
  S.oitems = (S.rawOitems || []).filter(i => ordIds.has(i.order_id));
  S.opay = (S.rawOpay || []).filter(p => ordIds.has(p.order_id));
  S.meetings = (S.rawMeetings || []).filter(m => {
    if (m.company_id && String(m.company_id).trim()) return same(m.company_id, co);
    const tag = String(m.title || '').match(/\[([^\]]+)\]/);
    if (tag) return same(tag[1].trim(), co);
    return same(co, DEFAULT_COMPANY);
  });
  S.props = (S.rawProps || []).filter(p => {
    if (p.company_id && String(p.company_id).trim()) return same(p.company_id, co);
    const mc = memberCompany(p.author_email);
    return same(mc || DEFAULT_COMPANY, co);
  });
  S.supPay = (S.rawSupPay || []).filter(r => same(r.company_id || DEFAULT_COMPANY, co));
  S.repHand = (S.rawRepHand || []).filter(r => same(r.company_id || DEFAULT_COMPANY, co));
  S.expenses = (S.rawExpenses || []).filter(r => same(r.company_id || DEFAULT_COMPANY, co));
}

/* ===== صور الأصناف والشعارات (مخزن خاص + ضغط الصور) ===== */
const IMG_BUCKET = 'order-images';
async function imgSign(paths) {
  paths = [...new Set((paths || []).filter(Boolean))]; const out = {}; if (!paths.length) return out;
  try {
    const r = await fetch(API + '/storage/v1/object/sign/' + IMG_BUCKET, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600, paths }) });
    const j = await r.json(); if (r.ok && Array.isArray(j)) j.forEach(x => { if (x.signedURL) out[x.path] = API + '/storage/v1' + x.signedURL; });
  } catch (e) {}
  return out;
}
async function imgUpload(path, blob) {
  try {
    const r = await fetch(API + '/storage/v1/object/' + IMG_BUCKET + '/' + path, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: blob });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return e.message || r.statusText; }
    return '';
  } catch (e) { return 'تعذّر الاتصال بالإنترنت'; }
}
async function imgRemove(paths) {
  paths = (paths || []).filter(Boolean); if (!paths.length) return;
  try { await fetch(API + '/storage/v1/object/' + IMG_BUCKET, { method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) }); } catch (e) {}
}
// ضغط الصورة قبل الرفع: أقصى بُعد 1024px وجودة 72% (≈ 80–150KB) لتوفير المساحة
function compressImage(file, max = 1024, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('تعذّر ضغط الصورة')), 'image/jpeg', q);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('ملف الصورة غير صالح')); };
    im.src = url;
  });
}
// ضغط شعار الشركة كـ DataURL خفيف وعالي الدقة (PNG/WebP شفاف أو مربع) لحفظه مباشرة في إعدادات الشركة
function compressLogoDataUrl(file, max = 180) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL('image/webp', 0.82);
      if (out.length > 45000) out = c.toDataURL('image/jpeg', 0.75);
      res(out);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('ملف الشعار غير صالح')); };
    im.src = url;
  });
}
// جلب كل صفوف الجدول على دفعات (حد PostgREST الافتراضي 1000 صف)
async function fetchAll(table, ord, max = 10000) {
  const out = [];
  for (let off = 0; off < max; off += 1000) {
    const q = sb.from(table).select('*'); if (ord) q.order(ord.c, { ascending: !!ord.asc }); q.limit(1000).offset(off);
    const { data, error } = await q; if (error) return { data: null, error };
    out.push(...data); if (data.length < 1000) break;
  }
  return { data: out, error: null };
}
