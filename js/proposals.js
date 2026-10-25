/* proposals.js — القرارات والتصويت الجماعي + مكتبة المعرفة والبرومبتات الذكية */

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
const fmtDate = d => String(d || '').slice(0, 10);
const ask = msg => Promise.resolve(confirm(msg));

/* =========================================================================
   1. تخزين مزدوج (محلي + سحابي) لمكتبة المعرفة والإعدادات المساعدة
   ========================================================================= */
function readHiddenJsonList(prefix) {
  const byId = new Map();
  // قراءة من الكاش المحلي المخصص أولاً لضمان عدم ضياع أي إضافة حتى لغير الأدمن أو أوفلاين
  try {
    const locMap = JSON.parse(localStorage.getItem('tt_hidden_json_v1') || '{}');
    const locArr = Array.isArray(locMap[prefix]) ? locMap[prefix] : [];
    locArr.forEach(item => { if (item && item.id) byId.set(item.id, item); });
  } catch (e) {}

  const arr = Array.isArray(S.ordSet?.hidden_views) ? S.ordSet.hidden_views : [];
  for (const item of arr) {
    if (typeof item === 'string' && item.startsWith(prefix)) {
      try {
        const parsed = JSON.parse(item.slice(prefix.length));
        if (parsed && parsed.id) byId.set(parsed.id, parsed);
      } catch (e) {}
    }
  }
  return [...byId.values()];
}

async function saveHiddenJsonItem(prefix, obj) {
  if (!obj.id) obj.id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  // 1) حفظ محلي فوري
  try {
    const locMap = JSON.parse(localStorage.getItem('tt_hidden_json_v1') || '{}');
    const list = Array.isArray(locMap[prefix]) ? locMap[prefix].filter(x => x && x.id !== obj.id) : [];
    list.push(obj);
    locMap[prefix] = list;
    localStorage.setItem('tt_hidden_json_v1', JSON.stringify(locMap));
  } catch (e) {}

  // 2) حفظ سحابي في ord_settings
  const cur = Array.isArray(S.ordSet?.hidden_views) ? [...S.ordSet.hidden_views] : [];
  const filtered = cur.filter(item => {
    if (typeof item !== 'string' || !item.startsWith(prefix)) return true;
    try {
      const p = JSON.parse(item.slice(prefix.length));
      return p.id !== obj.id;
    } catch (e) {
      return true;
    }
  });
  filtered.push(prefix + JSON.stringify(obj));
  if (S.ordSet) S.ordSet.hidden_views = filtered;
  syncPubAndKbArrays();
  if (typeof saveCache === 'function') saveCache();
  if (S.ordSet) {
    await sb.from('ord_settings').update({ hidden_views: filtered }).eq('id', true);
  }
  return obj;
}

async function deleteHiddenJsonItem(prefix, id) {
  try {
    const locMap = JSON.parse(localStorage.getItem('tt_hidden_json_v1') || '{}');
    if (Array.isArray(locMap[prefix])) {
      locMap[prefix] = locMap[prefix].filter(x => x && x.id !== id);
      localStorage.setItem('tt_hidden_json_v1', JSON.stringify(locMap));
    }
  } catch (e) {}

  const cur = Array.isArray(S.ordSet?.hidden_views) ? [...S.ordSet.hidden_views] : [];
  const filtered = cur.filter(item => {
    if (typeof item !== 'string' || !item.startsWith(prefix)) return true;
    try {
      const p = JSON.parse(item.slice(prefix.length));
      return p.id !== id;
    } catch (e) {
      return true;
    }
  });
  if (S.ordSet) S.ordSet.hidden_views = filtered;
  syncPubAndKbArrays();
  if (typeof saveCache === 'function') saveCache();
  if (S.ordSet) {
    await sb.from('ord_settings').update({ hidden_views: filtered }).eq('id', true);
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
      created_at: new Date().toISOString()
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
      created_at: new Date().toISOString()
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
      created_at: new Date().toISOString()
    }
  ];
}

function syncPubAndKbArrays() {
  const kbs = readHiddenJsonList('__kb:');
  if (kbs.length) {
    S.kbItems = kbs;
  } else if (!Array.isArray(S.kbItems) || !S.kbItems.length) {
    S.kbItems = getDefaultKbSeed();
  }
}

