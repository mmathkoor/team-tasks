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
    
    S.members = members; S.me = me; idbSet('cfg', { url: API, key: KEY, name: me.name }); idbSet('sbs', AUTH.s);
    await load();
  } catch (err) { showErrorBox(err.message); }
}

async function load() {
  const [m, t, p, v, d, ci] = await Promise.all([
    sb.from('meetings').select('*').order('held_on', { ascending: false }),
    sb.from('tasks').select('*').order('due_on', { ascending: true, nullsFirst: false }),
    sb.from('proposals').select('*').order('created_at', { ascending: false }),
    sb.from('votes').select('*'),
    sb.from('task_done').select('*'),
    sb.from('task_items').select('task_id,done')
  ]);
  
  if (!m.error) S.meetings = m.data || [];
  if (!t.error) S.tasks = t.data || [];
  if (!d.error) S.done = d.data || [];
  if (!ci.error) { S.itemStats = {}; (ci.data || []).forEach(r => { const z = S.itemStats[r.task_id] || (S.itemStats[r.task_id] = [0, 0]); z[1]++; if (r.done) z[0]++; }); }
  S.propsErr = !!(p.error || v.error);
  if (!p.error) S.props = p.data || [];
  if (!v.error) S.votes = v.data || [];
  
  if (!m.error && !t.error && S.me) try { localStorage.setItem(CACHE_KEY, JSON.stringify({ email: S.me.email, s: { me: S.me, members: S.members, meetings: S.meetings, tasks: S.tasks, done: S.done, props: S.props, votes: S.votes } })); } catch (e) {}
  render();
}

function loginView() {
  $app.innerHTML = '<div class="card" id="login"><h1><svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="#0b1426"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d4af6a" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><br>مدير المهام</h1><p class="m">سجّل الدخول للمتابعة</p>' +
  '<div class="row"><input id="em" type="email" placeholder="البريد الإلكتروني" dir="ltr" style="width:100%"></div>' +
  '<div class="row" style="margin-top:12px"><input id="pw" type="password" placeholder="كلمة المرور" dir="ltr" style="width:100%"></div>' +
  '<button class="p" id="go" style="width:100%;margin-top:16px;padding:12px">تسجيل الدخول</button><p class="m" id="msg" style="margin-top:12px;color:var(--late)"></p></div>';
  
  const doLogin = async () => {
    $('msg').textContent = 'جارٍ الدخول...'; $('msg').style.color = 'inherit';
    const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
    if(error){ $('msg').textContent = error.message; $('msg').style.color = 'var(--late)'; }
  };
  $('go').onclick = doLogin;
  $('pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
}
const logout = async () => { await sb.auth.signOut(); localStorage.clear(); location.reload(); };

function render() {
  try { updateBadge(); saveCache(); } catch (e) {}
  if (!S.me) return;
  const props = S.props || [];
  const openProps = props.filter(p => !isClosed(p)).length;
  const badge = openProps ? '<span class="n">' + openProps + '</span>' : '';
  
  $app.innerHTML = '<div class="top"><h1><svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="#0b1426"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d4af6a" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>مدير المهام</span></h1><div class="row s"><span class="chip" style="font-size:14px">👤 ' + esc(S.me.name) + '</span><button id="rf" class="s">🔄 تحديث</button></div></div>' +
  '<div class="nav">' +
    '<button data-nv="board" class="' + (S.view === 'board' ? 'on' : '') + '">المهام والمشاريع</button>' +
    '<button data-nv="dash" class="' + (S.view === 'dash' ? 'on' : '') + '">لوحة الأرقام</button>' +
    '<button data-nv="props" class="' + (S.view === 'props' ? 'on' : '') + '">القرارات والتصويت' + badge + '</button>' +
    '<button data-nv="log" class="' + (S.view === 'log' ? 'on' : '') + '">سجل النشاط</button>' +
    '<button data-nv="set" class="' + (S.view === 'set' ? 'on' : '') + '">الإعدادات</button>' +
  '</div>' +
  (S.view === 'board' ? boardView() : S.view === 'props' ? propsView() : S.view === 'log' ? logView() : S.view === 'dash' ? dashView() : settingsView());
  
  if (S.view === 'set') $app.insertAdjacentHTML('beforeend', '<p class="m" style="text-align:center;margin-top:20px">النسخة ' + VERSION + '</p>');
  $('rf').onclick = () => { $('rf').textContent = '⏳'; load(); };
  document.querySelectorAll('[data-nv]').forEach(b => b.onclick = () => { S.view = b.dataset.nv; render(); });
  if (S.view === 'board') bindBoard(); else if (S.view === 'props') bindProps(); else if (S.view === 'log') bindLog(); else if (S.view === 'dash') bindDash(); else bindSettings();
}
