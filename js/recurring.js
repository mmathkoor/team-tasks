// ===== المهام المتكررة (على مستوى كل متجر / شركة) =====
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const freqText = r => ({ daily: 'يومياً', weekly: 'كل ' + WD[r.weekday || 0], monthly: 'يوم ' + (r.day_of_month || 1) + ' من كل شهر', month_end: 'نهاية كل شهر' })[r.frequency];
function recurRuleCompany(r) {
  if (!r) return 'متجرك';
  const m = String(r.notes || '').match(/\[شركة:\s*([^\]]+)\]/);
  if (m) return m[1].trim();
  if (r.assignee_email && typeof memberCompany === 'function') return memberCompany(r.assignee_email) || 'متجرك';
  return 'متجرك';
}
const recurHtml = () => {
  const cos = typeof companiesList === 'function' ? companiesList() : ['متجرك'];
  const canAll = typeof isSuperAdmin === 'function' && isSuperAdmin();
  if (S.rcScopeCo === undefined) S.rcScopeCo = (typeof activeCompanyFilter === 'function' && activeCompanyFilter()) || '';
  const curCo = canAll ? (S.rcScopeCo || '') : ((typeof activeCompanyFilter === 'function' && activeCompanyFilter()) || 'متجرك');
  const defAddCo = curCo || (typeof activeCompanyFilter === 'function' && activeCompanyFilter()) || 'متجرك';

  const scopeHeader = canAll ? (
    '<div class="store-scope-bar">' +
      '<span>🏢 عرض المهام المتكررة لـ:</span>' +
      '<select id="rc_scope">' +
        '<option value=""' + (!curCo ? ' selected' : '') + '>🌐 جميع المتاجر والشركات</option>' +
        cos.map(c => '<option value="' + esc(c) + '"' + (same(curCo, c) ? ' selected' : '') + '>🏢 متجر: ' + esc(getCompanyProfile(c).displayName || c) + '</option>').join('') +
      '</select>' +
    '</div>'
  ) : '<span class="co-tag">🏢 متجر: ' + esc(curCo) + '</span>';

  const coSelect = canAll
    ? '<select id="rc_co" title="المتجر / الشركة" style="flex:1 1 140px">' + cos.map(c => '<option value="' + esc(c) + '"' + (same(defAddCo, c) ? ' selected' : '') + '>🏢 متجر: ' + esc(c) + '</option>').join('') + '</select>'
    : '<input type="hidden" id="rc_co" value="' + esc(defAddCo) + '">';

  return '<div class="card">' +
    '<div class="bar" style="margin-bottom:10px"><h2 style="margin:0">🔁 المهام المتكررة (لكل متجر)</h2>' + scopeHeader + '</div>' +
    '<div id="rc_list" class="m">جارٍ التحميل...</div>' +
    '<h3 style="font-size:14px;margin:16px 0 8px">إضافة مهمة متكررة جديدة:</h3>' +
    '<div class="row" style="gap:8px">' +
      '<input id="rc_ti" placeholder="عنوان المهمة المتكررة (مثال: جرد الصندوق، اجتماع أسبوعي)" style="flex:2 1 200px">' +
      coSelect +
      '<select id="rc_as" style="flex:1 1 170px"><option value="__all">👥 لكل موظفي المتجر</option></select>' +
    '</div>' +
    '<div class="row" style="margin-top:8px;gap:8px;align-items:center">' +
      '<select id="rc_fr" style="flex:1 1 130px"><option value="daily">يومياً</option><option value="weekly">أسبوعياً</option><option value="monthly">شهرياً</option><option value="month_end">نهاية كل شهر</option></select>' +
      '<select id="rc_wd" style="display:none;flex:1 1 120px">' + WD.map((d, i) => '<option value="' + i + '">' + d + '</option>').join('') + '</select>' +
      '<input id="rc_dm" type="number" min="1" max="31" placeholder="يوم الشهر (1-31)" style="display:none;flex:1 1 120px">' +
      '<input id="rc_du" type="number" min="0" max="30" placeholder="مهلة التنفيذ بالأيام (0 = نفس اليوم)" style="flex:1 1 180px">' +
      '<button class="p s" id="rc_add" type="button">＋ إضافة المهمة المتكررة</button>' +
    '</div>' +
    '<div class="row" style="margin-top:12px;align-items:center;padding-top:10px;border-top:1px dashed var(--line)">' +
      '<button class="s" id="rc_run" type="button">⚡ توليد المهام المستحقة الآن</button>' +
      '<span class="m" id="rc_msg" style="flex:2 1 200px">تُولَّد تلقائياً كل يوم لموظفي المتجر المحدّد فقط.</span>' +
    '</div></div>';
};
async function bindRecur() {
  if (!$('rc_list')) return;
  const cos = typeof companiesList === 'function' ? companiesList() : ['متجرك'];
  const canAll = typeof isSuperAdmin === 'function' && isSuperAdmin();

  const syncMembersByCo = () => {
    if (!$('rc_co') || !$('rc_as')) return;
    const selCo = $('rc_co').value || 'متجرك';
    const allM = (S.rawMembers || S.allMembers || S.members || []).filter(m => m.role !== 'rep' && same(parseMemberMeta(m).company, selCo));
    $('rc_as').innerHTML = '<option value="__all">👥 لكل موظفي «' + esc(selCo) + '» (' + allM.length + ')</option>' +
      allM.map(m => '<option value="' + esc(m.email) + '">👤 ' + esc(m.name) + (m.title ? ' — ' + esc(m.title) : '') + '</option>').join('');
  };
  if ($('rc_co') && $('rc_co').tagName === 'SELECT') $('rc_co').onchange = syncMembersByCo;
  syncMembersByCo();

  const draw = async () => {
    const { data: d0, error } = await sb.from('recurring_tasks').select('*');
    const curCo = canAll ? (S.rcScopeCo || '') : ((typeof activeCompanyFilter === 'function' && activeCompanyFilter()) || '');
    const data = (d0 || []).filter(r => !curCo || same(recurRuleCompany(r), curCo)).sort((a, b) => String(a.created_at || '') < String(b.created_at || '') ? -1 : 1);
    if (!$('rc_list')) return;
    $('rc_list').innerHTML = error ? 'تعذّر التحميل: ' + esc(error.message) : data.length ? data.map(r => {
      const rCo = recurRuleCompany(r);
      const coDropdown = canAll ? (
        '<select data-rc-setco="' + r.id + '" title="تغيير متجر هذه المهمة المتكررة" style="padding:4px 8px;font-size:12.5px">' +
          cos.map(c => '<option value="' + esc(c) + '"' + (same(rCo, c) ? ' selected' : '') + '>🏢 ' + esc(c) + '</option>').join('') +
        '</select>'
      ) : '<span class="chip" style="font-size:11px">🏢 ' + esc(rCo) + '</span>';
      return '<div class="bar" style="padding:9px 12px;background:var(--col);border-radius:10px;margin-bottom:6px">' +
        '<span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">🔁 <b>' + esc(r.title) + '</b> — ' + freqText(r) + ' — <span class="m">' + (r.for_all ? '👥 كل موظفي «' + esc(rCo) + '»' : '👤 ' + esc(nm(r.assignee_email))) + '</span></span>' +
        '<div class="row s" style="align-items:center;gap:6px">' + coDropdown + '<button class="dng s" data-rd="' + r.id + '">حذف</button></div>' +
      '</div>';
    }).join('') : '<div class="m" style="padding:6px 0">لا توجد مهام متكررة لهذا المتجر.</div>';
    document.querySelectorAll('[data-rd]').forEach(b => b.onclick = async () => { if (confirm('حذف هذه المهمة المتكررة؟')) { await sb.from('recurring_tasks').delete().eq('id', b.dataset.rd); draw(); } });
    document.querySelectorAll('[data-rc-setco]').forEach(sel => sel.onchange = async () => {
      const id = sel.dataset.rcSetco, newCo = sel.value;
      sel.disabled = true;
      await sb.from('recurring_tasks').update({ notes: '[شركة: ' + newCo + ']' }).eq('id', id);
      draw();
    });
  };
  if ($('rc_scope')) {
    $('rc_scope').onchange = e => {
      S.rcScopeCo = e.target.value;
      if ($('rc_co') && $('rc_co').tagName === 'SELECT' && S.rcScopeCo) {
        $('rc_co').value = S.rcScopeCo;
        syncMembersByCo();
      }
      draw();
    };
  }
  $('rc_fr').onchange = () => { $('rc_wd').style.display = $('rc_fr').value === 'weekly' ? '' : 'none'; $('rc_dm').style.display = $('rc_fr').value === 'monthly' ? '' : 'none'; };
  $('rc_add').onclick = async () => {
    const title = $('rc_ti').value.trim(); if (!title) return $('rc_ti').focus();
    const fr = $('rc_fr').value, all = $('rc_as').value === '__all';
    const targetCo = ($('rc_co') && $('rc_co').value) || activeCompanyFilter() || 'متجرك';
    const { error } = await sb.from('recurring_tasks').insert({ title, notes: '[شركة: ' + targetCo + ']', for_all: all, assignee_email: all ? null : $('rc_as').value, frequency: fr, weekday: fr === 'weekly' ? +$('rc_wd').value : null, day_of_month: fr === 'monthly' ? Math.min(31, Math.max(1, +$('rc_dm').value || 1)) : null, due_after_days: Math.max(0, +$('rc_du').value || 0), created_by: S.me.email });
    if (error) return alert('خطأ: ' + error.message);
    $('rc_ti').value = ''; draw();
  };
  $('rc_run').onclick = async () => { $('rc_msg').textContent = '...'; try { const r = await apiPost('/api/recur', '{}'); const j = await r.json().catch(() => ({})); $('rc_msg').textContent = r.ok ? 'تم: أُنشئت ' + (j.created || 0) + ' مهمة مستحقة اليوم.' : 'تعذّر: ' + (j.error || r.status); if (r.ok && j.created) load(); } catch (e) { $('rc_msg').textContent = 'تعذّر الاتصال'; } };
  draw();
}