/* =========================================================================
   2. القرارات والتصويت الجماعي (متوافق 100% مع جداول proposals & votes)
   ========================================================================= */
function parseOptions(p) {
  let arr = ['موافق', 'معارض'];
  if (p && p.options) {
    if (Array.isArray(p.options)) arr = p.options;
    else {
      try {
        const j = JSON.parse(p.options);
        if (Array.isArray(j)) arr = j;
      } catch (e) {}
    }
  }
  let isMulti = false;
  if (arr[0] === '__MULTI__') {
    isMulti = true;
    arr = arr.slice(1);
  }
  return { opts: arr, isMulti };
}

function propCard(p) {
  const parsed = parseOptions(p);
  const opts = parsed.opts;
  const isMulti = parsed.isMulti;

  const vts = (S.votes || []).filter(x => x.proposal_id === p.id);
  const myVote = S.me ? vts.find(x => same(x.email || x.member_id, S.me.email)) : null;

  const optCounts = opts.map(() => 0);
  const optVoters = opts.map(() => []);

  vts.forEach(v => {
    const nStr = v.note || v.comment || '';
    let selections = [];
    if (v.option_idx === -1 && nStr.startsWith('MULTI:')) {
      const parts = nStr.substring(6).split('||');
      selections = parts[0].split(',').map(Number);
      v.actualNote = parts[1] || '';
    } else {
      const val = v.value != null ? v.value : v.vote;
      selections = [v.option_idx != null ? v.option_idx : (val === 1 ? 0 : 1)];
      v.actualNote = nStr;
    }
    selections.forEach(idx => {
      if (optCounts[idx] !== undefined) {
        optCounts[idx]++;
        optVoters[idx].push(v);
      }
    });
  });

  const totalVotes = vts.length;
  const authorEmail = p.author_email || p.proposed_by || '';
  const can = S.me && (same(authorEmail, S.me.email) || isAdmin());
  const open = !isClosed(p);

  const res = opts.map((opt, i) => {
    const count = optCounts[i];
    const w = totalVotes ? ((count / totalVotes) * 100).toFixed(0) : 0;
    let vlist = '';
    if (count > 0) {
      const items = optVoters[i].map(x => '<b>' + esc(nm(x.email || x.member_id)) + '</b>' + (x.actualNote ? ' <span style="color:var(--mute)">(' + esc(x.actualNote) + ')</span>' : '')).join('<br>');
      vlist = '<div class="voters-box">' + items + '</div>';
    }
    return '<div style="margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px"><span>' + esc(opt) + '</span><span>' + count + ' صوت (' + w + '%)</span></div>' +
      '<div class="tally"><i style="width:' + w + '%;background:var(--acc)"></i></div>' +
      vlist +
    '</div>';
  }).join('');

  let act = '';
  if (open) {
    let mySelections = [];
    let myNote = '';
    if (myVote) {
      const nStr = myVote.note || myVote.comment || '';
      if (myVote.option_idx === -1 && nStr.startsWith('MULTI:')) {
        const parts = nStr.substring(6).split('||');
        mySelections = parts[0].split(',').map(Number);
        myNote = parts[1] || '';
      } else {
        const val = myVote.value != null ? myVote.value : myVote.vote;
        mySelections = [myVote.option_idx != null ? myVote.option_idx : (val === 1 ? 0 : 1)];
        myNote = nStr;
      }
    }
    let inputUI = '';
    if (isMulti) {
      inputUI = '<div class="multi-options" id="v_m_' + p.id + '">' + opts.map((o, i) =>
        '<label><input type="checkbox" value="' + i + '" ' + (mySelections.includes(i) ? 'checked' : '') + '> ' + esc(o) + '</label>'
      ).join('') + '</div>';
    } else {
      inputUI = '<select id="v_s_' + p.id + '" style="width:100%;margin-bottom:8px"><option value="">-- اختر أحد الخيارات --</option>' +
        opts.map((o, i) => '<option value="' + i + '" ' + (mySelections.includes(i) ? 'selected' : '') + '>' + esc(o) + '</option>').join('') +
        '</select>';
    }
    const btnText = myVote ? 'تحديث التصويت' : 'إرسال التصويت';
    act = '<div style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--line);">' +
      '<h3 style="font-size:14px;margin:0 0 10px;color:var(--acc)">صوّت الآن:</h3>' +
      inputUI +
      '<input id="v_n_' + p.id + '" placeholder="اكتب ملاحظة ليروها الجميع (اختياري)..." value="' + esc(myNote) + '" style="width:100%;margin-top:8px">' +
      '<button class="p" data-cast="' + p.id + '" data-ismulti="' + isMulti + '" style="width:100%;margin-top:12px">' + btnText + '</button>' +
    '</div>';
  }

  const actionBtns = can ? (open ? '<button data-ps="' + p.id + '" data-to="accepted">اعتماد</button><button data-ps="' + p.id + '" data-to="rejected">رفض</button>' : '<button data-ps="' + p.id + '" data-to="open">إعادة فتح</button>') + '<button class="dng" data-pdel="' + p.id + '">حذف</button>' : '';
  const detHtml = p.details ? '<div class="det">' + esc(p.details) + '</div>' : '';

  return '<div class="card pr">' +
    '<div class="bar"><span class="ttl">' + esc(p.title) + '</span><span class="chip ' + (p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'late' : 'all') + '">' + esc(PST[p.status] || p.status) + '</span></div>' +
    detHtml +
    '<div class="m">بواسطة ' + esc(nm(authorEmail)) + ' · ' + esc((p.created_at || '').slice(0, 10)) + '</div>' +
    '<div style="margin-top:16px;background:var(--col);padding:16px;border-radius:12px">' + res + '</div>' +
    act +
    '<div class="pa">' +
      '<button data-totask="' + p.id + '">تحويل إلى مهمة</button>' +
      actionBtns +
    '</div>' +
  '</div>';
}

