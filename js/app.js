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
  const [m, t, p, v, d, ci, nt, mb, oo, oi, op, os, oc, coTbl, eSup, eRep, eExp] = await Promise.all([
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
    fetchAll('ord_item_costs', { c: 'item_id', asc: true }),
    sb.from('companies').select('*'),
    sb.from('erp_supplier_payments').select('*').order('paid_on', { ascending: false }),
    sb.from('erp_rep_handovers').select('*').order('handed_on', { ascending: false }),
    sb.from('erp_expenses').select('*').order('spent_on', { ascending: false })
  ]);
  if (!mb.error && mb.data && mb.data.length) {
    S.rawMembers = mb.data; S.allMembers = mb.data; S.members = mb.data.filter(x => x.role !== 'rep'); S.reps = mb.data.filter(x => x.role === 'rep'); S.me = mb.data.find(x => same(x.email, S.me.email)) || S.me;
    try { localStorage.setItem('rep_dir_v1', JSON.stringify(mb.data.map(x => ({ email: x.email, name: x.name, phone: x.phone })))); } catch (e) {}
  } else if (!S.rawMembers && S.allMembers) { S.rawMembers = S.allMembers; }
  S.ordErr = !!(oo.error || oi.error || op.error);
  if (!oo.error) { S.rawOrders = oo.data || []; S.orders = S.rawOrders; }
  if (!oi.error) { S.rawOitems = oi.data || []; S.oitems = S.rawOitems; }
  if (!op.error) { S.rawOpay = op.data || []; S.opay = S.rawOpay; }
  if (!os.error) S.ordSet = (os.data || [])[0] || null;
  S.ocost = {}; if (!oc.error) (oc.data || []).forEach(c => { S.ocost[c.item_id] = +c.cost; });

  S.companiesErr = !!coTbl.error;
  if (!coTbl.error) S.companiesRows = coTbl.data || [];
  S.erpTablesErr = !!(eSup.error || eRep.error || eExp.error);
  if (!eSup.error) S.dbSupPay = eSup.data || [];
  if (!eRep.error) S.dbRepHand = eRep.data || [];
  if (!eExp.error) S.dbExpenses = eExp.data || [];
  if (typeof syncErpArrays === 'function') syncErpArrays();

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

function normRepPhoneClient(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  const cc = (typeof BRAND !== 'undefined' && BRAND.waCountry) || '967';
  if (d.length === 9 && d[0] === '7') d = cc + d;
  else if (d.length === 10 && d[0] === '0') d = cc + d.slice(1);
  return d;
}

