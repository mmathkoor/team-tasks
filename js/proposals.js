/* proposals.js — الأفكار والتصويت + النشر والمحتوى + مكتبة المعرفة */
const PCAT = [
  ['video', 'فيديو'],
  ['photo', 'تصوير'],
  ['design', 'تصميم'],
  ['post', 'منشور'],
  ['campaign', 'حملة'],
  ['feature', 'ميزة/تطوير'],
  ['other', 'أخرى'],
];
const PSTS = [
  ['voting', 'للتصويت', 'p-wait'],
  ['approved', 'مقبول', 'p-ok'],
  ['rejected', 'مرفوض', 'p-late'],
  ['converted', 'تحول لمهمة', 'p-prog'],
];

// جسر توافق موحد مع نواة النظام (core.js)
const meKey = () => (S.me && typeof S.me === 'object' ? (S.me.email || S.me.id || '') : String(S.me || ''));
const mKey = m => (m && typeof m === 'object' ? (m.email || m.id || '') : String(m || ''));
const mName = idOrEmail => {
  if (!idOrEmail) return 'غير محدد';
  const list = S.allMembers || S.members || S.rawMembers || [];
  const found = list.find(m => same(m.email, idOrEmail) || same(m.id, idOrEmail));
  return found ? found.name : (typeof nm === 'function' ? nm(idOrEmail) : String(idOrEmail));
};
const modal = html => { if (typeof dlg !== 'undefined' && dlg) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); } };
const closeModal = () => { if (typeof dlg !== 'undefined' && dlg && dlg.open) dlg.close(); };
window.closeModal = closeModal;
const num = v => Number(v) || 0;
const fmt = v => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = d => String(d || '').slice(0, 10);
const ask = msg => Promise.resolve(confirm(msg));
const logAct = () => {};
window.db = sb;

function propVotes(pid) {
  const my = meKey();
  const vs = (S.votes || []).filter(x => x.proposal_id === pid);
  const up = vs.filter(x => Number(x.vote) === 1 || x.choice === 'yes');
  const dn = vs.filter(x => Number(x.vote) === -1 || x.choice === 'no');
  const mineRec = vs.find(x => same(x.member_id || x.email, my));
  const mine = mineRec ? (mineRec.vote || (mineRec.choice === 'yes' ? 1 : mineRec.choice === 'no' ? -1 : 0)) : 0;
  return { vs, up, dn, score: up.length - dn.length, mine };
}

