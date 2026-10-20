async function init() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user || !session.user.email) {
      saveS(null);
      return loginView();
    }
    const email = session.user.email;
    idbSet('sbs', session); idbSet('cfg', { url: API, key: KEY, name: (S.me && S.me.name) || email });
    
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.email === email) { Object.assign(S, c.s); render(); } } catch (e) {}

    const { data: members, error } = await sb.from('members').select('*');
    if (error) { if (S.me) { render(); return; } return showErrorBox('تعذر جلب الأعضاء: ' + error.message); }
    
    const me = members.find(m => same(m.email, email));
    if (!members.length || !me) { 
        saveS(null); 
        $app.innerHTML = '<div class="card" id="login">حسابك غير مرتبط بالفريق.<br><br><button class="p" onclick="location.reload()">رجوع</button></div>'; 
        return; 
    }
    
    S.allMembers = members; S.members = members.filter(m => m.role !== 'rep'); S.reps = members.filter(m => m.role === 'rep'); S.me = me; idbSet('cfg', { url: API, key: KEY, name: me.name }); idbSet('sbs', AUTH.s);
    if (me.role === 'rep') { S.view = 'rep'; return await repLoad(); }
    await load();
  } catch (err) { showErrorBox(err.message); }
}

async function load() {
  if (S.me && S.me.role === 'rep') return repLoad();
  const none = Promise.resolve({ data: null, error: { message: 'x' } });
  const [m, t, p, v, d, ci, nt, mb, oo, oi, op, os, oc] = await Promise.all([
    sb.from('meetings').select('*').order('held_on', { ascending: false }),
    sb.from('tasks').select('*').order('due_on', { ascending: true, nullsFirst: false }),
    sb.from('proposals').select('*').order('created_at', { ascending: false }),
    sb.from('votes').select('*'),
    sb.from('task_done').select('*'),
    sb.from('task_items').select('id,task_id,text,done,pos'),
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
    sb.from('members').select('*'),
    fetchAll('ord_orders', { c: 'order_no', asc: false }),
    fetchAll('ord_items', { c: 'id', asc: true }),
    fetchAll('ord_payments', { c: 'id', asc: true }),
    sb.from('ord_settings').select('*').limit(1),
    fetchAll('ord_item_costs', { c: 'item_id', asc: true })
  ]);
  if (!mb.error && mb.data && mb.data.length) { S.rawMembers = mb.data; S.allMembers = mb.data; S.members = mb.data.filter(x => x.role !== 'rep'); S.reps = mb.data.filter(x => x.role === 'rep'); S.me = mb.data.find(x => same(x.email, S.me.email)) || S.me; }
  else if (!S.rawMembers && S.allMembers) { S.rawMembers = S.allMembers; }
  S.ordErr = !!(oo.error || oi.error || op.error);
  if (!oo.error) { S.rawOrders = oo.data || []; S.orders = S.rawOrders; }
  if (!oi.error) { S.rawOitems = oi.data || []; S.oitems = S.rawOitems; }
  if (!op.error) { S.rawOpay = op.data || []; S.opay = S.rawOpay; }
  if (!os.error) S.ordSet = (os.data || [])[0] || null;
  S.ocost = {}; if (!oc.error) (oc.data || []).forEach(c => { S.ocost[c.item_id] = +c.cost; });
  
  if (!m.error) { S.rawMeetings = m.data || []; S.meetings = S.rawMeetings; }
  if (!t.error) { S.rawTasks = t.data || []; S.tasks = S.rawTasks; }
  if (!d.error) S.done = d.data || [];
  if (!nt.error) S.notes = nt.data || [];
  if (!ci.error) { S.items = (ci.data || []).slice().sort((a, b) => (a.pos || 0) - (b.pos || 0)); S.itemStats = {}; (ci.data || []).forEach(r => { const z = S.itemStats[r.task_id] || (S.itemStats[r.task_id] = [0, 0]); z[1]++; if (r.done) z[0]++; }); }
  S.propsErr = !!(p.error || v.error);
  if (!p.error) { S.rawProps = p.data || []; S.props = S.rawProps; }
  if (!v.error) S.votes = v.data || [];
  
  if (typeof applyCompanyScope === 'function') applyCompanyScope();
  if (!m.error && !t.error && S.me) try { localStorage.setItem(CACHE_KEY, JSON.stringify({ email: S.me.email, s: { me: S.me, members: S.members, meetings: S.meetings, tasks: S.tasks, done: S.done, props: S.props, votes: S.votes } })); } catch (e) {}
  render();
  if (typeof rtStart === 'function') rtStart();
  inboxAfterLoad(); recurPing();
}

