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
  auth: {
    getSession: async () => ({ data: { session: AUTH.s } }),
    signInWithPassword: async ({ email, password }) => {
      try {
        const r = await fetch(API + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const j = await r.json();
        if (!r.ok) return { error: { message: j.error_description || 'بيانات الدخول غير صحيحة' } };
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

const nm = e => S.members.find(m => same(m.email, e))?.name || 'غير مُسند';
const isAdmin = () => S.me && S.me.role === 'admin';
const canDel = t => isAdmin() || (S.me && same(t.created_by, S.me.email));
const mine = t => t.for_all || (S.me && same(t.assignee_email, S.me.email));
const doneBy = t => S.done.filter(d => d.task_id === t.id);
const eff = t => t.for_all ? (S.me && doneBy(t).some(d => same(d.email, S.me.email)) ? 'done' : 'todo') : t.status;
const run = async p => { const { error } = await p; if (error) alert('خطأ: ' + error.message); load(); };