function propsView() {
  const f = S.pflt || 'all';
  const pf = S.propAdvFilter || { q: '', cat: 'all', by: 'all', sort: 'score' };
  let rows = [...S.props].filter(p => (f === 'all' ? true : p.status === f));
  if (pf.q) {
    const q = pf.q.trim().toLowerCase();
    rows = rows.filter(p =>
      `${p.title || ''} ${p.summary || ''} ${p.details || ''} ${p.audience || ''} ${p.goal || ''}`.toLowerCase().includes(q)
    );
  }
  if (pf.cat && pf.cat !== 'all') rows = rows.filter(p => p.category === pf.cat);
  if (pf.by && pf.by !== 'all') rows = rows.filter(p => p.proposed_by === pf.by);

  rows.sort((a, b) => {
    if (pf.sort === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (pf.sort === 'budget') return num(b.budget) - num(a.budget);
    return propVotes(b.id).score - propVotes(a.id).score || String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  const c = st => S.props.filter(x => x.status === st).length;
  return `<div class="toolbar">
    <div><div class="View-title">الأفكار والمقترحات</div><div class="View-sub">اطرح فكرة، صوّت، ثم حوّل المقبول إلى مهمة مباشرة أو لجدول النشر</div></div>
    <div class="row">
      <button class="btn" id="p_adv_toggle">🎛️ فلترة متقدمة</button>
      <button class="btn primary" id="p_new">+ فكرة جديدة</button>
    </div>
  </div>
  <div class="kpi-strip">
    <button class="kbox ${f === 'all' ? 'on' : ''}" data-pf="all"><b>${S.props.length}</b><span>كل الأفكار</span></button>
    <button class="kbox warn ${f === 'voting' ? 'on' : ''}" data-pf="voting"><b>${c('voting')}</b><span>بانتظار التصويت</span></button>
    <button class="kbox ok ${f === 'approved' ? 'on' : ''}" data-pf="approved"><b>${c('approved')}</b><span>مقبولة</span></button>
    <button class="kbox info ${f === 'converted' ? 'on' : ''}" data-pf="converted"><b>${c('converted')}</b><span>تحولت لمهمة</span></button>
  </div>
  <div id="p_adv_bar" class="adv-filter-bar ${S.showPropAdv ? '' : 'hide'}" style="margin-bottom:14px">
    <div class="adv-filter-grid">
      <input class="in" id="pf_q" placeholder="🔍 بحث في عنوان أو تفاصيل الفكرة..." value="${esc(pf.q || '')}">
      <select class="sel" id="pf_cat">
        <option value="all">📂 كل التصنيفات</option>
        ${PCAT.map(([k, l]) => `<option value="${k}" ${pf.cat === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select class="sel" id="pf_by">
        <option value="all">👤 كل المقترحين</option>
        ${S.members.map(m => `<option value="${m.id}" ${pf.by === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
      <select class="sel" id="pf_sort">
        <option value="score" ${pf.sort === 'score' ? 'selected' : ''}>🔥 الأعلى تصويتاً</option>
        <option value="newest" ${pf.sort === 'newest' ? 'selected' : ''}>🆕 الأحدث أولاً</option>
        <option value="budget" ${pf.sort === 'budget' ? 'selected' : ''}>💰 الأعلى تكلفة</option>
      </select>
      <button class="btn sm ghost" id="pf_reset">إعادة ضبط</button>
    </div>
  </div>
  ${rows.length ? `<div class="pgrid">${rows.map(propCard).join('')}</div>` : '<div class="empty">لا توجد أفكار مطابقة للفلتر</div>'}`;
}

function propCard(p) {
  const v = propVotes(p.id);
  const st = PSTS.find(x => x[0] === p.status) || PSTS[0];
  const cat = PCAT.find(x => x[0] === p.category)?.[1] || p.category || 'فكرة';
  const total = S.members.length || 1;
  const pct = Math.round((v.vs.length / total) * 100);
  return `<div class="pcard" data-pid="${p.id}">
    <div class="row spread"><span class="pill p-cat">${esc(cat)}</span><span class="pill ${st[2]}">${st[1]}</span></div>
    <div class="pcard-title">${esc(p.title)}</div>
    ${p.summary ? `<div class="pcard-sum">${esc(p.summary)}</div>` : ''}
    <div class="pmeta">
      <span>💡 ${esc(mName(p.proposed_by))}</span>
      ${p.budget ? `<span>💰 ${fmt(p.budget)}</span>` : ''}
      ${p.expected_days ? `<span>⏱️ ${p.expected_days} يوم</span>` : ''}
      ${p.audience ? `<span>🎯 ${esc(p.audience)}</span>` : ''}
    </div>
    ${p.details ? `<div class="pdetail">${esc(p.details)}</div>` : ''}
    ${p.reference_url ? `<a class="plink" href="${esc(p.reference_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 رابط مرجعي</a>` : ''}
    <div class="vbar">
      <div class="vbtns">
        <button class="vbtn up ${v.mine === 1 ? 'on' : ''}" data-vote="1" data-id="${p.id}">👍 أؤيد <b>${v.up.length}</b></button>
        <button class="vbtn dn ${v.mine === -1 ? 'on' : ''}" data-vote="-1" data-id="${p.id}">👎 أعارض <b>${v.dn.length}</b></button>
      </div>
      <div class="vinfo"><span>النتيجة: <b class="${v.score > 0 ? 't-ok' : v.score < 0 ? 't-late' : ''}">${v.score > 0 ? '+' + v.score : v.score}</b></span><span>صوّت ${v.vs.length}/${total} (${pct}%)</span></div>
    </div>
    ${
      v.vs.length
        ? `<div class="vvoters">${v.vs
            .map(
              x =>
                `<span class="vtag ${x.vote === 1 ? 'up' : 'dn'}" title="${esc(x.comment || '')}">${x.vote === 1 ? '👍' : '👎'} ${esc(mName(x.member_id))}${x.comment ? ` · "${esc(x.comment)}"` : ''}</span>`
            )
            .join('')}</div>`
        : ''
    }
    <div class="row spread" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);flex-wrap:wrap;gap:6px">
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button class="btn sm" data-pnote="${p.id}">💬 رأي مع التصويت</button>
        <button class="btn sm" data-pedit="${p.id}">تعديل</button>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button class="btn sm" data-ptopub="${p.id}" title="إرسال الفكرة إلى مسار النشر">📢 للنشر</button>
        ${p.status !== 'converted' ? `<button class="btn sm ok" data-pconv="${p.id}">⚡ حوّل لمهمة</button>` : ''}
      </div>
    </div>
  </div>`;
}

function bindProps() {
  if ($('p_new')) $('p_new').onclick = () => propDialog();
  if ($('p_adv_toggle')) {
    $('p_adv_toggle').onclick = () => {
      S.showPropAdv = !S.showPropAdv;
      render();
    };
  }
  const pf = S.propAdvFilter || (S.propAdvFilter = { q: '', cat: 'all', by: 'all', sort: 'score' });
  if ($('pf_q')) {
    $('pf_q').oninput = e => {
      pf.q = e.target.value;
      render();
      const el = $('pf_q');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    };
  }
  if ($('pf_cat')) $('pf_cat').onchange = e => { pf.cat = e.target.value; render(); };
  if ($('pf_by')) $('pf_by').onchange = e => { pf.by = e.target.value; render(); };
  if ($('pf_sort')) $('pf_sort').onchange = e => { pf.sort = e.target.value; render(); };
  if ($('pf_reset')) {
    $('pf_reset').onclick = () => {
      S.propAdvFilter = { q: '', cat: 'all', by: 'all', sort: 'score' };
      render();
    };
  }

  document.querySelectorAll('[data-pf]').forEach(b => (b.onclick = () => { S.pflt = b.dataset.pf; render(); }));
  document.querySelectorAll('[data-vote]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        castVote(b.dataset.id, Number(b.dataset.vote));
      })
  );
  document.querySelectorAll('[data-pnote]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        voteCommentDialog(b.dataset.pnote);
      })
  );
  document.querySelectorAll('[data-pedit]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        propDialog(S.props.find(x => x.id === b.dataset.pedit));
      })
  );
  document.querySelectorAll('[data-pconv]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        convertProp(b.dataset.pconv);
      })
  );
  document.querySelectorAll('[data-ptopub]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        convertPropToPub(b.dataset.ptopub);
      })
  );
}

async function castVote(pid, val, comment) {
  if (!S.me) return toast('اختر اسمك من الأعلى للتصويت', false);
  const ex = S.votes.find(x => x.proposal_id === pid && x.member_id === S.me);
  if (ex && ex.vote === val && comment === undefined) {
    await db.from('proposal_votes').delete().eq('id', ex.id);
  } else if (ex) {
    await db.from('proposal_votes').update({ vote: val, comment: comment ?? ex.comment }).eq('id', ex.id);
  } else {
    await db.from('proposal_votes').insert({ proposal_id: pid, member_id: S.me, vote: val, comment: comment || null });
  }
  await load();
}

function voteCommentDialog(pid) {
  if (!S.me) return toast('اختر اسمك من الأعلى أولاً', false);
  const ex = S.votes.find(x => x.proposal_id === pid && x.member_id === S.me);
  modal(`<h3>رأيك حول الفكرة</h3>
    <div class="field"><label>التصويت</label><select class="sel" id="vc_v"><option value="1" ${ex?.vote !== -1 ? 'selected' : ''}>👍 أؤيد</option><option value="-1" ${ex?.vote === -1 ? 'selected' : ''}>👎 أعارض</option></select></div>
    <div class="field"><label>سبب التصويت / ملاحظة مختصرة</label><input class="in" id="vc_c" value="${esc(ex?.comment || '')}" placeholder="مثال: فكرة ممتازة لكن نحتاج تقليل التكلفة"></div>
    <div class="factions"><button class="btn primary" id="vc_ok">حفظ الرأي</button></div>`);
  $('vc_ok').onclick = async () => {
    await castVote(pid, Number($('vc_v').value), $('vc_c').value.trim());
    closeModal();
  };
}

function propDialog(p) {
  const isNew = !p?.id;
  const x = p || { category: 'video', proposed_by: S.me || '', status: 'voting', expected_days: 3, budget: 0 };
  modal(`<h3>${isNew ? 'طرح فكرة جديدة للتصويت' : 'تعديل الفكرة'}</h3>
    <div class="fgrid">
      <div class="field full"><label>عنوان الفكرة *</label><input class="in" id="p_ti" value="${esc(x.title || '')}" placeholder="مثال: سلسلة ريلز قصيرة عن كواليس العمل"></div>
      <div class="field"><label>التصنيف</label><select class="sel" id="p_cat">${PCAT.map(([k, l]) => `<option value="${k}" ${x.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>صاحب الفكرة</label><select class="sel" id="p_by"><option value="">—</option>${S.members.map(m => `<option value="${m.id}" ${x.proposed_by === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field full"><label>ملخص سريع (سطر واحد يظهر في البطاقة)</label><input class="in" id="p_sum" value="${esc(x.summary || '')}" placeholder="الفكرة باختصار شديد"></div>
      <div class="field"><label>الجمهور المستهدف</label><input class="in" id="p_aud" value="${esc(x.audience || '')}" placeholder="عملاء متجر، متابعين جدد..."></div>
      <div class="field"><label>الهدف المتوقع</label><input class="in" id="p_goal" value="${esc(x.goal || '')}" placeholder="زيادة مبيعات، تفاعل، وعي..."></div>
      <div class="field"><label>المدة المتوقعة (أيام)</label><input class="in" type="number" id="p_days" value="${x.expected_days || ''}"></div>
      <div class="field"><label>التكلفة التقديرية</label><input class="in" type="number" id="p_bud" value="${x.budget || 0}"></div>
      <div class="field"><label>حالة الفكرة</label><select class="sel" id="p_st">${PSTS.map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>رابط مرجعي / مثال مشابه</label><input class="in" id="p_url" value="${esc(x.reference_url || '')}" placeholder="https://..."></div>
      <div class="field full"><label>تفاصيل التنفيذ والخطوات المقترحة</label><textarea class="ta" id="p_det">${esc(x.details || '')}</textarea></div>
    </div>
    <div class="factions">
      ${!isNew ? '<button class="btn danger" id="p_del">حذف</button>' : ''}
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn primary" id="p_save">حفظ الفكرة</button>
    </div>`);
  $('p_save').onclick = async () => {
    const title = $('p_ti').value.trim();
    if (!title) return toast('اكتب عنوان الفكرة', false);
    const row = {
      title,
      category: $('p_cat').value,
      proposed_by: $('p_by').value || null,
      summary: $('p_sum').value.trim() || null,
      audience: $('p_aud').value.trim() || null,
      goal: $('p_goal').value.trim() || null,
      expected_days: Number($('p_days').value) || null,
      budget: Number($('p_bud').value) || 0,
      status: $('p_st').value,
      reference_url: $('p_url').value.trim() || null,
      details: $('p_det').value.trim() || null,
    };
    const r = isNew ? await db.from('proposals').insert(row).select().single() : await db.from('proposals').update(row).eq('id', x.id);
    if (r.error) return toast(r.error.message, false);
    if (isNew && S.me && r.data?.id) await db.from('proposal_votes').insert({ proposal_id: r.data.id, member_id: S.me, vote: 1 });
    logAct(isNew ? 'إضافة فكرة' : 'تعديل فكرة', title);
    closeModal();
    toast('تم الحفظ');
    await load();
  };
  if (!isNew) {
    $('p_del').onclick = async () => {
      if (!(await ask('حذف هذه الفكرة؟'))) return;
      await db.from('proposals').delete().eq('id', x.id);
      closeModal();
      await load();
    };
  }
}

function convertProp(pid) {
  const p = S.props.find(x => x.id === pid);
  if (!p) return;
  closeModal();
  taskDialog({
    title: p.title,
    type: p.category,
    assigned_to: p.proposed_by || S.me || '',
    assigned_by: S.me || '',
    priority: 'high',
    status: 'waiting',
    start_date: today(),
    due_date: p.expected_days ? addDays(today(), p.expected_days) : addDays(today(), 5),
    cost: p.budget || 0,
    reference_url: p.reference_url || '',
    notes: [p.summary, p.details, p.goal ? 'الهدف: ' + p.goal : '', p.audience ? 'الجمهور: ' + p.audience : ''].filter(Boolean).join('\n'),
    proposal_id: p.id,
  });
}

function convertPropToPub(pid) {
  const p = S.props.find(x => x.id === pid);
  if (!p) return;
  pubDialog({
    title: p.title,
    stage: 'intake',
    content_type: p.category || 'post',
    platform: 'instagram',
    intake_brief: [p.summary, p.details].filter(Boolean).join('\n'),
    caption: p.summary || '',
    target_audience: p.audience || '',
    goal: p.goal || '',
    reference_url: p.reference_url || '',
    assigned_intake: p.proposed_by || S.me || '',
    publish_date: p.expected_days ? addDays(today(), p.expected_days) : addDays(today(), 3),
  });
}

/* =========================================================================
   1. تخزين مشترك عبر ord_settings + localStorage (النشر + المعرفة + التواجد)
   ========================================================================= */
function readHiddenJsonList(prefix) {
  const arr = Array.isArray(S.ordSet?.hidden_views) ? S.ordSet.hidden_views : [];
  const out = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.startsWith(prefix)) {
      try {
        const parsed = JSON.parse(item.slice(prefix.length));
        if (parsed && parsed.id) out.push(parsed);
      } catch {}
    }
  }
  return out;
}

async function saveHiddenJsonItem(prefix, obj) {
  if (!obj.id) obj.id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const cur = Array.isArray(S.ordSet?.hidden_views) ? [...S.ordSet.hidden_views] : [];
  const filtered = cur.filter(item => {
    if (typeof item !== 'string' || !item.startsWith(prefix)) return true;
    try {
      const p = JSON.parse(item.slice(prefix.length));
      return p.id !== obj.id;
    } catch {
      return true;
    }
  });
  filtered.push(prefix + JSON.stringify(obj));
  if (S.ordSet) S.ordSet.hidden_views = filtered;
  syncPubAndKbArrays();
  saveCache();
  if (typeof saveOrdSettingsPatch === 'function') {
    await saveOrdSettingsPatch({ hidden_views: filtered });
  } else if (S.ordSet?.id) {
    await sb.from('ord_settings').update({ hidden_views: filtered }).eq('id', S.ordSet.id);
  }
  return obj;
}

async function deleteHiddenJsonItem(prefix, id) {
  const cur = Array.isArray(S.ordSet?.hidden_views) ? [...S.ordSet.hidden_views] : [];
  const filtered = cur.filter(item => {
    if (typeof item !== 'string' || !item.startsWith(prefix)) return true;
    try {
      const p = JSON.parse(item.slice(prefix.length));
      return p.id !== id;
    } catch {
      return true;
    }
  });
  if (S.ordSet) S.ordSet.hidden_views = filtered;
  syncPubAndKbArrays();
  saveCache();
  if (typeof saveOrdSettingsPatch === 'function') {
    await saveOrdSettingsPatch({ hidden_views: filtered });
  } else if (S.ordSet?.id) {
    await sb.from('ord_settings').update({ hidden_views: filtered }).eq('id', S.ordSet.id);
  }
}

function getDefaultKbSeed() {
  return [
    {
      id: 'kb_seed_1',
      title: 'برومبت كتابة إعلان تسويقي جذاب (كابي رايتنج)',
      category: 'prompt',
      tags: ['إعلانات', 'كابي رايتنج', 'مبيعات', 'سوشيال ميديا'],
      summary: 'برومبت احترافي لتوليد 3 زوايا إعلانية مقنعة لأي منتج أو خدمة مع هوك قوي.',
      content:
        'أنت كاتب محتوى إعلاني محترف (Copywriter). اكتب لي 3 نصوص إعلانية لمنصة [المنصة] لتسويق [اسم المنتج أو الخدمة] الموجه إلى [الجمهور المستهدف].\nالميزة التنافسية الأهم: [الميزة الأساسية].\nاجعل كل نص يحتوي على:\n1. خطاف أولي قوي (Hook) يوقف التمرير.\n2. عرض المشكلة والحل باختصار.\n3. دعوة واضحة لاتخاذ إجراء (CTA) في النهاية.',
      author_id: '',
      pinned: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'kb_seed_2',
      title: 'برومبت تحويل فكرة إلى سيناريو ريلز / تيك توك (30 ثانية)',
      category: 'prompt',
      tags: ['ريلز', 'فيديو', 'سيناريو', 'تيك توك'],
      summary: 'يقسم الفيديو إلى لقطات بصرية ونص صوتي (Voiceover) جاهز للتصوير والمونتاج.',
      content:
        'اكتب سيناريو فيديو قصير (Reels / TikTok) مدته 30 ثانية حول موضوع: [موضوع الفيديو].\nالهدف من الفيديو: [الهدف مثل: زيادة المتابعين / بيع منتج].\nقسّم السيناريو في جدول يوضح:\n- الثانية (0-3 ثواني): الخطاف البصري واللفظي.\n- الثانية (3-22 ثانية): القيمة السريعة واللقطات المقترحة.\n- الثانية (22-30 ثانية): الخاتمة والـ Call To Action.',
      author_id: '',
      pinned: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'kb_seed_3',
      title: 'دليل استلام ملفات التصميم وتجهيزها للنشر',
      category: 'sop',
      tags: ['تصميم', 'نشر', 'جودة'],
      summary: 'قائمة فحص سريعة قبل نقل أي منشور من مرحلة التصميم إلى مرحلة جاهز للنشر.',
      content:
        '1. التأكد من مطابقة المقاسات للمنصة المستهدفة (1080x1350 للانستقرام بوست، 1080x1920 للستوري والريلز).\n2. مراجعة الأخطاء الإملائية وأرقام التواصل في التصميم.\n3. التأكد من إرفاق رابط الملف المفتوح أو النهائي بدقة عالية.\n4. تجهيز النص المرفق (Caption) والهاشتاقات المناسبة قبل التحويل للنشر.',
      author_id: '',
      pinned: false,
      created_at: new Date().toISOString(),
    },
  ];
}

function syncPubAndKbArrays() {
  const pubs = readHiddenJsonList('__pub:');
  if (pubs.length) {
    S.pubItems = pubs;
  } else if (!Array.isArray(S.pubItems)) {
    S.pubItems = [];
  }

  const kbs = readHiddenJsonList('__kb:');
  if (kbs.length) {
    S.kbItems = kbs;
  } else if (!Array.isArray(S.kbItems) || !S.kbItems.length) {
    S.kbItems = getDefaultKbSeed();
  }
}

/* =========================================================================
   2. نظام التواجد الحي للرد (مثل Microsoft Teams) - ينقطع فور انقطاع الإنترنت
   ========================================================================= */
const PRES_TIMEOUT_MS = 95 * 1000; // 95 ثانية بدون نبضة أو اتصال = غير متاح تلقائياً
let _presTimer = null;

function getResponderPresences() {
  return readHiddenJsonList('__pres:');
}

function getMemberPresenceState(memberId) {
  const targetKey = mKey(memberId);
  const rec = getResponderPresences().find(x => same(x.id, targetKey));
  if (!rec || !rec.want_available) {
    return { status: 'off', label: 'غير متاح للرد', dot: 'off', rec };
  }
  // إذا كان هذا الجهاز هو نفس العضو والإنترنت مقطوع حالياً، يظهر فوراً غير متاح!
  if (same(targetKey, meKey()) && !navigator.onLine) {
    return { status: 'offline', label: 'انقطع الاتصال (أوفلاين)', dot: 'offline', rec };
  }
  if (!rec.online) {
    return { status: 'offline', label: 'انقطع الاتصال', dot: 'offline', rec };
  }
  const age = Date.now() - (Number(rec.last_seen) || 0);
  if (age > PRES_TIMEOUT_MS) {
    return { status: 'offline', label: 'غير متصل حالياً', dot: 'offline', rec };
  }
  return { status: 'online', label: 'متاح للرد الآن', dot: 'online', rec };
}

async function setMyResponderAvailability(wantAvailable, customNote) {
  const my = meKey();
  if (!my) return toast('اختر اسمك من الأعلى أولاً', false);
  const existing = getResponderPresences().find(x => same(x.id, my)) || { id: my };
  const isOnline = navigator.onLine;
  const updated = {
    ...existing,
    id: my,
    member_id: my,
    want_available: Boolean(wantAvailable),
    online: Boolean(wantAvailable && isOnline),
    last_seen: Date.now(),
    note: customNote !== undefined ? customNote : existing.note || 'جاهز للرد على الرسائل والتعليقات',
  };
  await saveHiddenJsonItem('__pres:', updated);
  if (S.view === 'pub') render();
}

async function handleResponderNetChange(isOnline) {
  const my = meKey();
  if (!my) return;
  const existing = getResponderPresences().find(x => same(x.id, my));
  if (!existing || !existing.want_available) {
    if (S.view === 'pub') render();
    return;
  }
  const updated = {
    ...existing,
    online: Boolean(isOnline),
    last_seen: Date.now(),
  };
  await saveHiddenJsonItem('__pres:', updated);
  if (S.view === 'pub') render();
}

function startResponderHeartbeat() {
  if (_presTimer) clearInterval(_presTimer);
  _presTimer = setInterval(async () => {
    const my = meKey();
    if (!my) return;
    const existing = getResponderPresences().find(x => same(x.id, my));
    if (existing && existing.want_available && navigator.onLine) {
      await saveHiddenJsonItem('__pres:', {
        ...existing,
        online: true,
        last_seen: Date.now(),
      });
    }
    if (S.view === 'pub') render();
  }, 35000);

  if (!window._presUnloadBound) {
    window._presUnloadBound = true;
    window.addEventListener('pagehide', () => {
      const my = meKey();
      if (!my) return;
      const existing = getResponderPresences().find(x => same(x.id, my));
      if (existing && existing.want_available) {
        saveHiddenJsonItem('__pres:', { ...existing, online: false, last_seen: Date.now() });
      }
    });
  }
}

/* =========================================================================
   3. تبويب النشر وإدارة المحتوى (Publishing Studio)
   ========================================================================= */
const PUB_STAGES = [
  ['intake', '📥 الاستلام والإعداد', 'p-wait'],
  ['design', '🎨 التصميم والمونتاج', 'p-prog'],
  ['review', '👁️ المراجعة والاعتماد', 'p-cat'],
  ['ready', '🚀 جاهز للنشر', 'p-ok'],
  ['published', '✅ تم النشر', 'p-ok'],
];

const PUB_PLATFORMS = [
  ['facebook', 'فيسبوك', '📘'],
  ['instagram', 'انستقرام', '📸'],
  ['whatsapp', 'واتساب', '💬'],
  ['telegram', 'تيليجرام', '✈️'],
  ['tiktok', 'تيك توك', '🎵'],
  ['x', 'منصة X', '🐦'],
  ['youtube', 'يوتيوب', '▶️'],
];

function pubStageInfo(st) {
  return PUB_STAGES.find(x => x[0] === st) || PUB_STAGES[0];
}

function pubPlatformInfo(pl) {
  return PUB_PLATFORMS.find(x => x[0] === pl) || ['other', pl || 'عام', '🌐'];
}

function pubView() {
  syncPubAndKbArrays();
  const items = Array.isArray(S.pubItems) ? S.pubItems : [];
  const pf = S.pubFilter || (S.pubFilter = { stage: 'all', platform: 'all', assignee: 'all', q: '', from: '', to: '', mode: 'board' });

  let filtered = [...items];
  if (pf.stage !== 'all') filtered = filtered.filter(x => x.stage === pf.stage);
  if (pf.platform !== 'all') filtered = filtered.filter(x => x.platform === pf.platform);
  if (pf.assignee !== 'all') {
    filtered = filtered.filter(
      x => same(x.assigned_intake, pf.assignee) || same(x.assigned_design, pf.assignee) || same(x.assigned_pub, pf.assignee)
    );
  }
  if (pf.q) {
    const q = pf.q.trim().toLowerCase();
    filtered = filtered.filter(x =>
      `${x.title || ''} ${x.caption || ''} ${x.design_headline || ''} ${x.intake_brief || ''} ${x.hashtags || ''}`.toLowerCase().includes(q)
    );
  }
  if (pf.from) filtered = filtered.filter(x => (x.publish_date || '') >= pf.from);
  if (pf.to) filtered = filtered.filter(x => (x.publish_date || '') <= pf.to);

  filtered.sort((a, b) => String(a.publish_date || '9999').localeCompare(String(b.publish_date || '9999')));

  const countStage = st => items.filter(x => x.stage === st).length;
  const myPres = S.me ? getMemberPresenceState(meKey()) : null;
  const activeResponders = S.members
    .map(m => ({ member: m, pres: getMemberPresenceState(mKey(m)) }))
    .filter(x => x.pres.rec?.want_available);

  return `<div class="toolbar">
    <div>
      <div class="View-title">📢 استوديو النشر وإدارة المحتوى</div>
      <div class="View-sub">مسار متكامل من الاستلام للتصميم إلى النشر المباشر مع تعبئة تلقائية وسجل تاريخي للمراحل</div>
    </div>
    <div class="row" style="flex-wrap:wrap">
      <div class="seg">
        <button class="${pf.mode === 'board' ? 'on' : ''}" data-pubmode="board">📋 مسار المراحل</button>
        <button class="${pf.mode === 'grid' ? 'on' : ''}" data-pubmode="grid">🗂️ بطاقات مفصلة</button>
      </div>
      <button class="btn" id="pub_social_cfg" title="إعداد الربط المباشر مع فيسبوك وتيليجرام">🔗 ربط المنصات</button>
      <button class="btn primary" id="pub_new">+ منشور جديد</button>
    </div>
  </div>

  <!-- شريط المتاحين للرد (بنظام Microsoft Teams الذكي) -->
  <div class="pub-pres-bar">
    <div class="row spread" style="flex-wrap:wrap;gap:10px">
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <span class="pub-pres-title">🎧 فريق الردود والمتابعة الآن:</span>
        ${
          activeResponders.length
            ? activeResponders
                .map(
                  ({ member, pres }) => `
              <div class="pres-chip ${pres.dot}">
                <span class="pres-dot ${pres.dot}"></span>
                <b>${esc(member.name)}</b>
                <span class="pres-chip-sub">${esc(pres.label)}</span>
                ${pres.rec?.note ? `<span class="pres-chip-note">· ${esc(pres.rec.note)}</span>` : ''}
              </div>`
                )
                .join('')
            : '<span class="muted">لا يوجد موظف مفعّل لوضع "متاح للرد" حالياً</span>'
        }
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${
          S.me
            ? `<button class="btn sm ${myPres?.rec?.want_available ? (myPres.status === 'online' ? 'ok' : 'warn') : ''}" id="pub_toggle_pres">
                <span class="pres-dot ${myPres?.dot || 'off'}"></span>
                ${myPres?.rec?.want_available ? (myPres.status === 'online' ? 'أنت متاح للرد (إيقاف)' : 'متاح للرد — أوفلاين (إيقاف)') : 'تفعيل: أنا متاح للرد الآن'}
              </button>
              <button class="btn sm ghost" id="pub_pres_note" title="تحديث ملاحظة التواجد">✏️ الحالة</button>`
            : '<span class="muted">اختر اسمك من الأعلى لتفعيل حالة التواجد للرد</span>'
        }
      </div>
    </div>
  </div>

  <!-- مؤشرات مراحل النشر -->
  <div class="kpi-strip">
    <button class="kbox ${pf.stage === 'all' ? 'on' : ''}" data-pubst="all"><b>${items.length}</b><span>كل المنشورات</span></button>
    <button class="kbox warn ${pf.stage === 'intake' ? 'on' : ''}" data-pubst="intake"><b>${countStage('intake')}</b><span>📥 الاستلام</span></button>
    <button class="kbox info ${pf.stage === 'design' ? 'on' : ''}" data-pubst="design"><b>${countStage('design')}</b><span>🎨 التصميم</span></button>
    <button class="kbox ${pf.stage === 'review' ? 'on' : ''}" data-pubst="review"><b>${countStage('review')}</b><span>👁️ المراجعة</span></button>
    <button class="kbox ok ${pf.stage === 'ready' ? 'on' : ''}" data-pubst="ready"><b>${countStage('ready')}</b><span>🚀 جاهز للنشر</span></button>
    <button class="kbox ok ${pf.stage === 'published' ? 'on' : ''}" data-pubst="published"><b>${countStage('published')}</b><span>✅ تم النشر</span></button>
  </div>

  <!-- شريط الفلترة المتقدمة للنشر -->
  <div class="adv-filter-bar" style="margin-bottom:14px">
    <div class="adv-filter-grid">
      <input class="in" id="pubf_q" placeholder="🔍 بحث بالعنوان، الكابشن، الهاشتاق..." value="${esc(pf.q || '')}">
      <select class="sel" id="pubf_plat">
        <option value="all">🌐 كل المنصات</option>
        ${PUB_PLATFORMS.map(([k, l, ic]) => `<option value="${k}" ${pf.platform === k ? 'selected' : ''}>${ic} ${l}</option>`).join('')}
      </select>
      <select class="sel" id="pubf_mem">
        <option value="all">👤 كل المسؤولين</option>
        ${S.members.map(m => `<option value="${m.id}" ${pf.assignee === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
      <div class="row" style="gap:4px">
        <input class="in" type="date" id="pubf_from" value="${esc(pf.from || '')}" title="من تاريخ نشر">
        <input class="in" type="date" id="pubf_to" value="${esc(pf.to || '')}" title="إلى تاريخ نشر">
      </div>
      <button class="btn sm ghost" id="pubf_reset">إعادة ضبط</button>
    </div>
  </div>

  ${
    pf.mode === 'board'
      ? `<div class="pub-board">
          ${PUB_STAGES.map(([stKey, stLabel, stCls]) => {
            const colItems = filtered.filter(x => x.stage === stKey);
            return `<div class="pub-col">
              <div class="pub-col-head">
                <span class="pill ${stCls}">${stLabel}</span>
                <b>${colItems.length}</b>
              </div>
              <div class="pub-col-body">
                ${colItems.length ? colItems.map(pubCardHtml).join('') : '<div class="empty-mini">لا يوجد محتوى في هذه المرحلة</div>'}
              </div>
            </div>`;
          }).join('')}
        </div>`
      : `<div class="pub-grid-list">
          ${filtered.length ? filtered.map(pubCardHtml).join('') : '<div class="empty">لا توجد منشورات مطابقة للفلتر</div>'}
        </div>`
  }`;
}

function pubCardHtml(item) {
  const st = pubStageInfo(item.stage);
  const pl = pubPlatformInfo(item.platform);
  const histCount = Array.isArray(item.stage_history) ? item.stage_history.length : 0;
  const stageIdx = PUB_STAGES.findIndex(x => x[0] === item.stage);
  const nextStage = stageIdx >= 0 && stageIdx < PUB_STAGES.length - 1 ? PUB_STAGES[stageIdx + 1] : null;

  const curOwner =
    item.stage === 'intake'
      ? item.assigned_intake
      : item.stage === 'design'
      ? item.assigned_design
      : item.assigned_pub || item.assigned_design || item.assigned_intake;

  return `<div class="pub-card" data-pubid="${item.id}">
    <div class="row spread" style="gap:6px;flex-wrap:wrap">
      <span class="pill p-cat">${pl[2]} ${esc(pl[1])}</span>
      <span class="pill ${st[2]}">${st[1]}</span>
    </div>
    <div class="pub-card-title">${esc(item.title || 'منشور بدون عنوان')}</div>
    ${
      item.design_headline
        ? `<div class="pub-card-headline">🎨 نص التصميم: ${esc(item.design_headline)}</div>`
        : item.intake_brief
        ? `<div class="pub-card-headline">📥 الفكرة: ${esc(item.intake_brief)}</div>`
        : ''
    }
    ${item.caption ? `<div class="pub-card-cap">${esc(item.caption)}</div>` : ''}
    <div class="pub-card-meta">
      ${curOwner ? `<span>👤 ${esc(mName(curOwner))}</span>` : ''}
      ${item.publish_date ? `<span>📅 ${fmtDate(item.publish_date)}</span>` : ''}
      ${histCount ? `<span class="pub-hist-badge" title="عدد المراحل المحفوظة في السجل التاريخي">🕓 سجل المراحل (${histCount})</span>` : ''}
    </div>
    ${
      item.media_url
        ? `<div style="margin-top:6px"><a class="plink" href="${esc(item.media_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🖼️ معاينة المرفق / التصميم</a></div>`
        : ''
    }
    <div class="pub-card-actions" onclick="event.stopPropagation()">
      ${
        nextStage
          ? `<button class="btn sm ok" data-pubnext="${item.id}" title="ينقل للمرحلة التالية مع تعبئة الخانات تلقائياً وحفظ السجل">⏭️ تحويل إلى: ${nextStage[1]}</button>`
          : ''
      }
      <button class="btn sm primary" data-pubshare="${item.id}">📤 مشاركة / نشر مباشر</button>
      <button class="btn sm ghost" data-pubedit="${item.id}">✏️ التفاصيل والسجل</button>
    </div>
  </div>`;
}

function bindPub() {
  if ($('pub_new')) $('pub_new').onclick = () => pubDialog();
  if ($('pub_social_cfg')) $('pub_social_cfg').onclick = () => socialConfigDialog();

  if ($('pub_toggle_pres')) {
    $('pub_toggle_pres').onclick = async () => {
      const cur = getMemberPresenceState(S.me);
      const nextWant = !cur.rec?.want_available;
      await setMyResponderAvailability(nextWant);
      toast(nextWant ? 'تم تفعيل وضع: متاح للرد الآن 🎧' : 'تم إيقاف وضع التواجد للرد');
    };
  }
  if ($('pub_pres_note')) {
    $('pub_pres_note').onclick = () => {
      if (!S.me) return toast('اختر اسمك أولاً', false);
      const cur = getMemberPresenceState(S.me);
      modal(`<h3>تحديث حالة التواجد للرد</h3>
        <div class="field"><label>ملاحظة قصيرة تظهر للفريق</label>
          <input class="in" id="pres_note_in" value="${esc(cur.rec?.note || 'جاهز للرد على الرسائل والتعليقات')}" placeholder="مثال: أتابع رسائل انستقرام وواتساب الآن">
        </div>
        <div class="factions">
          <button class="btn ghost" onclick="closeModal()">إلغاء</button>
          <button class="btn primary" id="pres_note_save">حفظ وتفعيل التواجد</button>
        </div>`);
      $('pres_note_save').onclick = async () => {
        await setMyResponderAvailability(true, $('pres_note_in').value.trim());
        closeModal();
        toast('تم تحديث حالة التواجد');
      };
    };
  }

  const pf = S.pubFilter || (S.pubFilter = { stage: 'all', platform: 'all', assignee: 'all', q: '', from: '', to: '', mode: 'board' });
  document.querySelectorAll('[data-pubmode]').forEach(b => {
    b.onclick = () => {
      pf.mode = b.dataset.pubmode;
      render();
    };
  });
  document.querySelectorAll('[data-pubst]').forEach(b => {
    b.onclick = () => {
      pf.stage = b.dataset.pubst;
      render();
    };
  });
  if ($('pubf_q')) {
    $('pubf_q').oninput = e => {
      pf.q = e.target.value;
      render();
      const el = $('pubf_q');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    };
  }
  if ($('pubf_plat')) $('pubf_plat').onchange = e => { pf.platform = e.target.value; render(); };
  if ($('pubf_mem')) $('pubf_mem').onchange = e => { pf.assignee = e.target.value; render(); };
  if ($('pubf_from')) $('pubf_from').onchange = e => { pf.from = e.target.value; render(); };
  if ($('pubf_to')) $('pubf_to').onchange = e => { pf.to = e.target.value; render(); };
  if ($('pubf_reset')) {
    $('pubf_reset').onclick = () => {
      S.pubFilter = { stage: 'all', platform: 'all', assignee: 'all', q: '', from: '', to: '', mode: pf.mode };
      render();
    };
  }

  document.querySelectorAll('[data-pubid]').forEach(card => {
    card.onclick = () => {
      const item = S.pubItems.find(x => x.id === card.dataset.pubid);
      if (item) pubDialog(item);
    };
  });
  document.querySelectorAll('[data-pubedit]').forEach(b => {
    b.onclick = () => {
      const item = S.pubItems.find(x => x.id === b.dataset.pubedit);
      if (item) pubDialog(item);
    };
  });
  document.querySelectorAll('[data-pubnext]').forEach(b => {
    b.onclick = () => advancePubStageDialog(b.dataset.pubnext);
  });
  document.querySelectorAll('[data-pubshare]').forEach(b => {
    b.onclick = () => shareOrPublishDialog(b.dataset.pubshare);
  });
}

/* انتقال المرحلة مع التعبئة التلقائية من المرحلة السابقة والاحتفاظ بسجل تاريخي كامل */
function advancePubStageDialog(pubId) {
  const item = S.pubItems.find(x => x.id === pubId);
  if (!item) return;
  const idx = PUB_STAGES.findIndex(x => x[0] === item.stage);
  const nextStage = idx >= 0 && idx < PUB_STAGES.length - 1 ? PUB_STAGES[idx + 1][0] : item.stage;
  // نفتح نافذة التعديل مع المرحلة الجديدة وخانات المرحلة الجديدة معبأة تلقائياً من المرحلة السابقة
  const prefilled = {
    ...item,
    _prevStage: item.stage,
    stage: nextStage,
    // تعبئة تلقائية لخانات التصميم من مرحلة الاستلام إذا كانت فارغة
    design_headline: item.design_headline || item.intake_brief || item.title || '',
    design_notes: item.design_notes || item.intake_notes || '',
    caption: item.caption || item.intake_brief || '',
  };
  pubDialog(prefilled, true);
}

function pubDialog(item, isStageTransition = false) {
  const isNew = !item?.id;
  const x = item || {
    title: '',
    stage: 'intake',
    platform: 'instagram',
    content_type: 'post',
    publish_date: addDays(today(), 2),
    assigned_intake: S.me || '',
    assigned_design: '',
    assigned_pub: '',
    intake_brief: '',
    intake_notes: '',
    design_headline: '',
    design_notes: '',
    media_url: '',
    caption: '',
    hashtags: '',
    target_audience: '',
    goal: '',
    reference_url: '',
    stage_history: [],
  };

  const history = Array.isArray(x.stage_history) ? x.stage_history : [];

  modal(`<h3>${isNew ? 'إضافة منشور جديد لمسار النشر' : isStageTransition ? `🚀 الانتقال إلى مرحلة: ${pubStageInfo(x.stage)[1]}` : 'تعديل بيانات المنشور وسجل المراحل'}</h3>
    ${
      isStageTransition
        ? `<div class="alert-banner ok" style="margin-bottom:12px">✨ تم تعبئة خانات هذه المرحلة تلقائياً من المرحلة السابقة (${pubStageInfo(x._prevStage)[1]}) — يمكنك التعديل عليها وسيتم حفظ المرحلة السابقة في السجل التاريخي.</div>`
        : ''
    }
    <div class="fgrid">
      <div class="field full"><label>عنوان المنشور / الموضوع *</label><input class="in" id="pub_ti" value="${esc(x.title || '')}" placeholder="مثال: عرض باقة التخرج — خصم 20%"></div>
      <div class="field">
        <label>المرحلة الحالية</label>
        <select class="sel" id="pub_st">
          ${PUB_STAGES.map(([k, l]) => `<option value="${k}" ${x.stage === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>المنصة الرئيسية</label>
        <select class="sel" id="pub_pl">
          ${PUB_PLATFORMS.map(([k, l, ic]) => `<option value="${k}" ${x.platform === k ? 'selected' : ''}>${ic} ${l}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>تاريخ النشر المستهدف</label>
        <input class="in" type="date" id="pub_dt" value="${esc(x.publish_date || '')}">
      </div>
      <div class="field">
        <label>الجمهور المستهدف</label>
        <input class="in" id="pub_aud" value="${esc(x.target_audience || '')}" placeholder="عملاء جدد، طلاب، شركات...">
      </div>

      <!-- مسؤولو المراحل -->
      <div class="field">
        <label>📥 مسؤول الاستلام والإعداد</label>
        <select class="sel" id="pub_m_in"><option value="">—</option>${S.members.map(m => `<option value="${esc(mKey(m))}" ${same(x.assigned_intake, mKey(m)) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>🎨 مسؤول التصميم والمونتاج</label>
        <select class="sel" id="pub_m_des"><option value="">—</option>${S.members.map(m => `<option value="${esc(mKey(m))}" ${same(x.assigned_design, mKey(m)) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>🚀 مسؤول النشر والمتابعة</label>
        <select class="sel" id="pub_m_pub"><option value="">—</option>${S.members.map(m => `<option value="${esc(mKey(m))}" ${same(x.assigned_pub, mKey(m)) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>🔗 رابط مرجعي</label>
        <input class="in" id="pub_ref" value="${esc(x.reference_url || '')}" placeholder="https://...">
      </div>

      <!-- 1. خانات مرحلة الاستلام -->
      <div class="field full" style="background:var(--bg);padding:10px;border-radius:10px;border:1px solid var(--line)">
        <div class="row spread" style="margin-bottom:6px">
          <b>📥 1. بيانات مرحلة الاستلام والفكرة الأساسية</b>
          <button type="button" class="btn sm ghost" id="pub_copy_in_to_des">⬇️ نسخ تلقائي لخانات التصميم والنشر</button>
        </div>
        <div class="fgrid">
          <div class="field full">
            <label>ملخص المحتوى المستلم / الفكرة المطلوبة</label>
            <textarea class="ta" id="pub_in_brief" placeholder="اكتب تفاصيل المحتوى المستلم من العميل أو الفريق...">${esc(x.intake_brief || '')}</textarea>
          </div>
          <div class="field full">
            <label>ملاحظات وتوجيهات الاستلام</label>
            <input class="in" id="pub_in_notes" value="${esc(x.intake_notes || '')}" placeholder="توجيهات خاصة، ألوان، شعار...">
          </div>
        </div>
      </div>

      <!-- 2. خانات مرحلة التصميم (تُعبأ تلقائياً من الاستلام) -->
      <div class="field full" style="background:var(--bg);padding:10px;border-radius:10px;border:1px solid var(--line)">
        <div class="row spread" style="margin-bottom:6px">
          <b>🎨 2. بيانات مرحلة التصميم والمونتاج (تُعبأ تلقائياً وقابلة للتعديل)</b>
        </div>
        <div class="fgrid">
          <div class="field full">
            <label>النص المكتوب داخل التصميم / الفيديو (Headline)</label>
            <textarea class="ta" id="pub_des_head" placeholder="النص الذي يظهر على التصميم أو الفيديو...">${esc(x.design_headline || x.intake_brief || '')}</textarea>
          </div>
          <div class="field">
            <label>رابط التصميم النهائي / صورة أو فيديو</label>
            <input class="in" id="pub_media" value="${esc(x.media_url || '')}" placeholder="رابط Google Drive أو صورة مباشرة...">
          </div>
          <div class="field">
            <label>ملاحظات المصمم</label>
            <input class="in" id="pub_des_notes" value="${esc(x.design_notes || x.intake_notes || '')}" placeholder="تم تجهيز المقاسات...">
          </div>
        </div>
      </div>

      <!-- 3. خانات النشر النهائي -->
      <div class="field full" style="background:var(--bg);padding:10px;border-radius:10px;border:1px solid var(--line)">
        <b>🚀 3. النص النهائي للنشر (Caption & Hashtags)</b>
        <div class="fgrid" style="margin-top:6px">
          <div class="field full">
            <label>نص المنشور (Caption)</label>
            <textarea class="ta" id="pub_cap" placeholder="النص الذي سيُنشر مع التصميم...">${esc(x.caption || x.intake_brief || '')}</textarea>
          </div>
          <div class="field full">
            <label>الهاشتاقات (#)</label>
            <input class="in" id="pub_tags" value="${esc(x.hashtags || '')}" placeholder="#تصميم #تسويق #عروض">
          </div>
        </div>
      </div>

      <!-- 4. السجل التاريخي للمراحل -->
      <div class="field full">
        <label>🕓 السجل التاريخي للمراحل والتعديلات (${history.length})</label>
        <div class="pub-history-box">
          ${
            history.length
              ? history
                  .slice()
                  .reverse()
                  .map(
                    (h, idx) => `<div class="pub-hist-row">
                  <div class="row spread">
                    <b>${esc(pubStageInfo(h.from_stage)[1])} ⬅️ ${esc(pubStageInfo(h.to_stage)[1])}</b>
                    <span class="muted">${esc(h.at_formatted || '')} · بواسطة ${esc(mName(h.by) || 'النظام')}</span>
                  </div>
                  <div class="pub-hist-snap">
                    ${h.snapshot?.intake_brief ? `<div><b>الاستلام:</b> ${esc(h.snapshot.intake_brief)}</div>` : ''}
                    ${h.snapshot?.design_headline ? `<div><b>نص التصميم:</b> ${esc(h.snapshot.design_headline)}</div>` : ''}
                    ${h.snapshot?.caption ? `<div><b>الكابشن:</b> ${esc(h.snapshot.caption)}</div>` : ''}
                  </div>
                </div>`
                  )
                  .join('')
              : '<div class="muted" style="padding:8px">سيتم تسجيل كل انتقال بين المراحل مع نسخة من البيانات السابقة هنا تلقائياً.</div>'
          }
        </div>
      </div>
    </div>

    <div class="factions">
      ${!isNew ? '<button class="btn danger" id="pub_del">حذف</button>' : ''}
      ${!isNew ? '<button class="btn" id="pub_open_share">📤 مشاركة / نشر مباشر</button>' : ''}
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn primary" id="pub_save">💾 حفظ المنشور</button>
    </div>`);

  // عند تغيير المرحلة من القائمة المنسدلة إلى التصميم أو النشر، نملأ الخانات الفارغة تلقائياً
  $('pub_st').onchange = () => {
    const inBrief = $('pub_in_brief').value.trim();
    const inNotes = $('pub_in_notes').value.trim();
    if (!$('pub_des_head').value.trim() && inBrief) $('pub_des_head').value = inBrief;
    if (!$('pub_des_notes').value.trim() && inNotes) $('pub_des_notes').value = inNotes;
    if (!$('pub_cap').value.trim() && inBrief) $('pub_cap').value = inBrief;
  };

  if ($('pub_copy_in_to_des')) {
    $('pub_copy_in_to_des').onclick = () => {
      const inBrief = $('pub_in_brief').value.trim();
      const inNotes = $('pub_in_notes').value.trim();
      if (inBrief) {
        $('pub_des_head').value = inBrief;
        if (!$('pub_cap').value.trim()) $('pub_cap').value = inBrief;
      }
      if (inNotes) $('pub_des_notes').value = inNotes;
      toast('تمت التعبئة التلقائية من خانات الاستلام');
    };
  }

  if ($('pub_open_share')) {
    $('pub_open_share').onclick = () => {
      closeModal();
      shareOrPublishDialog(x.id);
    };
  }

  $('pub_save').onclick = async () => {
    const title = $('pub_ti').value.trim();
    if (!title) return toast('اكتب عنوان المنشور', false);
    const newStage = $('pub_st').value;
    const prevStage = x._prevStage || x.stage || 'intake';
    const nextHistory = [...history];

    if (isNew) {
      nextHistory.push({
        from_stage: 'intake',
        to_stage: newStage,
        by: meKey(),
        at: new Date().toISOString(),
        at_formatted: new Date().toLocaleString('ar-SA'),
        snapshot: {
          intake_brief: $('pub_in_brief').value.trim(),
          design_headline: $('pub_des_head').value.trim(),
          caption: $('pub_cap').value.trim(),
        },
      });
    } else if (newStage !== prevStage || isStageTransition) {
      nextHistory.push({
        from_stage: prevStage,
        to_stage: newStage,
        by: meKey(),
        at: new Date().toISOString(),
        at_formatted: new Date().toLocaleString('ar-SA'),
        snapshot: {
          intake_brief: x.intake_brief || $('pub_in_brief').value.trim(),
          design_headline: x.design_headline || $('pub_des_head').value.trim(),
          caption: x.caption || $('pub_cap').value.trim(),
          media_url: x.media_url || $('pub_media').value.trim(),
        },
      });
    }

    const savedObj = {
      id: x.id || 'pub_' + Date.now(),
      title,
      stage: newStage,
      platform: $('pub_pl').value,
      publish_date: $('pub_dt').value || null,
      target_audience: $('pub_aud').value.trim(),
      assigned_intake: $('pub_m_in').value || '',
      assigned_design: $('pub_m_des').value || '',
      assigned_pub: $('pub_m_pub').value || '',
      reference_url: $('pub_ref').value.trim(),
      intake_brief: $('pub_in_brief').value.trim(),
      intake_notes: $('pub_in_notes').value.trim(),
      design_headline: $('pub_des_head').value.trim() || $('pub_in_brief').value.trim(),
      design_notes: $('pub_des_notes').value.trim(),
      media_url: $('pub_media').value.trim(),
      caption: $('pub_cap').value.trim() || $('pub_in_brief').value.trim(),
      hashtags: $('pub_tags').value.trim(),
      stage_history: nextHistory,
      updated_at: new Date().toISOString(),
    };

    await saveHiddenJsonItem('__pub:', savedObj);
    logAct(isNew ? 'إضافة منشور' : 'تحديث مرحلة منشور', `${title} (${pubStageInfo(newStage)[1]})`);
    closeModal();
    toast('تم حفظ المنشور وتحديث سجل المراحل');
    render();
  };

  if (!isNew && $('pub_del')) {
    $('pub_del').onclick = async () => {
      if (!(await ask('حذف هذا المنشور من جدول النشر؟'))) return;
      await deleteHiddenJsonItem('__pub:', x.id);
      closeModal();
      toast('تم حذف المنشور');
      render();
    };
  }
}

/* =========================================================================
   4. المشاركة الفورية والنشر المباشر لمنصات التواصل الاجتماعي
   ========================================================================= */
function getSocialApiConfig() {
  const list = readHiddenJsonList('__socfg:');
  return list[0] || { id: 'main_social_cfg', fb_page_id: '', fb_token: '', tg_bot_token: '', tg_chat_id: '', webhook_url: '' };
}

function socialConfigDialog() {
  const cfg = getSocialApiConfig();
  modal(`<h3>🔗 إعدادات الربط المباشر بمنصات التواصل الاجتماعي</h3>
    <div class="View-sub" style="margin-bottom:12px">يمكنك استخدام أزرار المشاركة الفورية مجاناً بدون أي إعدادات، أو إدخال مفاتيح الربط أدناه للنشر التلقائي المباشر بضغطة زر واحدة من داخل النظام.</div>
    <div class="fgrid">
      <div class="field"><label>📘 معرف صفحة فيسبوك (Facebook Page ID)</label><input class="in" id="sc_fb_id" value="${esc(cfg.fb_page_id || '')}" placeholder="مثال: 10492819283"></div>
      <div class="field"><label>🔑 رمز وصول صفحة فيسبوك (Page Access Token)</label><input class="in" type="password" id="sc_fb_tok" value="${esc(cfg.fb_token || '')}" placeholder="EAAB..."></div>
      <div class="field"><label>✈️ رمز بوت تيليجرام (Telegram Bot Token)</label><input class="in" type="password" id="sc_tg_tok" value="${esc(cfg.tg_bot_token || '')}" placeholder="123456:ABC-DEF..."></div>
      <div class="field"><label>📢 معرف قناة/مجموعة تيليجرام (Chat ID)</label><input class="in" id="sc_tg_chat" value="${esc(cfg.tg_chat_id || '')}" placeholder="@my_channel أو -100123456"></div>
      <div class="field full"><label>⚡ رابط Webhook للأتمتة (Make / Zapier للنشر المتزامن على انستقرام وباقي المنصات)</label><input class="in" id="sc_wh" value="${esc(cfg.webhook_url || '')}" placeholder="https://hook.eu1.make.com/..."></div>
    </div>
    <div class="factions">
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn primary" id="sc_save">حفظ إعدادات الربط</button>
    </div>`);

  $('sc_save').onclick = async () => {
    await saveHiddenJsonItem('__socfg:', {
      id: 'main_social_cfg',
      fb_page_id: $('sc_fb_id').value.trim(),
      fb_token: $('sc_fb_tok').value.trim(),
      tg_bot_token: $('sc_tg_tok').value.trim(),
      tg_chat_id: $('sc_tg_chat').value.trim(),
      webhook_url: $('sc_wh').value.trim(),
    });
    closeModal();
    toast('تم حفظ إعدادات الربط بالمنصات');
  };
}

function shareOrPublishDialog(pubId) {
  const item = S.pubItems.find(x => x.id === pubId);
  if (!item) return;
  const fullText = [item.title, item.caption || item.design_headline || item.intake_brief, item.hashtags].filter(Boolean).join('\n\n');
  const shareUrl = item.media_url || item.reference_url || window.location.href;
  const encodedText = encodeURIComponent(fullText);
  const encodedUrl = encodeURIComponent(shareUrl);

  modal(`<h3>📤 مشاركة ونشر: ${esc(item.title)}</h3>
    <div class="field">
      <label>النص الجاهز للنشر (يمكنك تعديله قبل الإرسال)</label>
      <textarea class="ta" id="sh_text" style="min-height:110px">${esc(fullText)}</textarea>
    </div>
    <div class="row" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn primary" id="sh_native">📲 مشاركة عبر الجوال / النظام (Web Share)</button>
      <button class="btn" id="sh_copy">📋 نسخ النص والهاشتاقات</button>
      <button class="btn ok" id="sh_mark_pub">✅ تعليم كـ "تم النشر"</button>
    </div>

    <div class="field">
      <label>🌐 مشاركة سريعة إلى المنصات</label>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}" target="_blank" rel="noopener">📘 مشاركة فيسبوك</a>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(fullText + (item.media_url ? '\n' + item.media_url : ''))}" target="_blank" rel="noopener">💬 إرسال واتساب</a>
        <a class="btn" href="https://t.me/share/url?url=${encodedUrl}&text=${encodedText}" target="_blank" rel="noopener">✈️ مشاركة تيليجرام</a>
        <a class="btn" href="https://twitter.com/intent/tweet?text=${encodedText}" target="_blank" rel="noopener">🐦 منصة X</a>
        <button class="btn" id="sh_insta">📸 نسخ وفتح انستقرام</button>
      </div>
    </div>

    <div class="field" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)">
      <label>⚡ نشر تلقائي مباشر عبر الـ API (بدون مغادرة النظام)</label>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="sh_api_fb">📘 نشر مباشر في صفحة فيسبوك</button>
        <button class="btn info" id="sh_api_tg">✈️ نشر مباشر في قناة تيليجرام</button>
        <button class="btn" id="sh_api_wh">⚡ إرسال لـ Webhook الأتمتة</button>
      </div>
    </div>`);

  $('sh_copy').onclick = async () => {
    await navigator.clipboard?.writeText($('sh_text').value);
    toast('تم نسخ نص المنشور والهاشتاقات 📋');
  };

  $('sh_insta').onclick = async () => {
    await navigator.clipboard?.writeText($('sh_text').value);
    toast('تم نسخ الكابشن! سيتم فتح انستقرام للصق والنشر');
    window.open('https://www.instagram.com/', '_blank', 'noopener');
  };

  $('sh_native').onclick = async () => {
    const txt = $('sh_text').value;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text: txt, url: item.media_url || undefined });
        toast('تمت المشاركة بنجاح');
      } catch {}
    } else {
      await navigator.clipboard?.writeText(txt);
      toast('تم نسخ النص للحافظة (المشاركة المدمجة تعمل على الجوال والمتصفحات الداعمة)');
    }
  };

  $('sh_mark_pub').onclick = async () => {
    const hist = Array.isArray(item.stage_history) ? [...item.stage_history] : [];
    hist.push({
      from_stage: item.stage,
      to_stage: 'published',
      by: S.me || '',
      at: new Date().toISOString(),
      at_formatted: new Date().toLocaleString('ar-SA'),
      snapshot: { caption: $('sh_text').value },
    });
    await saveHiddenJsonItem('__pub:', { ...item, stage: 'published', stage_history: hist });
    closeModal();
    toast('تم تحديث الحالة إلى: تم النشر ✅');
    render();
  };

  $('sh_api_fb').onclick = async () => {
    const cfg = getSocialApiConfig();
    if (!cfg.fb_page_id || !cfg.fb_token) {
      closeModal();
      socialConfigDialog();
      return toast('أدخل معرف صفحة فيسبوك ورمز الوصول أولاً للنشر المباشر', false);
    }
    try {
      const msg = $('sh_text').value;
      const endpoint = item.media_url
        ? `https://graph.facebook.com/v19.0/${encodeURIComponent(cfg.fb_page_id)}/photos`
        : `https://graph.facebook.com/v19.0/${encodeURIComponent(cfg.fb_page_id)}/feed`;
      const body = item.media_url
        ? { url: item.media_url, caption: msg, access_token: cfg.fb_token }
        : { message: msg, access_token: cfg.fb_token };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      toast('تم النشر على صفحة فيسبوك بنجاح 🎉');
      $('sh_mark_pub').click();
    } catch (err) {
      toast('تعذر النشر المباشر على فيسبوك: ' + (err.message || ''), false);
    }
  };

  $('sh_api_tg').onclick = async () => {
    const cfg = getSocialApiConfig();
    if (!cfg.tg_bot_token || !cfg.tg_chat_id) {
      closeModal();
      socialConfigDialog();
      return toast('أدخل بيانات بوت تيليجرام أولاً للنشر المباشر', false);
    }
    try {
      const msg = $('sh_text').value;
      const res = await fetch(`https://api.telegram.org/bot${cfg.tg_bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.tg_chat_id, text: msg + (item.media_url ? '\n' + item.media_url : '') }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || 'خطأ في تيليجرام');
      toast('تم النشر في قناة تيليجرام بنجاح ✈️');
      $('sh_mark_pub').click();
    } catch (err) {
      toast('تعذر النشر في تيليجرام: ' + (err.message || ''), false);
    }
  };

  $('sh_api_wh').onclick = async () => {
    const cfg = getSocialApiConfig();
    if (!cfg.webhook_url) {
      closeModal();
      socialConfigDialog();
      return toast('أضف رابط Webhook أولاً', false);
    }
    try {
      await fetch(cfg.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, final_text: $('sh_text').value }),
      });
      toast('تم إرسال المنشور إلى Webhook الأتمتة بنجاح ⚡');
    } catch (err) {
      toast('تعذر الاتصال بالـ Webhook', false);
    }
  };
}

/* =========================================================================
   5. تبويب مكتبة المعرفة والبرومبتات (Knowledge & Prompts Library)
   ========================================================================= */
const KB_CATS = [
  ['prompt', '🤖 برومبتات الذكاء الاصطناعي', 'p-cat'],
  ['sop', '📋 أدلة وإجراءات العمل (SOP)', 'p-prog'],
  ['template', '💬 قوالب ردود جاهزة للعملاء', 'p-ok'],
  ['design_ref', '🎨 مصادر وملفات تصميم ومونتاج', 'p-wait'],
  ['tip', '💡 معلومات وخبرات عامة للفريق', 'p-cat'],
];

function kbCatInfo(cat) {
  return KB_CATS.find(x => x[0] === cat) || KB_CATS[0];
}

function extractPromptVariables(text) {
  if (!text) return [];
  const matches = [...text.matchAll(/\[([^\[\]]{1,40})\]/g)].map(m => m[1].trim());
  return [...new Set(matches)];
}

function kbView() {
  syncPubAndKbArrays();
  const items = Array.isArray(S.kbItems) ? S.kbItems : [];
  const kf = S.kbFilter || (S.kbFilter = { cat: 'all', author: 'all', tag: 'all', q: '', pinnedOnly: false, sort: 'pinned' });

  const allTags = [...new Set(items.flatMap(x => (Array.isArray(x.tags) ? x.tags : [])))].filter(Boolean);

  let rows = [...items];
  if (kf.cat !== 'all') rows = rows.filter(x => x.category === kf.cat);
  if (kf.author !== 'all') rows = rows.filter(x => x.author_id === kf.author);
  if (kf.tag !== 'all') rows = rows.filter(x => Array.isArray(x.tags) && x.tags.includes(kf.tag));
  if (kf.pinnedOnly) rows = rows.filter(x => x.pinned);
  if (kf.q) {
    const q = kf.q.trim().toLowerCase();
    rows = rows.filter(x =>
      `${x.title || ''} ${x.summary || ''} ${x.content || ''} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    if (kf.sort === 'pinned' && Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  const countCat = c => items.filter(x => x.category === c).length;

  return `<div class="toolbar">
    <div>
      <div class="View-title">📚 مكتبة المعرفة والبرومبتات الذكية</div>
      <div class="View-sub">شارك خبراتك، أدلة العمل، قوالب الردود، وبرومبتات الذكاء الاصطناعي الجاهزة مع الفريق</div>
    </div>
    <div class="row">
      <button class="btn ${kf.pinnedOnly ? 'ok' : ''}" id="kb_pin_flt">📌 المثبتة فقط</button>
      <button class="btn primary" id="kb_new">+ إضافة معلومة أو برومبت</button>
    </div>
  </div>

  <!-- شريط تصنيفات مكتبة المعرفة -->
  <div class="kpi-strip">
    <button class="kbox ${kf.cat === 'all' ? 'on' : ''}" data-kbcat="all"><b>${items.length}</b><span>كل المحتوى</span></button>
    <button class="kbox info ${kf.cat === 'prompt' ? 'on' : ''}" data-kbcat="prompt"><b>${countCat('prompt')}</b><span>🤖 برومبتات AI</span></button>
    <button class="kbox ok ${kf.cat === 'sop' ? 'on' : ''}" data-kbcat="sop"><b>${countCat('sop')}</b><span>📋 أدلة العمل</span></button>
    <button class="kbox warn ${kf.cat === 'template' ? 'on' : ''}" data-kbcat="template"><b>${countCat('template')}</b><span>💬 قوالب الردود</span></button>
    <button class="kbox ${kf.cat === 'design_ref' ? 'on' : ''}" data-kbcat="design_ref"><b>${countCat('design_ref')}</b><span>🎨 مصادر التصميم</span></button>
    <button class="kbox ${kf.cat === 'tip' ? 'on' : ''}" data-kbcat="tip"><b>${countCat('tip')}</b><span>💡 معلومات عامة</span></button>
  </div>

  <!-- شريط الفلترة المتقدمة لمكتبة المعرفة -->
  <div class="adv-filter-bar" style="margin-bottom:14px">
    <div class="adv-filter-grid">
      <input class="in" id="kbf_q" placeholder="🔍 ابحث في العنوان، نص البرومبت، الوسوم، أو الشرح..." value="${esc(kf.q || '')}">
      <select class="sel" id="kbf_tag">
        <option value="all">🏷️ كل الوسوم (${allTags.length})</option>
        ${allTags.map(t => `<option value="${esc(t)}" ${kf.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
      </select>
      <select class="sel" id="kbf_auth">
        <option value="all">👤 كل الكتّاب</option>
        ${S.members.map(m => `<option value="${m.id}" ${kf.author === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
      <select class="sel" id="kbf_sort">
        <option value="pinned" ${kf.sort === 'pinned' ? 'selected' : ''}>📌 المثبتة ثم الأحدث</option>
        <option value="newest" ${kf.sort === 'newest' ? 'selected' : ''}>🆕 الأحدث أولاً</option>
      </select>
      <button class="btn sm ghost" id="kbf_reset">إعادة ضبط</button>
    </div>
  </div>

  ${
    rows.length
      ? `<div class="kb-grid">${rows.map(kbCardHtml).join('')}</div>`
      : '<div class="empty">لا توجد نتائج مطابقة للبحث في مكتبة المعرفة</div>'
  }`;
}

function kbCardHtml(item) {
  const cat = kbCatInfo(item.category);
  const vars = extractPromptVariables(item.content);
  const tags = Array.isArray(item.tags) ? item.tags : [];

  return `<div class="kb-card ${item.pinned ? 'pinned' : ''}" data-kbid="${item.id}">
    <div class="row spread" style="gap:6px;flex-wrap:wrap">
      <span class="pill ${cat[2]}">${cat[1]}</span>
      <div class="row" style="gap:4px">
        <button class="btn sm ghost" data-kbpin="${item.id}" title="تثبيت في الأعلى">${item.pinned ? '📌 مثبت' : '📍 تثبيت'}</button>
        <button class="btn sm ghost" data-kbedit="${item.id}">✏️ تعديل</button>
      </div>
    </div>
    <div class="kb-card-title">${esc(item.title)}</div>
    ${item.summary ? `<div class="kb-card-sum">${esc(item.summary)}</div>` : ''}
    <div class="kb-prompt-box">${esc(item.content || '')}</div>
    ${
      vars.length
        ? `<div class="kb-vars-hint">✨ يحتوي على متغيرات ذكية قابلة للتعبئة: ${vars.map(v => `<span class="kb-var-pill">[${esc(v)}]</span>`).join(' ')}</div>`
        : ''
    }
    ${
      tags.length
        ? `<div class="kb-tags">${tags.map(t => `<button class="kb-tag" data-kbtag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>`
        : ''
    }
    <div class="row spread" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);flex-wrap:wrap;gap:6px">
      <span class="muted" style="font-size:12px">✍️ ${esc(mName(item.author_id) || 'مشاركة عامة')} ${item.reference_url ? `· <a class="plink" href="${esc(item.reference_url)}" target="_blank" rel="noopener">🔗 رابط</a>` : ''}</span>
      <div class="row" style="gap:6px">
        ${vars.length ? `<button class="btn sm info" data-kbuse="${item.id}">🪄 تعبئة المتغيرات والنسخ</button>` : ''}
        <button class="btn sm primary" data-kbcopy="${item.id}">📋 نسخ النص</button>
      </div>
    </div>
  </div>`;
}

function bindKb() {
  if ($('kb_new')) $('kb_new').onclick = () => kbDialog();
  const kf = S.kbFilter || (S.kbFilter = { cat: 'all', author: 'all', tag: 'all', q: '', pinnedOnly: false, sort: 'pinned' });

  if ($('kb_pin_flt')) {
    $('kb_pin_flt').onclick = () => {
      kf.pinnedOnly = !kf.pinnedOnly;
      render();
    };
  }
  document.querySelectorAll('[data-kbcat]').forEach(b => {
    b.onclick = () => {
      kf.cat = b.dataset.kbcat;
      render();
    };
  });
  document.querySelectorAll('[data-kbtag]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      kf.tag = b.dataset.kbtag;
      render();
    };
  });
  if ($('kbf_q')) {
    $('kbf_q').oninput = e => {
      kf.q = e.target.value;
      render();
      const el = $('kbf_q');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    };
  }
  if ($('kbf_tag')) $('kbf_tag').onchange = e => { kf.tag = e.target.value; render(); };
  if ($('kbf_auth')) $('kbf_auth').onchange = e => { kf.author = e.target.value; render(); };
  if ($('kbf_sort')) $('kbf_sort').onchange = e => { kf.sort = e.target.value; render(); };
  if ($('kbf_reset')) {
    $('kbf_reset').onclick = () => {
      S.kbFilter = { cat: 'all', author: 'all', tag: 'all', q: '', pinnedOnly: false, sort: 'pinned' };
      render();
    };
  }

  document.querySelectorAll('[data-kbcopy]').forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const item = S.kbItems.find(x => x.id === b.dataset.kbcopy);
      if (!item) return;
      await navigator.clipboard?.writeText(item.content || '');
      toast('تم نسخ النص / البرومبت إلى الحافظة 📋');
    };
  });

  document.querySelectorAll('[data-kbuse]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      kbUsePromptDialog(b.dataset.kbuse);
    };
  });

  document.querySelectorAll('[data-kbpin]').forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const item = S.kbItems.find(x => x.id === b.dataset.kbpin);
      if (!item) return;
      await saveHiddenJsonItem('__kb:', { ...item, pinned: !item.pinned });
      render();
    };
  });

  document.querySelectorAll('[data-kbedit]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const item = S.kbItems.find(x => x.id === b.dataset.kbedit);
      if (item) kbDialog(item);
    };
  });
}

function kbUsePromptDialog(id) {
  const item = S.kbItems.find(x => x.id === id);
  if (!item) return;
  const vars = extractPromptVariables(item.content);
  modal(`<h3>🪄 تخصيص ونسخ البرومبت: ${esc(item.title)}</h3>
    <div class="View-sub" style="margin-bottom:12px">املأ الخانات التالية ليتم استبدالها تلقائياً داخل البرومبت:</div>
    <div class="fgrid">
      ${vars
        .map(
          (v, idx) => `<div class="field"><label>[${esc(v)}]</label><input class="in kb-var-in" data-var="${esc(v)}" id="kbv_${idx}" placeholder="اكتب ${esc(v)}..."></div>`
        )
        .join('')}
      <div class="field full">
        <label>النص النهائي الجاهز للنسخ</label>
        <textarea class="ta" id="kb_final_preview" style="min-height:130px">${esc(item.content)}</textarea>
      </div>
    </div>
    <div class="factions">
      <button class="btn ghost" onclick="closeModal()">إغلاق</button>
      <button class="btn primary" id="kb_copy_final">📋 نسخ النص النهائي</button>
    </div>`);

  const updatePreview = () => {
    let out = item.content || '';
    document.querySelectorAll('.kb-var-in').forEach(inp => {
      const k = inp.dataset.var;
      const val = inp.value.trim();
      if (val) {
        out = out.split(`[${k}]`).join(val);
      }
    });
    $('kb_final_preview').value = out;
  };
  document.querySelectorAll('.kb-var-in').forEach(inp => (inp.oninput = updatePreview));

  $('kb_copy_final').onclick = async () => {
    await navigator.clipboard?.writeText($('kb_final_preview').value);
    toast('تم نسخ البرومبت المخصص بنجاح 📋');
    closeModal();
  };
}

function kbDialog(item) {
  const isNew = !item?.id;
  const x = item || {
    title: '',
    category: 'prompt',
    tags: [],
    summary: '',
    content: '',
    reference_url: '',
    author_id: S.me || '',
    pinned: false,
  };

  modal(`<h3>${isNew ? 'إضافة معلومة أو برومبت لمكتبة المعرفة' : 'تعديل المحتوى في مكتبة المعرفة'}</h3>
    <div class="fgrid">
      <div class="field full"><label>العنوان *</label><input class="in" id="kb_ti" value="${esc(x.title || '')}" placeholder="مثال: برومبت كتابة سيناريو إعلاني أو طريقة تسليم الملفات"></div>
      <div class="field">
        <label>التصنيف</label>
        <select class="sel" id="kb_cat">
          ${KB_CATS.map(([k, l]) => `<option value="${k}" ${x.category === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>الكاتب / المشارك</label>
        <select class="sel" id="kb_auth"><option value="">—</option>${S.members.map(m => `<option value="${esc(mKey(m))}" ${same(x.author_id, mKey(m)) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      <div class="field full">
        <label>وصف مختصر (متى نستخدم هذه المعلومة أو البرومبت؟)</label>
        <input class="in" id="kb_sum" value="${esc(x.summary || '')}" placeholder="شرح مختصر في سطر واحد">
      </div>
      <div class="field full">
        <label>النص الكامل / البرومبت * <span class="muted">(نصيحة: ضع أي متغير بين قوسين مثل [اسم المنتج] ليتمكن الزملاء من تعبئته تلقائياً)</span></label>
        <textarea class="ta" id="kb_cont" style="min-height:140px" placeholder="اكتب البرومبت أو المعلومة بالتفصيل...">${esc(x.content || '')}</textarea>
      </div>
      <div class="field">
        <label>الوسوم (افصل بينها بفاصلة ،)</label>
        <input class="in" id="kb_tags" value="${esc((x.tags || []).join('، '))}" placeholder="مبيعات، ريلز، شات جي بي تي، تصميم">
      </div>
      <div class="field">
        <label>رابط مرجعي أو أداة مرتبطة (اختياري)</label>
        <input class="in" id="kb_url" value="${esc(x.reference_url || '')}" placeholder="https://...">
      </div>
      <div class="field full">
        <label class="row" style="gap:8px;cursor:pointer">
          <input type="checkbox" id="kb_pin" ${x.pinned ? 'checked' : ''}>
          <span>📌 تثبيت هذه المعلومة في أعلى مكتبة المعرفة</span>
        </label>
      </div>
    </div>
    <div class="factions">
      ${!isNew ? '<button class="btn danger" id="kb_del">حذف</button>' : ''}
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn primary" id="kb_save">حفظ في المكتبة</button>
    </div>`);

  $('kb_save').onclick = async () => {
    const title = $('kb_ti').value.trim();
    const content = $('kb_cont').value.trim();
    if (!title || !content) return toast('اكتب العنوان والمحتوى أولاً', false);
    const tags = $('kb_tags')
      .value.split(/[,،]/)
      .map(s => s.trim().replace(/^#/, ''))
      .filter(Boolean);

    const obj = {
      id: x.id || 'kb_' + Date.now(),
      title,
      category: $('kb_cat').value,
      author_id: $('kb_auth').value || meKey(),
      summary: $('kb_sum').value.trim(),
      content,
      tags,
      reference_url: $('kb_url').value.trim(),
      pinned: $('kb_pin').checked,
      created_at: x.created_at || new Date().toISOString(),
    };

    // إذا كانت البذور الافتراضية لم تُحفظ بعد في ord_settings، نحفظها مع الإضافة
    for (const seed of S.kbItems) {
      if (String(seed.id).startsWith('kb_seed_') && seed.id !== obj.id) {
        await saveHiddenJsonItem('__kb:', seed);
      }
    }
    await saveHiddenJsonItem('__kb:', obj);
    logAct(isNew ? 'إضافة لمكتبة المعرفة' : 'تعديل في مكتبة المعرفة', title);
    closeModal();
    toast('تم الحفظ في مكتبة المعرفة 📚');
    render();
  };

  if (!isNew && $('kb_del')) {
    $('kb_del').onclick = async () => {
      if (!(await ask('حذف هذا العنصر من مكتبة المعرفة؟'))) return;
      await deleteHiddenJsonItem('__kb:', x.id);
      S.kbItems = S.kbItems.filter(i => i.id !== x.id);
      closeModal();
      toast('تم الحذف');
      render();
    };
  }
}