function loginView() {
  $app.innerHTML = '<div class="card" id="login"><h1><svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="#0b1426"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d4af6a" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><br>مدير المهام</h1><p class="m">سجّل الدخول للمتابعة</p>' +
  '<div class="row"><input id="em" type="text" inputmode="email" autocomplete="username" placeholder="البريد الإلكتروني أو رقم الجوال" dir="ltr" style="width:100%"></div>' +
  '<div class="row" style="margin-top:12px"><input id="pw" type="password" placeholder="كلمة المرور" dir="ltr" style="width:100%"></div>' +
  '<button class="p" id="go" style="width:100%;margin-top:16px;padding:12px">تسجيل الدخول</button><p class="m" id="msg" style="margin-top:12px;color:var(--late)"></p></div>';
  
  const doLogin = async () => {
    $('msg').textContent = 'جارٍ الدخول...'; $('msg').style.color = 'inherit';
    const id = $('em').value.trim();
    let error = null;
    if (id.includes('@')) ({ error } = await sb.auth.signInWithPassword({ email: id, password: $('pw').value }));
    else {   // مندوب: الدخول برقم الجوال
      try {
        const r = await fetch('/api/rep-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: id, password: $('pw').value }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.access_token) { j.expires_at = j.expires_at || Math.floor(Date.now() / 1000) + j.expires_in; saveS(j); init(); } else error = { message: j.error || 'تعذّر الدخول' };
      } catch (e) { error = { message: 'تعذّر الاتصال بالإنترنت' }; }
    }
    if(error){ $('msg').textContent = error.message; $('msg').style.color = 'var(--late)'; }
  };
  $('go').onclick = doLogin;
  $('pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
}
const logout = async () => { await sb.auth.signOut(); localStorage.clear(); location.reload(); };

function render() {
  if (S.me && S.me.role === 'rep') return repRender();
  if (typeof viewHidden === 'function' && viewHidden(S.view)) S.view = firstView();
  try { document.title = appName(); updateBadge(); saveCache(); } catch (e) {}
  if (!S.me) return;
  const props = S.props || [];
  const openProps = props.filter(p => !isClosed(p)).length;
  const badge = openProps ? '<span class="n">' + openProps + '</span>' : '';
  
  const enter = S._rv !== S.view; S._rv = S.view;
  $app.innerHTML = headerHtml() + navHtml(S.view, badge) +
  '<div class="view' + (enter ? ' enter' : '') + '">' +
  (S.view === 'orders' ? ordersView() : S.view === 'board' ? boardView() : S.view === 'props' ? propsView() : S.view === 'log' ? logView() : S.view === 'dash' ? dashView() : settingsView()) +
  '</div>' + (S.view === 'board' ? '<button class="fab" id="fab" aria-label="مهمة جديدة">＋</button>' : '');
  
  if (S.view === 'set') $app.insertAdjacentHTML('beforeend', '<p class="m" style="text-align:center;margin-top:20px">النسخة ' + VERSION + '</p>');
  bindHeader();
  if ($('fab')) $('fab').onclick = () => taskDialog(null);
  document.querySelectorAll('[data-nv]').forEach(b => b.onclick = () => { if (b.dataset.nv === 'more') return moreDialog(); S.view = b.dataset.nv; render(); });
  if (S.view === 'orders') bindOrders(); else if (S.view === 'board') bindBoard(); else if (S.view === 'props') bindProps(); else if (S.view === 'log') bindLog(); else if (S.view === 'dash') bindDash(); else bindSettings();
}
