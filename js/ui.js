// ===== عناصر الواجهة: أيقونات + شريط التنقل + الترويسة =====
const svgIc = p => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const NAV_ITEMS = [
  { id: 'board', short: 'المهام', long: 'المهام والمشاريع', ic: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>' },
  { id: 'orders', short: 'الطلبات', long: 'إدارة الطلبات', ic: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2.5l2.2 11h10.6l2-8H6.5"/>' },
  { id: 'dash', short: 'الأرقام', long: 'لوحة الأرقام', ic: '<path d="M5 20v-7M12 20V5M19 20v-10"/><path d="M3 20h18"/>' },
  { id: 'more', short: 'المزيد', long: 'المزيد', ic: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>' }
];
const MORE_ITEMS = [
  { id: 'props', long: 'القرارات والتصويت', ic: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>' },
  { id: 'log', long: 'سجل النشاط', ic: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: 'set', long: 'الإعدادات', ic: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>' }
];
 // إخفاء/إظهار الشاشات (إعداد المدير). الإعدادات لا تُخفى أبداً.
const viewHidden = id => id !== 'set' && !!(S.ordSet && (S.ordSet.hidden_views || []).includes(id));
const visNav = () => NAV_ITEMS.filter(n => n.id === 'more' || !viewHidden(n.id));
const visMore = () => MORE_ITEMS.filter(m => !viewHidden(m.id));
const firstView = () => (visNav().find(n => n.id !== 'more') || { id: 'set' }).id;
const appName = () => {
  if (typeof activeCompanyFilter === 'function') {
    const co = activeCompanyFilter();
    if (co && typeof getCompanyProfile === 'function') {
      const p = getCompanyProfile(co);
      if (p.appTitle) return p.appTitle;
      if (p.displayName) return p.displayName;
    }
  }
  return (S.ordSet && S.ordSet.app_name) || (window.__CFG && window.__CFG.name) || 'مدير المهام';
};
const titleOf = e => ((S.allMembers || S.members || []).find(m => same(m.email, e)) || {}).title || '';
const nmt = e => { const m = (S.allMembers || S.members || []).find(x => same(x.email, e)); return m ? m.name + (m.title ? ' — ' + m.title : '') : 'غير مُسند'; };
function navHtml(view, propsBadge) {
  return '<nav class="nav" aria-label="التنقل">' + visNav().map(n => {
    const on = n.id === 'more' ? MORE_ITEMS.some(m => m.id === view) : view === n.id;
    return '<button data-nv="' + n.id + '" class="' + (on ? 'on' : '') + '" aria-label="' + n.long + '"' + (on ? ' aria-current="page"' : '') + '>' +
      svgIc(n.ic) + '<span class="lb">' + n.short + '</span><span class="lb-l">' + n.long + '</span>' + (n.id === 'more' ? propsBadge : '') + '</button>';
  }).join('') + '</nav>';
}
function moreDialog() {
  const op = (S.props || []).filter(p => !isClosed(p)).length;
  dlg.innerHTML = '<h2>المزيد</h2><div class="more">' + visMore().map(m => '<button class="more-i" data-go="' + m.id + '">' + svgIc(m.ic) + '<span>' + m.long + '</span>' + (m.id === 'props' && op ? '<i class="n">' + op + '</i>' : '') + '</button>').join('') + '</div>' +
    '<p class="m" style="text-align:center;margin:14px 0 0">النسخة ' + VERSION + '</p>';
  dlg.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { S.view = b.dataset.go; dlg.close(); render(); });
  dlg.showModal();
}
const THEME_I = { auto: '◐', light: '☀', dark: '☾' }, THEME_L = { auto: 'تلقائي', light: 'فاتح', dark: 'داكن' };
const curTheme = () => localStorage.getItem('theme') || 'auto';
const applyTheme = t => document.documentElement.setAttribute('data-theme', t);
function toggleCoPopover(e) {
  if (e) e.stopPropagation();
  const ex = $('co_pop_menu');
  if (ex) { ex.remove(); return; }
  const btn = $('co_sw_btn');
  if (!btn) return;
  const coList = typeof companiesList === 'function' ? companiesList() : ['متجرك'];
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const allM = S.rawMembers || S.allMembers || S.members || [];
  const allT = S.rawTasks || S.tasks || [];
  const allO = S.rawOrders || S.orders || [];

  const pop = document.createElement('div');
  pop.id = 'co_pop_menu';
  pop.className = 'co-pop-menu';
  pop.innerHTML =
    '<div class="co-pop-head"><span>🏢 التبديل بين الشركات والمتاجر</span><small>' + coList.length + ' متاجر</small></div>' +
    '<button type="button" class="co-pop-item' + (!curCo ? ' on' : '') + '" data-copick="">' +
      '<div class="co-pop-ic">🌐</div>' +
      '<div class="co-pop-txt">' +
        '<b>كل الشركات والمتاجر (' + coList.length + ')</b>' +
        '<small>عرض شامل لجميع الفروع · ' + allO.length + ' طلب · ' + allT.length + ' مهمة</small>' +
      '</div>' +
      (!curCo ? '<span class="co-pop-chk">✓</span>' : '') +
    '</button>' +
    '<div class="co-pop-list">' +
      coList.map(c => {
        const cp = typeof getCompanyProfile === 'function' ? getCompanyProfile(c) : { displayName: c, currency: 'ر.ي' };
        const isAct = same(curCo, c);
        const empN = allM.filter(m => m.role !== 'rep' && m.role !== 'admin' && same(parseMemberMeta(m).company, c)).length;
        const ordN = allO.filter(o => same(orderCompany(o), c)).length;
        const tskN = allT.filter(t => same(taskCompany(t), c)).length;
        return '<div class="co-pop-row' + (isAct ? ' on' : '') + '">' +
          '<button type="button" class="co-pop-item" data-copick="' + esc(c) + '">' +
            companyLogoHtml(c, 36) +
            '<div class="co-pop-txt">' +
              '<b>' + esc(cp.displayName || c) + (same(c, 'متجرك') ? ' <span class="co-pop-def">الأساسي</span>' : '') + '</b>' +
              '<small>👥 ' + empN + ' موظف · 🛒 ' + ordN + ' طلب · 📋 ' + tskN + ' مهمة · ' + esc(cp.currency || 'ر.ي') + '</small>' +
            '</div>' +
            (isAct ? '<span class="co-pop-chk">✓</span>' : '') +
          '</button>' +
          '<button type="button" class="co-pop-cfg" data-cocfg="' + esc(c) + '" title="تهيئة الشعار والهوية">🎨</button>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="co-pop-foot">' +
      '<button type="button" class="s" id="co_pop_manage" style="width:100%;justify-content:center;font-size:12.5px">⚙️ إدارة الشركات وإضافة متجر جديد</button>' +
    '</div>';

  document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const popW = Math.min(350, window.innerWidth - 20);
  pop.style.width = popW + 'px';
  pop.style.top = Math.min(window.innerHeight - 360, Math.max(10, Math.round(rect.bottom + 8))) + 'px';
  const leftPos = Math.max(10, Math.min(window.innerWidth - popW - 10, rect.left));
  pop.style.left = Math.round(leftPos) + 'px';

  const closePop = ev => {
    if (!pop.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
      pop.remove();
      document.removeEventListener('pointerdown', closePop);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', closePop), 10);

  pop.querySelectorAll('[data-copick]').forEach(b => {
    b.onclick = () => {
      S.activeCompany = b.dataset.copick;
      pop.remove();
      document.removeEventListener('pointerdown', closePop);
      applyCompanyScope();
      render();
    };
  });
  pop.querySelectorAll('[data-cocfg]').forEach(b => {
    b.onclick = ev => {
      ev.stopPropagation();
      const targetCo = b.dataset.cocfg;
      pop.remove();
      document.removeEventListener('pointerdown', closePop);
      if (typeof companyConfigDialog === 'function') companyConfigDialog(targetCo);
    };
  });
  if ($('co_pop_manage')) {
    $('co_pop_manage').onclick = () => {
      pop.remove();
      document.removeEventListener('pointerdown', closePop);
      S.view = 'set';
      render();
    };
  }
}

function bindHeader() {
  $('rf').onclick = () => { $('rf').textContent = '⏳'; load(); };
  $('thm').onclick = () => { const o = ['auto', 'light', 'dark'], n = o[(o.indexOf(curTheme()) + 1) % 3]; localStorage.setItem('theme', n); applyTheme(n); $('thm').textContent = THEME_I[n]; $('thm').title = 'المظهر: ' + THEME_L[n]; };
  $('bell').onclick = inboxDialog;
  if ($('co_sw_btn')) $('co_sw_btn').onclick = toggleCoPopover;
  if ($('co_sw')) $('co_sw').onchange = e => { S.activeCompany = e.target.value; applyCompanyScope(); render(); };
  updateBell();
}
function greetingText() {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء النور';
}
function companyLogoHtml(coName, size = 42) {
  const p = typeof getCompanyProfile === 'function' ? getCompanyProfile(coName) : {};
  if (p && p.logo) {
    return '<img src="' + esc(p.logo) + '" alt="' + esc(p.displayName || coName || '') + '" class="co-logo-img" style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:12px;border:1.5px solid ' + esc(p.accent || '#d4af6a') + ';background:#fff;flex:none">';
  }
  const bg = (p && p.color) || '#0b1426';
  const ac = (p && p.accent) || '#d4af6a';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="' + esc(bg) + '"/><circle cx="32" cy="32" r="21" fill="none" stroke="' + esc(ac) + '" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function headerHtml() {
  let d = '';
  try { d = new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) {}
  const myMeta = typeof parseMemberMeta === 'function' ? parseMemberMeta(S.me) : { company: '', department: '' };
  const coList = typeof companiesList === 'function' ? companiesList() : [];
  const canSw = typeof isSuperAdmin === 'function' && isSuperAdmin() && coList.length > 0;
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = curCo && typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo) : null;
  const swHtml = canSw ? (
    '<button type="button" id="co_sw_btn" class="co-sw-btn" title="تبديل الشركة / المتجر المعروض">' +
      '<span class="co-sw-main">' +
        (curCo ? companyLogoHtml(curCo, 22) + '<span class="co-sw-txt">' + esc((prof && prof.displayName) || curCo) + '</span>' : '<span class="co-sw-emo">🌐</span><span class="co-sw-txt">كل الشركات (' + coList.length + ')</span>') +
      '</span>' +
      '<span class="co-sw-arr">تبديل ▾</span>' +
    '</button>'
  ) : (curCo ? '<span class="co-tag">🏢 ' + esc((prof && prof.displayName) || curCo) + '</span>' : '');
  const roleSub = [S.me.title, myMeta.department].filter(Boolean).join(' · ');
  const sloganTxt = prof && prof.slogan ? ' · ' + prof.slogan : '';
  return '<div class="top">' +
    '<div class="brand">' +
      companyLogoHtml(curCo || 'متجرك', 42) +
      '<div class="bt"><h1>' + esc(appName()) + '</h1><div class="sub">' + greetingText() + '، ' + esc(S.me.name) + (roleSub ? ' (' + esc(roleSub) + ')' : '') + esc(sloganTxt) + (d ? ' · ' + esc(d) : '') + '</div></div>' +
    '</div>' +
    '<div class="hbtns">' +
      '<button id="thm" class="s iconbtn" aria-label="المظهر" title="المظهر: ' + THEME_L[curTheme()] + '">' + THEME_I[curTheme()] + '</button>' +
      '<button id="bell" class="s iconbtn" aria-label="صندوق التنبيهات" title="التنبيهات">🔔<span class="bn" hidden></span></button>' +
      '<button id="rf" class="s iconbtn" aria-label="تحديث البيانات" title="تحديث">↻</button>' +
    '</div>' +
    (swHtml ? '<div class="top-co-bar">' + swHtml + '</div>' : '') +
  '</div>';
}
