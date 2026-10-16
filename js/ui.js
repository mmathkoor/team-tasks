// ===== عناصر الواجهة: أيقونات + شريط التنقل + الترويسة =====
const svgIc = p => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const NAV_ITEMS = [
  { id: 'board', short: 'المهام', long: 'المهام والمشاريع', ic: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>' },
  { id: 'dash', short: 'الأرقام', long: 'لوحة الأرقام', ic: '<path d="M5 20v-7M12 20V5M19 20v-10"/><path d="M3 20h18"/>' },
  { id: 'props', short: 'القرارات', long: 'القرارات والتصويت', ic: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>' },
  { id: 'log', short: 'النشاط', long: 'سجل النشاط', ic: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: 'set', short: 'الإعدادات', long: 'الإعدادات', ic: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>' }
];
function navHtml(view, propsBadge) {
  return '<nav class="nav" aria-label="التنقل">' + NAV_ITEMS.map(n =>
    '<button data-nv="' + n.id + '" class="' + (view === n.id ? 'on' : '') + '" aria-label="' + n.long + '"' + (view === n.id ? ' aria-current="page"' : '') + '>' +
      svgIc(n.ic) + '<span class="lb">' + n.short + '</span><span class="lb-l">' + n.long + '</span>' + (n.id === 'props' ? propsBadge : '') +
    '</button>').join('') + '</nav>';
}
function greetingText() {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء النور';
}
function headerHtml() {
  let d = '';
  try { d = new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) {}
  return '<div class="top"><div class="brand">' +
    '<svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="#0b1426"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d4af6a" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<div class="bt"><h1>مدير المهام</h1><div class="sub">' + greetingText() + '، ' + esc(S.me.name) + (d ? ' · ' + esc(d) : '') + '</div></div></div>' +
    '<button id="rf" class="s iconbtn" aria-label="تحديث البيانات" title="تحديث">↻</button></div>';
}