function propsView() {
  if (S.propsErr) return '<div class="card"><b style="color:var(--late)">عذراً، يوجد خطأ في الاتصال بجداول التصويت.</b></div>';
  const pf = S.propAdvFilter || (S.propAdvFilter = { q: '', by: '' });
  let list = (S.props || []).filter(p => S.pf === 'open' ? !isClosed(p) : isClosed(p));
  if (pf.q) {
    const q = pf.q.trim().toLowerCase();
    list = list.filter(p => (String(p.title || '') + ' ' + String(p.details || '')).toLowerCase().includes(q));
  }
  if (pf.by) {
    list = list.filter(p => same(p.author_email || p.proposed_by, pf.by));
  }
  const listHtml = list.length ? list.map(propCard).join('') : '<div class="card empty">لا توجد مقترحات في هذه القائمة.</div>';
  return '<div class="tools" style="flex-wrap:wrap;gap:8px">' +
    '<div class="seg"><button data-pf="open" class="' + (S.pf === 'open' ? 'on' : '') + '">قيد التصويت</button><button data-pf="closed" class="' + (S.pf === 'closed' ? 'on' : '') + '">المغلقة</button></div>' +
    '<input id="pf_q" type="search" placeholder="🔎 بحث في المقترحات…" value="' + esc(pf.q || '') + '" style="flex:1 1 180px">' +
    '<select id="pf_by" style="width:auto"><option value="">👤 كل الأعضاء</option>' + (S.members || []).map(m => '<option value="' + esc(m.email) + '"' + (same(pf.by, m.email) ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select>' +
    '<button class="p" id="np">➕ مقترح/تصويت جديد</button></div>' +
    listHtml;
}

function bindProps() {
  if (S.propsErr) return;
  const pf = S.propAdvFilter || (S.propAdvFilter = { q: '', by: '' });
  document.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { S.pf = b.dataset.pf; render(); });
  if ($('np')) $('np').onclick = propDialog;
  if ($('pf_q')) {
    $('pf_q').oninput = e => {
      pf.q = e.target.value;
      render();
      const el = $('pf_q');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
  }
  if ($('pf_by')) $('pf_by').onchange = e => { pf.by = e.target.value; render(); };

  document.querySelectorAll('[data-cast]').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.cast;
      const isMulti = btn.dataset.ismulti === 'true';
      let selectedIdx = -1;
      let finalNote = '';
      const userNote = $('v_n_' + pid).value.trim();

      if (isMulti) {
        const checks = document.querySelectorAll('#v_m_' + pid + ' input[type="checkbox"]:checked');
        if (checks.length === 0) return alert('الرجاء اختيار خيار واحد على الأقل.');
        const vals = Array.from(checks).map(c => c.value);
        selectedIdx = -1;
        finalNote = 'MULTI:' + vals.join(',') + '||' + userNote;
      } else {
        const sel = $('v_s_' + pid).value;
        if (sel === '') return alert('الرجاء اختيار خيار.');
        selectedIdx = parseInt(sel, 10);
        finalNote = userNote;
      }

      btn.textContent = 'جاري الإرسال...'; btn.disabled = true;
      const { error } = await sb.from('votes').upsert({ proposal_id: pid, email: S.me.email, option_idx: selectedIdx, value: (selectedIdx === 0 ? 1 : -1), note: finalNote || null });
      if (error) alert('خطأ: ' + error.message);
      load();
    };
  });

  document.querySelectorAll('[data-ps]').forEach(b => b.onclick = () => run(sb.from('proposals').update({ status: b.dataset.to }).eq('id', b.dataset.ps)));
  document.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { if (confirm('حذف نهائي للمقترح وأصواته؟')) run(sb.from('proposals').delete().eq('id', b.dataset.pdel)); });
  document.querySelectorAll('[data-totask]').forEach(b => b.onclick = () => { const p = S.props.find(x => x.id === b.dataset.totask); taskDialog(null, { title: p.title, notes: p.details || '', for_all: true }); });
}