function loginView() {
  $app.innerHTML = '<div class="card" id="login"><h1><svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="#0b1426"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d4af6a" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><br>مدير المهام</h1><p class="m">سجّل الدخول برقم الجوال أو البريد الإلكتروني أو اسم المستخدم مع كلمة المرور</p>' +
  '<div class="row"><input id="em" type="text" autocomplete="username" placeholder="رقم الجوال (77...) أو البريد الإلكتروني أو الاسم" dir="ltr" style="width:100%"></div>' +
  '<div class="row" style="margin-top:12px;position:relative">' +
    '<input id="pw" type="password" autocomplete="current-password" placeholder="كلمة المرور" dir="ltr" style="width:100%;padding-inline-end:42px">' +
    '<button type="button" id="pw_tog" title="إظهار/إخفاء كلمة المرور" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:transparent;border:0;padding:4px 8px;font-size:16px;cursor:pointer;color:var(--mute)">👁</button>' +
  '</div>' +
  '<button class="p" id="go" style="width:100%;margin-top:16px;padding:12px">تسجيل الدخول</button>' +
  '<p class="m" id="msg" style="margin-top:12px;color:var(--late);font-size:13px;line-height:1.5"></p></div>';

  if ($('pw_tog')) {
    $('pw_tog').onclick = () => {
      const inp = $('pw');
      if (inp.type === 'password') { inp.type = 'text'; $('pw_tog').textContent = '🙈'; }
      else { inp.type = 'password'; $('pw_tog').textContent = '👁'; }
    };
  }

  const doLogin = async () => {
    $('msg').textContent = 'جارٍ الدخول...'; $('msg').style.color = 'inherit';
    const id = $('em').value.trim(), pw = $('pw').value.trim();
    if (!id || !pw) {
      $('msg').textContent = 'الرجاء إدخال البريد / رقم الجوال وكلمة المرور';
      $('msg').style.color = 'var(--late)';
      return;
    }

    // تنبيه لطيف عند وجود خطأ إملائي شائع في النطاق (مثل .ocm بدل .com)
    if (/@.*\.(ocm|con|cpm|vom|cm)$/i.test(id)) {
      $('msg').textContent = '⚠️ يبدو أن هناك خطأ في كتابة نهاية البريد (كتبت ' + id.split('@')[1] + ' بدلاً من com). تحقّق من الإملاء أو جرّب الدخول برقم الجوال مباشرة.';
      $('msg').style.color = 'var(--soon)';
    }

    let error = null;
    let loggedIn = false;

    // 1) محاولة الدخول المباشر إذا كان المدخل بريداً إلكترونياً
    if (id.includes('@')) {
      const res = await sb.auth.signInWithPassword({ email: id, password: pw });
      if (!res.error) {
        loggedIn = true;
      } else {
        error = res.error;
      }
    } else {
      // تجربة الكاش المحلي للمناديب والموظفين للدخول السريع
      const normP = normRepPhoneClient(id);
      const rawD = id.replace(/\D/g, '');
      let cachedDir = [];
      try { cachedDir = JSON.parse(localStorage.getItem('rep_dir_v1') || '[]'); } catch (e) {}
      const cachedMatches = cachedDir.filter(m =>
        (m.name && String(m.name).trim().toLowerCase() === id.toLowerCase()) ||
        (rawD.length >= 7 && m.phone && (normRepPhoneClient(m.phone) === normP || String(m.phone).replace(/\D/g, '') === rawD))
      ).map(m => m.email);

      const directCandidates = [...new Set([
        ...cachedMatches,
        ...(rawD.length >= 7 ? [normP + '@staff.local', rawD + '@staff.local', normP + '@rep.local', rawD + '@rep.local', normP + '@rep.invalid', rawD + '@rep.invalid'] : [])
      ].filter(Boolean))];

      for (const candEmail of directCandidates) {
        const res = await sb.auth.signInWithPassword({ email: candEmail, password: pw });
        if (!res.error) { loggedIn = true; break; }
      }
    }

    // 2) إذا لم ينجح الدخول المباشر، نستعين بخادم المصادقة الذكي /api/rep-login للتحقق بالاسم أو رقم الجوال أو البريد
    if (!loggedIn) {
      try {
        const r = await fetch('/api/rep-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: id, password: pw }) });
        const j = await r.json().catch(() => ({}));
        const sess = (j && j.session && j.session.access_token) ? j.session : (j && j.access_token ? j : null);
        if (r.ok && sess) {
          sess.expires_at = sess.expires_at || Math.floor(Date.now() / 1000) + (sess.expires_in || 3600);
          saveS(sess);
          init();
          loggedIn = true;
          error = null;
        } else {
          error = { message: j.error || (error ? error.message : 'البريد أو رقم الجوال أو كلمة المرور غير صحيحة') };
        }
      } catch (e) {
        if (!error) error = { message: 'تعذّر الاتصال بخادم تسجيل الدخول' };
      }
    }

    if (error && !loggedIn) {
      let emMsg = error.message || '';
      if (/invalid_credentials|invalid login/i.test(emMsg)) {
        emMsg = 'البريد أو رقم الجوال أو كلمة المرور غير صحيحة. (تأكد من صحة الحروف أو جرّب رقم الجوال المسجل).';
      }
      $('msg').textContent = emMsg;
      $('msg').style.color = 'var(--late)';
    }
  };
  $('go').onclick = doLogin;
  $('pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
}
const logout = async () => { await sb.auth.signOut(); localStorage.clear(); location.reload(); };

function render() {
  if (S.me && S.me.role === 'rep') return repRender();
  if (typeof viewHidden === 'function' && viewHidden(S.view)) S.view = firstView();
  if (typeof canMemberAccessScreen === 'function' && !canMemberAccessScreen(S.view)) S.view = firstView();
  try { document.title = appName(); updateBadge(); saveCache(); } catch (e) {}
  if (!S.me) return;
  const props = S.props || [];
  const openProps = props.filter(p => !isClosed(p)).length;
  const badge = openProps ? '<span class="n">' + openProps + '</span>' : '';
  
  const enter = S._rv !== S.view; S._rv = S.view;
  $app.innerHTML = headerHtml() + navHtml(S.view, badge) +
  '<div class="view' + (enter ? ' enter' : '') + '">' +
  (S.view === 'orders' ? ordersView() : S.view === 'erp' ? erpView() : S.view === 'board' ? boardView() : S.view === 'props' ? propsView() : S.view === 'log' ? logView() : S.view === 'dash' ? dashView() : settingsView()) +
  '</div>' + (S.view === 'board' ? '<button class="fab" id="fab" aria-label="مهمة جديدة">＋</button>' : '');
  
  if (S.view === 'set') $app.insertAdjacentHTML('beforeend', '<p class="m" style="text-align:center;margin-top:20px">النسخة ' + VERSION + '</p>');
  bindHeader();
  if ($('fab')) $('fab').onclick = () => taskDialog(null);
  document.querySelectorAll('[data-nv]').forEach(b => b.onclick = () => { if (b.dataset.nv === 'more') return moreDialog(); S.view = b.dataset.nv; render(); });
  if (S.view === 'orders') bindOrders(); else if (S.view === 'erp') bindErp(); else if (S.view === 'board') bindBoard(); else if (S.view === 'props') bindProps(); else if (S.view === 'log') bindLog(); else if (S.view === 'dash') bindDash(); else bindSettings();
}
