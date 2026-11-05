let AUTH = { s: null };
try { AUTH.s = JSON.parse(localStorage.getItem('sbs') || 'null'); } catch(e){}
const saveS = s => {
  AUTH.s = s;
  try {
    if (s) {
      localStorage.setItem('sbs', JSON.stringify(s));
      localStorage.setItem('sbs_backup', JSON.stringify(s));
    } else {
      localStorage.removeItem('sbs');
      localStorage.removeItem('sbs_backup');
    }
  } catch (e) {}
  if (typeof idbSet === 'function') idbSet('sbs', s || null);
};
const saveCreds = (id, pw) => {
  try {
    if (id && pw) {
      const d = JSON.stringify({ id: String(id).trim(), pw: String(pw), t: Date.now() });
      localStorage.setItem('sbs_cred', btoa(unescape(encodeURIComponent(d))));
    }
  } catch (e) {}
};
const loadCreds = () => {
  try {
    const raw = localStorage.getItem('sbs_cred');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(escape(atob(raw))));
  } catch (e) { return null; }
};

async function silentReauth() {
  const c = loadCreds();
  if (!c || !c.id || !c.pw) return null;
  try {
    if (c.id.includes('@')) {
      const r = await fetch(API + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.id, password: c.pw })
      });
      if (r.ok) {
        const j = await r.json();
        j.expires_at = Math.floor(Date.now() / 1000) + (j.expires_in || 3600);
        saveS(j);
        return j.access_token;
      }
    } else {
      const r = await fetch('/api/rep-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: c.id, password: c.pw })
      });
      if (r.ok) {
        const raw = await r.json();
        const j = raw.session || raw;
        if (j && j.access_token) {
          j.expires_at = j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600);
          saveS(j);
          return j.access_token;
        }
      }
    }
  } catch (e) {}
  return null;
}

async function tok() {
  let s = AUTH.s;
  if (!s) {
    try { s = JSON.parse(localStorage.getItem('sbs') || localStorage.getItem('sbs_backup') || 'null'); if (s) AUTH.s = s; } catch (e) {}
  }
  if (!s && typeof idbGet === 'function') {
    try { s = await idbGet('sbs'); if (s) saveS(s); } catch (e) {}
  }
  if (!s) {
    const re = await silentReauth();
    return re || KEY;
  }
  if (s.expires_at && s.expires_at - 90 > Date.now() / 1000) return s.access_token;
  if (s.refresh_token) {
    try {
      const r = await fetch(API + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.access_token) {
        j.expires_at = Math.floor(Date.now() / 1000) + (j.expires_in || 3600);
        saveS(j);
        return j.access_token;
      }
    } catch (e) {
      return s.access_token || KEY;
    }
  }
  // محاولة تجديد صامت بالبيانات المحفوظة دون إخراج المستخدم
  const re = await silentReauth();
  return re || s.access_token || KEY;
}