function propDialog() {
  dlg.innerHTML = '<h2>طرح تصويت/مقترح جديد</h2>' +
  '<label>عنوان المقترح<input id="p_ti" placeholder="مثلاً: تغيير موعد الاجتماع"></label>' +
  '<label>التفاصيل والمبررات<textarea id="p_de" rows="2"></textarea></label>' +
  '<label>خيارات التصويت (اكتب كل خيار في سطر مستقل)<textarea id="p_op" rows="3" placeholder="الخيار الأول\nالخيار الثاني"></textarea></label>' +
  '<label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:12px"><input type="checkbox" id="p_multi" style="width:18px;height:18px;margin:0"> السماح باختيار أكثر من خيار</label>' +
  '<div class="row dact"><button id="p_cx" class="s">إلغاء</button><button class="p s" id="p_sv">نشر للتصويت</button></div>';

  $('p_cx').onclick = () => dlg.close();
  $('p_sv').onclick = async () => {
    const title = $('p_ti').value.trim(); if (!title) return $('p_ti').focus();
    let rawOpts = $('p_op').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (rawOpts.length === 0) rawOpts = ['موافق', 'غير موافق'];
    if ($('p_multi').checked) rawOpts.unshift('__MULTI__');
    $('p_sv').disabled = true; $('p_sv').textContent = '...';
    const { error } = await sb.from('proposals').insert({ title, details: $('p_de').value.trim() || null, author_email: S.me.email, status: 'open', options: JSON.stringify(rawOpts) });
    if (error) return alert('خطأ: ' + error.message);
    dlg.close(); load();
  };
  dlg.showModal(); $('p_ti').focus();
}

/* =========================================================================
   3. تبويب مكتبة المعرفة والبرومبتات (Knowledge Base & AI Prompts Library)
   ========================================================================= */
const KB_CATS = [
  ['prompt', '🤖 برومبتات الذكاء الاصطناعي (AI Prompts)', 'p-cat'],
  ['sop', '📋 أدلة وإجراءات العمل (SOP)', 'p-prog'],
  ['script', '💬 قوالب وسكريبتات الرد والمبيعات', 'p-ok'],
  ['design', '🎨 مصادر وأدوات التصميم والمونتاج', 'p-wait'],
  ['marketing', '📈 خطط وأساليب تسويقية', 'p-cat'],
  ['tip', '💡 معلومات وخبرات عامة للعمل', 'p-prog']
];

function kbCatInfo(cat) {
  return KB_CATS.find(x => x[0] === cat) || KB_CATS[5];
}

function kbView() {
  syncPubAndKbArrays();
  const items = Array.isArray(S.kbItems) ? S.kbItems : [];
  const kf = S.kbFilter || (S.kbFilter = { cat: 'all', author: 'all', tag: 'all', q: '', pinnedOnly: false, sort: 'pinned' });

  const allTags = [...new Set(items.flatMap(x => Array.isArray(x.tags) ? x.tags : []))].filter(Boolean);

  let filtered = [...items];
  if (kf.cat !== 'all') filtered = filtered.filter(x => x.category === kf.cat);
  if (kf.author !== 'all') filtered = filtered.filter(x => same(x.author_id, kf.author));
  if (kf.tag !== 'all') filtered = filtered.filter(x => Array.isArray(x.tags) && x.tags.includes(kf.tag));
  if (kf.pinnedOnly) filtered = filtered.filter(x => x.pinned);
  if (kf.q) {
    const q = kf.q.trim().toLowerCase();
    filtered = filtered.filter(x =>
      `${x.title || ''} ${x.summary || ''} ${x.content || ''} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => {
    if (kf.sort === 'pinned') {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
    }
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  const countCat = c => items.filter(x => x.category === c).length;

  return `<div class="toolbar">
    <div>
      <div class="View-title">📚 مكتبة المعرفة والبرومبتات الذكية</div>
      <div class="View-sub">شارك زملاءك البرومبتات المجربة، أدلة العمل، قوالب الردود، وأي معلومة مفيدة لتطوير العمل</div>
    </div>
    <div class="row">
      <button class="btn primary" id="kb_new">+ إضافة معلومة / برومبت</button>
    </div>
  </div>

  <div class="kpi-strip">
    <button class="kbox ${kf.cat === 'all' ? 'on' : ''}" data-kbcat="all"><b>${items.length}</b><span>كل المحتوى</span></button>
    <button class="kbox info ${kf.cat === 'prompt' ? 'on' : ''}" data-kbcat="prompt"><b>${countCat('prompt')}</b><span>🤖 برومبتات AI</span></button>
    <button class="kbox ok ${kf.cat === 'sop' ? 'on' : ''}" data-kbcat="sop"><b>${countCat('sop')}</b><span>📋 أدلة العمل</span></button>
    <button class="kbox warn ${kf.cat === 'script' ? 'on' : ''}" data-kbcat="script"><b>${countCat('script')}</b><span>💬 سكريبتات الرد</span></button>
    <button class="kbox ${kf.cat === 'design' ? 'on' : ''}" data-kbcat="design"><b>${countCat('design')}</b><span>🎨 مصادر التصميم</span></button>
    <button class="kbox ${kf.cat === 'tip' ? 'on' : ''}" data-kbcat="tip"><b>${countCat('tip') + countCat('marketing')}</b><span>💡 خبرات وتسويق</span></button>
  </div>

  <div class="adv-filter-bar" style="margin-bottom:14px">
    <div class="adv-filter-grid">
      <input class="in" id="kbf_q" placeholder="🔍 ابحث في العنوان، نص البرومبت، الوسوم، أو الشرح..." value="${esc(kf.q || '')}">
      <select class="sel" id="kbf_cat">
        <option value="all">📂 كل التصنيفات</option>
        ${KB_CATS.map(([k, l]) => `<option value="${k}" ${kf.cat === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select class="sel" id="kbf_tag">
        <option value="all">🏷️ كل الوسوم (Tags)</option>
        ${allTags.map(t => `<option value="${esc(t)}" ${kf.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
      </select>
      <select class="sel" id="kbf_author">
        <option value="all">👤 كل المساهمين</option>
        ${(S.members || []).map(m => `<option value="${esc(mKey(m))}" ${same(kf.author, mKey(m)) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
      <div class="row" style="gap:8px">
        <button class="btn sm ${kf.pinnedOnly ? 'primary' : 'ghost'}" id="kbf_pin">📌 المثبتة فقط</button>
        <button class="btn sm ghost" id="kbf_reset">إعادة ضبط</button>
      </div>
    </div>
  </div>

  ${
    filtered.length
      ? `<div class="kb-grid">${filtered.map(kbCardHtml).join('')}</div>`
      : '<div class="empty">لا توجد عناصر مطابقة للبحث في مكتبة المعرفة</div>'
  }`;
}

function kbCardHtml(item) {
  const cat = kbCatInfo(item.category);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const isPrompt = item.category === 'prompt' || item.category === 'script';

  return `<div class="kb-card ${item.pinned ? 'pinned' : ''}" data-kbid="${esc(item.id)}">
    <div class="row spread" style="gap:6px;flex-wrap:wrap">
      <span class="pill ${cat[2]}">${cat[1]}</span>
      <div class="row" style="gap:6px">
        ${item.pinned ? '<span class="pill p-wait" title="مثبت في الأعلى">📌 مثبت</span>' : ''}
      </div>
    </div>
    <div class="kb-card-title">${esc(item.title)}</div>
    ${item.summary ? `<div class="kb-card-sum">${esc(item.summary)}</div>` : ''}
    <div class="kb-prompt-box">
      <pre>${esc(item.content || '')}</pre>
    </div>
    ${
      tags.length
        ? `<div class="kb-tags">${tags.map(t => `<span class="kb-tag" data-kbtag="${esc(t)}">#${esc(t)}</span>`).join('')}</div>`
        : ''
    }
    <div class="row spread" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);flex-wrap:wrap;gap:6px" onclick="event.stopPropagation()">
      <div class="muted" style="font-size:12px">
        ${item.author_id ? `✍️ ${esc(mName(item.author_id))}` : '✍️ مكتبة الفريق'}
        ${item.created_at ? ` · ${fmtDate(item.created_at)}` : ''}
      </div>
      <div class="row" style="gap:6px">
        <button class="btn sm ok" data-kbcopy="${esc(item.id)}">📋 ${isPrompt ? 'نسخ البرومبت' : 'نسخ النص'}</button>
        ${item.reference_url ? `<a class="btn sm ghost" href="${esc(item.reference_url)}" target="_blank" rel="noopener">🔗 الرابط</a>` : ''}
        <button class="btn sm ghost" data-kbedit="${esc(item.id)}">✏️ تعديل</button>
      </div>
    </div>
  </div>`;
}

function bindKb() {
  if ($('kb_new')) $('kb_new').onclick = () => kbDialog();
  const kf = S.kbFilter || (S.kbFilter = { cat: 'all', author: 'all', tag: 'all', q: '', pinnedOnly: false, sort: 'pinned' });

  document.querySelectorAll('[data-kbcat]').forEach(b => {
    b.onclick = () => {
      kf.cat = b.dataset.kbcat;
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
  if ($('kbf_cat')) $('kbf_cat').onchange = e => { kf.cat = e.target.value; render(); };
  if ($('kbf_tag')) $('kbf_tag').onchange = e => { kf.tag = e.target.value; render(); };
  if ($('kbf_author')) $('kbf_author').onchange = e => { kf.author = e.target.value; render(); };
  if ($('kbf_pin')) {
    $('kbf_pin').onclick = () => {
      kf.pinnedOnly = !kf.pinnedOnly;
      render();
    };
  }
  if ($('kbf_reset')) {
    $('kbf_reset').onclick = () => {
      S.kbFilter = { cat: 'all', author: 'all', tag: 'all', q: '', pinnedOnly: false, sort: 'pinned' };
      render();
    };
  }

  document.querySelectorAll('[data-kbtag]').forEach(t => {
    t.onclick = e => {
      e.stopPropagation();
      kf.tag = t.dataset.kbtag;
      render();
    };
  });

  document.querySelectorAll('[data-kbcopy]').forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const item = (S.kbItems || []).find(x => x.id === b.dataset.kbcopy);
      if (!item) return;
      try {
        await navigator.clipboard.writeText(item.content || '');
        toast('📋 تم نسخ المحتوى/البرومبت إلى الحافظة');
      } catch {
        toast('تعذر النسخ التلقائي', false);
      }
    };
  });

  document.querySelectorAll('[data-kbedit]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const item = (S.kbItems || []).find(x => x.id === b.dataset.kbedit);
      if (item) kbDialog(item);
    };
  });

  document.querySelectorAll('[data-kbid]').forEach(card => {
    card.onclick = () => {
      const item = (S.kbItems || []).find(x => x.id === card.dataset.kbid);
      if (item) kbDialog(item);
    };
  });
}

function kbDialog(item) {
  const isNew = !item?.id;
  const x = item || {
    title: '',
    category: 'prompt',
    summary: '',
    content: '',
    tags: [],
    reference_url: '',
    author_id: meKey(),
    pinned: false
  };

  modal(`<h3>${isNew ? '📚 إضافة معلومة جديدة أو برومبت لمكتبة المعرفة' : '✏️ تعديل عنصر مكتبة المعرفة'}</h3>
    <div class="fgrid">
      <div class="field full">
        <label>العنوان *</label>
        <input class="in" id="kb_ti" value="${esc(x.title || '')}" placeholder="مثال: برومبت كتابة إعلان عقاري أو دليل رفع الحملات">
      </div>
      <div class="field">
        <label>التصنيف</label>
        <select class="sel" id="kb_cat">
          ${KB_CATS.map(([k, l]) => `<option value="${k}" ${x.category === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>المساهم / الكاتب</label>
        <select class="sel" id="kb_auth">
          <option value="">— عام —</option>
          ${(S.members || []).map(m => `<option value="${esc(mKey(m))}" ${same(x.author_id, mKey(m)) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field full">
        <label>وصف مختصر (متى وكيف نستخدم هذه المعلومة أو البرومبت؟)</label>
        <input class="in" id="kb_sum" value="${esc(x.summary || '')}" placeholder="سطر يوضح فائدة هذا البرومبت أو المعلومة...">
      </div>
      <div class="field full">
        <label>النص الكامل للبرومبت أو الدليل المعرفي *</label>
        <textarea class="ta" id="kb_cnt" style="min-height:150px;font-family:inherit">${esc(x.content || '')}</textarea>
      </div>
      <div class="field">
        <label>الوسوم (Tags) مفصولة بفاصلة</label>
        <input class="in" id="kb_tags" value="${esc((x.tags || []).join('، '))}" placeholder="مثال: إعلانات، مبيعات، شات جي بي تي، تصميم">
      </div>
      <div class="field">
        <label>رابط أداة أو مرجع خارجي (اختياري)</label>
        <input class="in" id="kb_url" value="${esc(x.reference_url || '')}" placeholder="https://...">
      </div>
      <div class="field full">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="kb_pin" ${x.pinned ? 'checked' : ''} style="width:18px;height:18px">
          <span>📌 تثبيت هذه المعلومة / البرومبت في أعلى مكتبة المعرفة لأهميتها</span>
        </label>
      </div>
    </div>
    <div class="factions">
      ${!isNew ? '<button class="btn danger" id="kb_del">حذف</button>' : ''}
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn primary" id="kb_save">💾 حفظ في مكتبة المعرفة</button>
    </div>`);

  $('kb_save').onclick = async () => {
    const title = $('kb_ti').value.trim();
    const content = $('kb_cnt').value.trim();
    if (!title || !content) return toast('يرجى كتابة العنوان والنص الكامل', false);
    const rawTags = $('kb_tags').value
      .split(/[,،]/)
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    const updated = {
      ...x,
      id: x.id || 'kb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title,
      category: $('kb_cat').value,
      author_id: $('kb_auth').value || meKey(),
      summary: $('kb_sum').value.trim(),
      content,
      tags: rawTags,
      reference_url: $('kb_url').value.trim(),
      pinned: $('kb_pin').checked,
      created_at: x.created_at || new Date().toISOString()
    };

    await saveHiddenJsonItem('__kb:', updated);
    closeModal();
    toast('تم حفظ المعلومة في مكتبة المعرفة بنجاح 📚');
    render();
  };

  if (!isNew && $('kb_del')) {
    $('kb_del').onclick = async () => {
      if (!(await ask('هل أنت متأكد من حذف هذا العنصر من مكتبة المعرفة؟'))) return;
      await deleteHiddenJsonItem('__kb:', x.id);
      closeModal();
      toast('تم الحذف');
      render();
    };
  }
}