/* ===== الدخول بالبصمة / الوجه (WebAuthn Biometrics) ===== */
const bioSupported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
const getBioMeta = () => { try { return JSON.parse(localStorage.getItem('sbs_bio') || 'null'); } catch (e) { return null; } };
async function bioRegister(label) {
  if (!bioSupported()) return { ok: false, error: 'جهازك أو المتصفح لا يدعم البصمة مباشرة' };
  const cred = loadCreds();
  const sess = AUTH.s;
  if (!cred && !sess) return { ok: false, error: 'سجّل الدخول أولاً لتفعيل البصمة' };
  try {
    const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16); crypto.getRandomValues(userId);
    const userName = (S.me && S.me.name) || label || (cred && cred.id) || 'user';
    const pk = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'نظام إدارة المهام والطلبات' },
        user: { id: userId, name: String(userName), displayName: String(userName) },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'preferred' },
        timeout: 60000
      }
    });
    if (!pk) return { ok: false, error: 'لم يتم تأكيد البصمة' };
    const rawId = btoa(String.fromCharCode(...new Uint8Array(pk.rawId)));
    const bioObj = { rawId, name: userName, email: (S.me && S.me.email) || '', cred, session: sess, at: Date.now() };
    localStorage.setItem('sbs_bio', JSON.stringify(bioObj));
    if (typeof idbSet === 'function') await idbSet('sbs_bio', bioObj);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'تعذّر تسجيل البصمة (تأكد من تفعيل قفل الشاشة/البصمة في جهازك)' };
  }
}
async function bioVerifyAndLogin() {
  let bio = getBioMeta();
  if (!bio && typeof idbGet === 'function') bio = await idbGet('sbs_bio');
  if (!bio) return { ok: false, error: 'لم يتم تفعيل البصمة على هذا الجهاز بعد. ادخل بكلمة المرور لمرة واحدة ثم فعّل البصمة.' };
  try {
    if (bioSupported() && bio.rawId) {
      const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
      const idBytes = Uint8Array.from(atob(bio.rawId), c => c.charCodeAt(0));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: idBytes }],
          userVerification: 'preferred',
          timeout: 60000
        }
      });
    }
    if (bio.cred && bio.cred.id && bio.cred.pw) {
      saveCreds(bio.cred.id, bio.cred.pw);
      const t = await silentReauth();
      if (t) { init(); return { ok: true }; }
    }
    if (bio.session) {
      saveS(bio.session);
      init();
      return { ok: true };
    }
    return { ok: false, error: 'انتهت صلاحية الجلسة المحفوظة، سجل الدخول بكلمة المرور لتحديثها' };
  } catch (e) {
    return { ok: false, error: 'تم إلغاء التحقق من البصمة' };
  }
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
  then(res, rej) { return this.run().then(res, rej); }
  async run() {
    try {
      const mut = this.m !== 'GET', h = { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' };
      const pf = [this.pf, mut ? 'return=minimal' : ''].filter(Boolean).join(','); if (pf) h.Prefer = pf;
      const r = await fetch(API + '/rest/v1/' + this.t + '?' + this.p, { method: this.m, headers: h, body: this.b ? JSON.stringify(this.b) : undefined });
      if (!r.ok) { const e = await r.json().catch(() => ({})); return { data: null, error: { message: e.message || r.statusText } }; }
      return { data: mut ? null : await r.json(), error: null };
    } catch (e) {
      if (this.m !== 'GET') { await enqueue({ path: '/rest/v1/' + this.t + '?' + this.p, m: this.m, pf: (this.pf ? this.pf + ',' : '') + 'return=minimal', b: this.b ? JSON.stringify(this.b) : null }); return { data: null, error: null, queued: true }; }
      return { data: null, error: { message: 'تعذّر الاتصال بقاعدة البيانات. (تأكد من الإنترنت)' } };
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
    getSession: async () => {
      if (!AUTH.s) {
        try { AUTH.s = JSON.parse(localStorage.getItem('sbs') || localStorage.getItem('sbs_backup') || 'null'); } catch (e) {}
      }
      if (!AUTH.s && typeof idbGet === 'function') {
        try { const s = await idbGet('sbs'); if (s) saveS(s); } catch (e) {}
      }
      if (!AUTH.s) {
        await silentReauth();
      }
      return { data: { session: AUTH.s } };
    },
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
        j.expires_at = Math.floor(Date.now() / 1000) + j.expires_in;
        saveCreds(email, password);
        saveS(j);
        init();
        return { error: null };
      } catch (e) { return { error: { message: 'تعذّر الاتصال' } }; }
    },
    signOut: async () => {
      saveS(null);
      try { localStorage.removeItem('sbs_cred'); } catch (e) {}
    },
    updateUser: async ({ password }) => {
      try {
        const r = await fetch(API + '/auth/v1/user', { method: 'PUT', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && S.me && S.me.email) saveCreds(S.me.email, password);
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

/* ===== الشركات والإدارات (عزل بيانات كل شركة + هيكل الأقسام) ===== */
function parseMemberMeta(m) {
  if (!m) return { company: '', department: '' };
  let co = m.company || '', dep = m.department || '';
  if ((!co && !dep) && m.telegram_chat_id && String(m.telegram_chat_id).trim().startsWith('{')) {
    try {
      const j = JSON.parse(m.telegram_chat_id);
      co = j.co || j.company || '';
      dep = j.dep || j.department || '';
    } catch (e) {}
  }
  return { company: String(co || '').trim(), department: String(dep || '').trim() };
}
function encodeMemberMeta(co, dep) {
  const c = String(co || '').trim(), d = String(dep || '').trim();
  return (c || d) ? JSON.stringify({ co: c, dep: d }) : null;
}
function memberCompany(email) {
  if (!email) return '';
  const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, email));
  return m ? parseMemberMeta(m).company : '';
}
function memberDept(email) {
  if (!email) return '';
  const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, email));
  return m ? parseMemberMeta(m).department : '';
}
function getLocalOrgMeta() {
  try { return JSON.parse(localStorage.getItem('org_meta_v1') || '{"companies":[],"departments":[]}'); }
  catch (e) { return { companies: [], departments: [] }; }
}
function companiesList() {
  const set = new Set();
  const hv = (S.ordSet && Array.isArray(S.ordSet.hidden_views)) ? S.ordSet.hidden_views : [];
  hv.forEach(x => { if (String(x).startsWith('__co:')) { const v = String(x).slice(5).trim(); if (v) set.add(v); } });
  (getLocalOrgMeta().companies || []).forEach(v => { if (v && String(v).trim()) set.add(String(v).trim()); });
  (S.rawMembers || S.allMembers || S.members || []).forEach(m => { const c = parseMemberMeta(m).company; if (c) set.add(c); });
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
async function persistOrgLists(companies, departments) {
  const cleanCo = [...new Set((companies || []).map(x => String(x || '').trim()).filter(Boolean))];
  const cleanDep = [...new Set((departments || []).map(x => String(x || '').trim()).filter(Boolean))];
  try { localStorage.setItem('org_meta_v1', JSON.stringify({ companies: cleanCo, departments: cleanDep })); } catch (e) {}
  if (S.ordSet) {
    const baseViews = (S.ordSet.hidden_views || []).filter(x => !String(x).startsWith('__co:') && !String(x).startsWith('__dep:'));
    const nextHidden = baseViews.concat(cleanCo.map(c => '__co:' + c)).concat(cleanDep.map(d => '__dep:' + d));
    S.ordSet.hidden_views = nextHidden;
    await sb.from('ord_settings').update({ hidden_views: nextHidden }).eq('id', true);
  }
}
const isSuperAdmin = () => isAdmin() && !parseMemberMeta(S.me).company;
function activeCompanyFilter() {
  if (!S.me) return '';
  const myCo = parseMemberMeta(S.me).company;
  if (myCo) return myCo;
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
    return;
  }
  const inCo = email => {
    if (!email) return false;
    return same(memberCompany(email), co);
  };
  S.allMembers = S.rawMembers.filter(m => same(parseMemberMeta(m).company, co) || same(m.email, S.me && S.me.email));
  S.members = S.allMembers.filter(m => m.role !== 'rep');
  S.reps = S.allMembers.filter(m => m.role === 'rep');
  S.tasks = (S.rawTasks || []).filter(t => {
    const tagMatch = String(t.notes || '').includes('[شركة: ' + co + ']');
    if (tagMatch) return true;
    if (t.assignee_email) return inCo(t.assignee_email);
    if (t.created_by) return inCo(t.created_by);
    return false;
  });
  S.orders = (S.rawOrders || []).filter(o => {
    const tagMatch = String(o.notes || '').includes('[شركة: ' + co + ']');
    if (tagMatch) return true;
    if (o.rep_email && inCo(o.rep_email)) return true;
    if (o.created_by && inCo(o.created_by)) return true;
    return false;
  });
  const ordIds = new Set(S.orders.map(o => o.id));
  S.oitems = (S.rawOitems || []).filter(i => ordIds.has(i.order_id));
  S.opay = (S.rawOpay || []).filter(p => ordIds.has(p.order_id));
  S.meetings = (S.rawMeetings || []).filter(m => !m.title.includes(' · [') || m.title.includes(' · [' + co + ']'));
  S.props = (S.rawProps || []).filter(p => inCo(p.author_email));
}

/* ===== صور الأصناف (مخزن خاص + روابط مؤقتة) ===== */
const IMG_BUCKET = 'order-images';
function shortImgUrl(itemOrId) {
  if (!itemOrId) return '';
  if (typeof itemOrId === 'object') {
    const hasImg = itemOrId.image_path || itemOrId.image || itemOrId.img;
    if (!hasImg) return '';
    if (itemOrId.id) return location.origin + '/i/' + String(itemOrId.id).slice(0, 8);
    const p = String(hasImg);
    try { return location.origin + '/i/' + btoa(p).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; }
  }
  return location.origin + '/i/' + String(itemOrId).slice(0, 8);
}
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
