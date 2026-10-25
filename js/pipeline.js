// ===== خط نشر المنتجات والمنشورات: استلام من المورد → تصميم ومحتوى → نشر على المنصات + حالة التفرّغ الذكية للردود =====
// الصور تُضغط وتُرفع للمخزن الخاص مؤقتاً (المسار pl/<معرّف المنتج>/...) وتُحذف نهائياً بعد إنهاء النشر.

const PL_STAGES = [
  { id: 'intake', n: 'استلام', ic: '📥' },
  { id: 'design', n: 'تصميم', ic: '🎨' },
  { id: 'publish', n: 'نشر', ic: '📣' },
  { id: 'done', n: 'منشور', ic: '✅' }
];
const PL_PLATFORMS = [
  { id: 'instagram', n: 'إنستغرام', ic: '📸', max: 2200, tip: 'صورة 4:5 أو مربعة • أول سطر جذّاب • 8–15 هاشتاق • رابط الطلب في البايو' },
  { id: 'facebook', n: 'فيسبوك', ic: '📘', max: 0, tip: 'نص أوضح مع السعر والتوصيل • صورة أفقية أو مربعة • رابط مباشر للطلب' },
  { id: 'tiktok', n: 'تيك توك', ic: '🎵', max: 2200, tip: 'فيديو أو سلايدشو عمودي 9:16 • أول ثانيتين تشدّ الانتباه • 3–5 هاشتاقات' },
  { id: 'snapchat', n: 'سناب شات', ic: '👻', max: 0, tip: 'عمودي 9:16 • نص قصير على الصورة • السعر وطريقة الطلب واضحة' },
  { id: 'x', n: 'منصة X', ic: '✖️', max: 280, tip: 'حتى 280 حرفاً • صورة واحدة قوية • هاشتاقان كحد أقصى' },
  { id: 'whatsapp', n: 'واتساب (حالة/قناة)', ic: '💬', max: 0, tip: 'صورة + السعر + رابط أو رقم الطلب • اختصر النص' },
  { id: 'telegram', n: 'تيليجرام', ic: '✈️', max: 4096, tip: 'صور متعددة مع نص منسّق • السعر ورابط الطلب' },
  { id: 'pinterest', n: 'بنترست', ic: '📌', max: 500, tip: 'صورة عمودية 2:3 • عنوان وصفي بكلمات مفتاحية • رابط المنتج' },
  { id: 'store', n: 'المتجر الإلكتروني', ic: '🛍️', max: 0, tip: 'العنوان والوصف والصور والسعر كاملة وبدون أخطاء قبل التفعيل' }
];
const PL_ROLES = [
  { id: 'intake', n: '📥 استلام المنتجات' },
  { id: 'design', n: '🎨 تصميم ومحتوى' },
  { id: 'publish', n: '📣 نشر' },
  { id: 'reply', n: '💬 ردود العملاء' }
];
const PL_CHANNELS = ['واتساب', 'إنستغرام', 'فيسبوك', 'تيك توك', 'سناب شات', 'ماسنجر', 'تيليجرام', 'منصة X'];
const PL_MAX_IMG = 8;
const PL_PRES_TIMEOUT_MS = 110 * 1000; // 110 ثانية بدون نبضة اتصال = انقطع الإنترنت تلقائياً (مثل Microsoft Teams)

const PL = {
  rows: [], posts: [], imgs: [], pres: [], sig: {}, loaded: false, busy: false, err: '', t: 0, poll: null, hbTimer: null,
  cur: null, draft: null, dlgBound: false, lim: 60, dp: '7', timer: 0, mode: 'grid',
  f: { stage: 'active', q: '', supplier: '', who: '', platform: '', flag: '', period: 'all', sort: 'new' }
};

// تحميل الكاش المحلي فوراً لدعم العمل أوفلاين وعرض المنشورات بدون انتظار
try {
  const cachedPl = JSON.parse(localStorage.getItem('tt_pl_cache_v1') || 'null');
  if (cachedPl && typeof cachedPl === 'object') {
    if (Array.isArray(cachedPl.rows)) PL.rows = cachedPl.rows;
    if (Array.isArray(cachedPl.posts)) PL.posts = cachedPl.posts;
    if (Array.isArray(cachedPl.imgs)) PL.imgs = cachedPl.imgs;
    if (Array.isArray(cachedPl.pres)) PL.pres = cachedPl.pres;
    if (PL.rows.length || PL.posts.length) PL.loaded = true;
  }
} catch (e) {}

function plSaveCache() {
  try {
    localStorage.setItem('tt_pl_cache_v1', JSON.stringify({
      saved_at: new Date().toISOString(),
      rows: PL.rows || [],
      posts: PL.posts || [],
      imgs: PL.imgs || [],
      pres: PL.pres || []
    }));
  } catch (e) {}
}

/* ---------- أدوات مساعدة ---------- */
const plId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const plNow = () => new Date().toISOString();
const plStage = id => PL_STAGES.find(s => s.id === id) || PL_STAGES[0];
const plPlat = id => PL_PLATFORMS.find(p => p.id === id) || { id, n: id, ic: '🔗', tip: '', max: 0 };
const plCur = () => { try { return typeof bcurr === 'function' ? bcurr() : 'ر.ي'; } catch (e) { return 'ر.ي'; } };
const plMoney = n => typeof money === 'function' ? money(n) : String(n);
const plCo = () => (typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '') || '';
const plRows = () => { const co = plCo(); return PL.rows.filter(r => !co || same(r.company_id || DEFAULT_COMPANY, co)); };
const plProd = id => PL.rows.find(r => r.id === id);
const plPostsOf = id => PL.posts.filter(x => x.product_id === id).sort((a, b) => PL_PLATFORMS.findIndex(p => p.id === a.platform) - PL_PLATFORMS.findIndex(p => p.id === b.platform));
const plImgsOf = (id, kind) => PL.imgs.filter(x => x.product_id === id && (!kind || x.kind === kind));
const plCanCost = p => isAdmin() || !!(memberPerms(S.me) || {}).canCost || (!!p && S.me && same(p.created_by, S.me.email));
const plSince = p => p.stage === 'done' ? (p.published_at || p.updated_at) : p.stage === 'publish' ? (p.design_done_at || p.to_design_at || p.created_at) : p.stage === 'design' ? (p.to_design_at || p.created_at) : p.created_at;
const plAgeH = p => Math.max(0, (Date.now() - new Date(plSince(p))) / 3600000);
const plDur = h => h < 1 ? Math.max(1, Math.round(h * 60)) + ' د' : h < 48 ? Math.round(h) + ' س' : Math.round(h / 24) + ' يوم';
const plOwner = p => p.stage === 'design' ? p.design_by : p.stage === 'publish' ? p.publish_by : p.stage === 'intake' ? p.created_by : '';
const plUnclaimed = p => (p.stage === 'design' && !p.design_by) || (p.stage === 'publish' && !p.publish_by);
const plLate = p => p.stage !== 'done' && plAgeH(p) >= 48;
const plPres = email => PL.pres.find(x => same(x.email, email));
const isPipeView = () => S.view === 'pipe' || S.view === 'pub';

// حالة التواجد الذكية (مثل Microsoft Teams): إذا انقطع الإنترنت أو توقفت النبضة يظهر فوراً أنه لم يعد متاحاً
function plPresenceState(pr, emailOpt) {
  const email = emailOpt || (pr && pr.email) || '';
  if (!pr || !pr.reply_available) {
    return { status: 'off', online: false, want: false, label: 'غير متفرغ للرد' };
  }
  // إذا كان هذا هو الموظف نفسه على هذا الجهاز والإنترنت مقطوع حالياً، يظهر فوراً غير متاح!
  if (S.me && same(email, S.me.email) && !navigator.onLine) {
    return { status: 'offline', online: false, want: true, label: 'انقطع الإنترنت (غير متاح حالياً)' };
  }
  const lastTouch = pr.updated_at || pr.available_since;
  const ageMs = lastTouch ? (Date.now() - new Date(lastTouch).getTime()) : Infinity;
  // إذا تجاوزت آخر نبضة 110 ثانية (أغلق التطبيق أو فصل الإنترنت)، يظهر أنه انقطع اتصاله ولم يعد متاحاً
  if (ageMs > PL_PRES_TIMEOUT_MS) {
    return { status: 'offline', online: false, want: true, label: 'انقطع الاتصال (غير متاح حالياً)' };
  }
  return { status: 'online', online: true, want: true, label: 'متاح للرد الآن' };
}

const plAvail = pr => plPresenceState(pr).online;
const plCut = per => per === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)) : (per === '7' || per === '30') ? new Date(Date.now() - (+per) * 86400000) : null;
const plNum = v => { const x = String(v == null ? '' : v).trim(); return x === '' || isNaN(+x) ? null : +x; };
const plThumb = p => { const d = plImgsOf(p.id, 'design')[0] || plImgsOf(p.id, 'source')[0]; return d ? d.path : ''; };
const plBusyBtn = (b, on) => { if (b) { b.disabled = !!on; } };
async function plCopy(text) {
  try { await navigator.clipboard.writeText(text); toast('تم النسخ ✓'); }
  catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('تم النسخ ✓'); } catch (_) { toast('تعذّر النسخ', false); } t.remove(); }
}

/* ---------- السجل التاريخي للمراحل والتعديلات ---------- */
function plGetStageHistory(productId) {
  const map = {};
  try {
    const loc = JSON.parse(localStorage.getItem('tt_pl_hist_v1') || '{}');
    Object.assign(map, loc);
  } catch (e) {}
  const hv = (S.ordSet && Array.isArray(S.ordSet.hidden_views)) ? S.ordSet.hidden_views : [];
  hv.forEach(item => {
    if (typeof item === 'string' && item.startsWith('__plhist:')) {
      try {
        const parsed = JSON.parse(item.slice(9));
        if (parsed && parsed.id && Array.isArray(parsed.entries)) {
          map[parsed.id] = parsed.entries;
        }
      } catch (e) {}
    }
  });
  return Array.isArray(map[productId]) ? map[productId] : [];
}

async function plAppendStageHistory(p, entry) {
  if (!p || !p.id) return;
  const curEntries = plGetStageHistory(p.id);
  const fullEntry = Object.assign({
    at: plNow(),
    by: (S.me && S.me.email) || '',
    title_snapshot: p.content_title || p.title || '',
    desc_snapshot: p.content_desc || p.raw_desc || '',
    hashtags_snapshot: p.hashtags || '',
    price_snapshot: p.sell_price != null ? p.sell_price : p.source_price
  }, entry);
  curEntries.push(fullEntry);
  try {
    const loc = JSON.parse(localStorage.getItem('tt_pl_hist_v1') || '{}');
    loc[p.id] = curEntries;
    localStorage.setItem('tt_pl_hist_v1', JSON.stringify(loc));
  } catch (e) {}
  if (typeof saveHiddenJsonItem === 'function') {
    await saveHiddenJsonItem('__plhist:', { id: p.id, entries: curEntries });
  }
}

function plBuildCombinedHistory(p) {
  const custom = plGetStageHistory(p.id);
  const base = [];
  if (p.created_at) {
    base.push({
      stage: 'intake',
      label: '📥 تسجيل واستلام المنتج من المورد',
      at: p.created_at,
      by: p.created_by,
      title_snapshot: p.title,
      desc_snapshot: p.raw_desc,
      price_snapshot: p.source_price,
      note: p.supplier ? 'المورد: ' + p.supplier : ''
    });
  }
  if (p.to_design_at) {
    base.push({
      stage: 'design',
      label: '🎨 التحويل لمرحلة التصميم والمحتوى (مع التعبئة التلقائية)',
      at: p.to_design_at,
      by: p.design_by || p.created_by,
      title_snapshot: p.content_title || p.title,
      desc_snapshot: p.content_desc || p.raw_desc,
      price_snapshot: p.sell_price != null ? p.sell_price : p.source_price
    });
  }
  if (p.design_done_at) {
    base.push({
      stage: 'publish',
      label: '📣 اعتماد التصميم والتجهيز للنشر',
      at: p.design_done_at,
      by: p.design_by,
      title_snapshot: p.content_title || p.title,
      desc_snapshot: p.content_desc,
      hashtags_snapshot: p.hashtags,
      price_snapshot: p.sell_price
    });
  }
  if (p.published_at) {
    base.push({
      stage: 'done',
      label: '✅ إتمام النشر على المنصات',
      at: p.published_at,
      by: p.publish_by,
      title_snapshot: p.content_title || p.title,
      desc_snapshot: p.content_desc
    });
  }
  // دمج السجلات المخصصة مع الأساسية وترتيبها زمنياً
  const all = base.concat(custom);
  const seen = new Set();
  return all.filter(x => {
    const key = (x.stage || '') + '|' + String(x.at || '').slice(0, 16) + '|' + (x.label || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

function plHistoryBoxHtml(p) {
  const list = plBuildCombinedHistory(p);
  if (!list.length) return '';
  return '<details class="pl-box"><summary>🕓 السجل التاريخي للمراحل والتعديلات (' + list.length + ')</summary>' +
    '<div class="pl-hist-list">' +
      list.map((h, idx) => {
        const dt = h.at ? new Date(h.at).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return '<div class="pl-hist-item">' +
          '<div class="pl-hist-head">' +
            '<b>' + esc(h.label || ('مرحلة ' + (h.stage || ''))) + '</b>' +
            '<span class="m">👤 ' + esc(h.by ? nm(h.by) : 'النظام') + (dt ? ' · 🕒 ' + esc(dt) : '') + '</span>' +
          '</div>' +
          (h.note ? '<div style="color:var(--soon);font-weight:600;margin-bottom:4px">💬 ' + esc(h.note) + '</div>' : '') +
          (h.title_snapshot ? '<div class="m"><b>العنوان:</b> ' + esc(h.title_snapshot) + '</div>' : '') +
          (h.desc_snapshot ? '<div class="pl-raw" style="max-height:90px;margin-top:4px;font-size:12px">' + esc(h.desc_snapshot) + '</div>' : '') +
          (p.stage === 'design' && (h.desc_snapshot || h.title_snapshot) ? '<div style="margin-top:6px"><button type="button" class="s" data-hrest="' + idx + '" style="font-size:11.5px;padding:3px 9px">🔄 استعادة هذا النص في خانات التصميم</button></div>' : '') +
        '</div>';
      }).join('') +
    '</div></details>';
}

/* ---------- تحميل البيانات ---------- */
async function plLoad() {
  if (PL.busy) return;
  if (!navigator.onLine) {
    PL.loaded = true;
    PL.err = '';
    return;
  }
  PL.busy = true;
  try {
    const [a, b, c, d] = await Promise.all([
      sb.from('pl_products').select('*').order('created_at', { ascending: false }).limit(1000),
      sb.from('pl_posts').select('*').limit(5000),
      sb.from('pl_images').select('*').order('pos', { ascending: true }).limit(5000),
      sb.from('pl_presence').select('*').limit(300)
    ]);
    const e = a.error || b.error || c.error || d.error;
    if (e) {
      if (PL.rows.length) {
        PL.err = '';
      } else {
        PL.err = /relation|does not exist|schema cache|not find|404/i.test(e.message || '') ? 'setup' : (e.message || 'خطأ غير معروف');
      }
    } else {
      PL.err = '';
      PL.rows = a.data || [];
      PL.posts = b.data || [];
      PL.imgs = c.data || [];
      PL.pres = d.data || [];
      plSaveCache();
    }
  } catch (e) {
    if (!PL.rows.length) PL.err = 'تعذّر الاتصال';
  }
  PL.loaded = true; PL.busy = false; PL.t = Date.now();
  if (!PL.err && navigator.onLine) plAutoPurge();
}

// أي منتج منشور بقيت له صور (فشل حذف سابق) تُحذف تلقائياً في الخلفية
async function plAutoPurge() {
  const dead = PL.rows.filter(p => p.stage === 'done' && plImgsOf(p.id).length).slice(0, 3);
  for (const p of dead) await plPurge(p.id, true);
}
async function plDelFiles(paths) {
  paths = (paths || []).filter(Boolean); if (!paths.length) return true;
  try { const r = await fetch(API + '/storage/v1/object/' + IMG_BUCKET, { method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) }); return r.ok; }
  catch (e) { return false; }
}
async function plPurge(id, quiet) {
  const L = plImgsOf(id);
  if (L.length) {
    if (!await plDelFiles(L.map(x => x.path))) { if (!quiet) toast('تعذّر حذف بعض الصور وسيُعاد المحاولة تلقائياً', false); return false; }
    await sb.from('pl_images').delete().eq('product_id', id);
    PL.imgs = PL.imgs.filter(x => x.product_id !== id);
  }
  const t = plNow(); await sb.from('pl_products').update({ images_purged_at: t }).eq('id', id);
  const p = plProd(id); if (p) p.images_purged_at = t;
  plSaveCache();
  return true;
}

/* ---------- الصور: ضغط + رفع + روابط مؤقتة ---------- */
async function plPrep(file) {
  let b = await compressImage(file, 1600, 0.82);
  if (b.size > 950 * 1024) b = await compressImage(file, 1280, 0.7);
  if (b.size > 950 * 1024) b = await compressImage(file, 1024, 0.6);
  return b;
}
async function plSignOne(path) {
  if (PL.sig[path] && PL.sig[path].t > Date.now()) return PL.sig[path].u;
  const m = await imgSign([path]); if (m[path]) PL.sig[path] = { u: m[path], t: Date.now() + 50 * 60000 };
  return PL.sig[path] ? PL.sig[path].u : '';
}
async function plHydrate(root) {
  const els = [...(root || document).querySelectorAll('img[data-pp]')].filter(i => !i.getAttribute('src'));
  const need = [...new Set(els.map(i => i.dataset.pp).filter(p => !(PL.sig[p] && PL.sig[p].t > Date.now())))];
  if (need.length) { const m = await imgSign(need); for (const p in m) PL.sig[p] = { u: m[p], t: Date.now() + 50 * 60000 }; }
  els.forEach(i => { const s = PL.sig[i.dataset.pp]; if (s) i.src = s.u; });
}
async function plUploadBlob(pid, kind, blob, pos) {
  const path = 'pl/' + pid + '/' + kind[0] + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.jpg';
  const err = await imgUpload(path, blob); if (err) return { err };
  const row = { id: plId(), product_id: pid, kind, path, pos, created_by: S.me.email };
  const { error } = await sb.from('pl_images').insert(row);
  if (error) { plDelFiles([path]); return { err: error.message }; }
  PL.imgs.push(Object.assign({ created_at: plNow() }, row));
  plSaveCache();
  return { row };
}
async function plDownload(path, name) {
  try {
    const u = await plSignOne(path); const r = await fetch(u); const b = await r.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name || 'image.jpg'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  } catch (e) { toast('تعذّر تنزيل الصورة', false); }
}

/* ---------- الواجهة الرئيسية ---------- */
function pipeView() {
  if (PL.err === 'setup') return '<div class="card pl-setup"><h2>⚙ تفعيل خط النشر</h2><p>هذا التبويب يحتاج جداول خط النشر في قاعدة البيانات. افتح <b>Supabase ← SQL Editor</b> وشغّل محتوى الملف <b dir="ltr">sql/016_pipeline.sql</b> مرة واحدة، ثم حدّث الصفحة.</p><button class="p s" id="pl_retry">🔄 إعادة المحاولة</button></div>';
  if (PL.err && !PL.rows.length) return '<div class="card"><h2>تعذّر تحميل خط النشر</h2><p class="m">' + esc(PL.err) + '</p><button class="p s" id="pl_retry">🔄 إعادة المحاولة</button></div>';
  if (!PL.loaded && !PL.rows.length) return '<div class="card m" style="text-align:center;padding:28px">⏳ جارٍ تحميل خط النشر والمنشورات…</div>';
  return '<div id="pl_root">' + plPresenceBar() + plDash() + plToolbar() + '<div id="pl_list">' + plListHtml() + '</div></div>';
}

function plPresenceBar() {
  const myRec = S.me ? plPres(S.me.email) : null;
  const myState = S.me ? plPresenceState(myRec, S.me.email) : { status: 'off', online: false, want: false };
  const activeResponders = PL.pres.filter(x => x && x.reply_available);

  const chips = activeResponders.map(x => {
    const st = plPresenceState(x, x.email);
    const chTxt = (x.channels || []).length ? ' · ' + esc(x.channels.join('، ')) : '';
    if (st.online) {
      return '<span class="pl-av" title="متصل الآن ومتاح للرد على العملاء"><i></i>' + esc(nm(x.email)) + chTxt + ' <small>(متاح الآن)</small></span>';
    }
    return '<span class="pl-av off" title="كان مفعّلاً للتفرغ ولكن انقطع اتصاله بالإنترنت"><i></i>' + esc(nm(x.email)) + ' · ⚠️ انقطع النت (لم يعد متاحاً)</span>';
  }).join('');

  const onlineCnt = activeResponders.filter(x => plPresenceState(x, x.email).online).length;

  return '<div class="card pl-pres"><div class="bar" style="flex-wrap:wrap;gap:10px">' +
    '<div>' +
      '<b>💬 الردود على العملاء (حالة الاتصال الحية — مثل Teams)</b>' +
      '<div class="m">' + (onlineCnt ? ('يوجد ' + onlineCnt + ' متفرغ للردود ومتصل بالإنترنت الآن:') : activeResponders.length ? '⚠️ الموظفون المسجلون للرد انقطع اتصالهم بالإنترنت حالياً:' : 'لا أحد متفرغ للردود حالياً') + '</div>' +
      (chips ? '<div class="pl-avs">' + chips + '</div>' : '') +
    '</div>' +
    '<div class="row" style="flex:0 0 auto;flex-wrap:wrap;gap:6px">' +
      '<button class="s ' + (myState.want ? (myState.online ? 'dng' : 'warn') : 'p') + '" id="pl_av">' +
        (myState.want ? (myState.online ? '⏹ إنهاء تفرّغي (متصل الآن)' : '⚠️ متفرغ ولكن أوفلاين (إيقاف)') : '🙋 أنا متفرغ للردود') +
      '</button>' +
      '<button class="s" id="pl_me">⚙ أدواري وقنواتي</button>' +
      '<button class="s" id="pl_soc_cfg" title="إعداد الربط التلقائي مع صفحات فيسبوك وتيليجرام">🔗 ربط المنصات</button>' +
    '</div></div></div>';
}

function plDash() {
  const R = plRows(), wip = R.filter(p => p.stage !== 'done'), cut = plCut(PL.dp === 'all' ? '' : PL.dp);
  const inP = d => d && (!cut || new Date(d) >= cut);
  const doneIn = R.filter(p => p.stage === 'done' && inP(p.published_at || p.updated_at));
  const avg = doneIn.length ? doneIn.reduce((a, p) => a + Math.max(0, (new Date(p.published_at || p.updated_at) - new Date(p.created_at)) / 3600000), 0) / doneIn.length : null;
  const ids = new Set(R.map(p => p.id));
  const pubPosts = PL.posts.filter(x => ids.has(x.product_id) && x.status === 'published' && inP(x.posted_at));
  const byPlat = PL_PLATFORMS.map(p => ({ p, n: pubPosts.filter(x => x.platform === p.id).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const pubBy = {}; pubPosts.forEach(x => { pubBy[(x.posted_by || '').toLowerCase()] = (pubBy[(x.posted_by || '').toLowerCase()] || 0) + 1; });
  const cnt = s => wip.filter(p => p.stage === s).length, late = wip.filter(plLate).length, unc = wip.filter(plUnclaimed).length;
  const mx = Math.max(1, cnt('intake'), cnt('design'), cnt('publish'), doneIn.length);
  const kpi = (ic, n, l, attr, cls) => '<button class="pl-k ' + (cls || '') + '" ' + (attr || '') + '><span class="pl-kn">' + n + '</span><span class="pl-kl">' + ic + ' ' + l + '</span></button>';
  const fun = [['intake', 'استلام', cnt('intake')], ['design', 'تصميم ومحتوى', cnt('design')], ['publish', 'جاهز للنشر', cnt('publish')], ['done', 'منشور (الفترة)', doneIn.length]]
    .map(([s, l, n]) => '<div class="pl-fr"><span>' + l + '</span><div class="pl-bar"><i class="s-' + s + '" style="width:' + Math.round(n / mx * 100) + '%"></i></div><b>' + n + '</b></div>').join('');
  const pm = Math.max(1, ...byPlat.map(x => x.n));
  const plat = byPlat.length ? byPlat.map(x => '<div class="pl-fr"><span>' + x.p.ic + ' ' + x.p.n + '</span><div class="pl-bar"><i style="width:' + Math.round(x.n / pm * 100) + '%"></i></div><b>' + x.n + '</b></div>').join('') : '<div class="m">لا منشورات في هذه الفترة</div>';
  const team = (S.members || []).filter(m => m.role !== 'rep').map(m => {
    const pr = plPres(m.email), st = plPresenceState(pr, m.email), e = (m.email || '').toLowerCase();
    const d = wip.filter(p => p.stage === 'design' && same(p.design_by, m.email)).length, pb = wip.filter(p => p.stage === 'publish' && same(p.publish_by, m.email)).length;
    const roles = ((pr && pr.roles) || []).map(r => (PL_ROLES.find(x => x.id === r) || { n: r }).n).join(' ');
    const dotCls = st.online ? ' on' : st.want ? ' off' : '';
    return '<div class="pl-tr" data-pteam="' + esc(m.email) + '"><span class="pl-dot' + dotCls + '" title="' + esc(st.label) + '"></span><div class="pl-tn"><b>' + esc(m.name) + '</b><div class="m">' + (roles || 'بدون أدوار محددة') + (st.want ? ' · <b>' + esc(st.label) + '</b>' : '') + '</div></div>' +
      '<div class="pl-tc"><span title="تصميم">🎨 ' + d + '</span><span title="نشر">📣 ' + pb + '</span><span title="منشورات الفترة">✅ ' + (pubBy[e] || 0) + '</span></div></div>';
  }).join('');
  return '<div class="card pl-dash"><div class="bar"><h2 style="margin:0">📊 لوحة خط النشر والمنشورات</h2><select id="pl_dp" class="s" style="width:auto"><option value="today"' + (PL.dp === 'today' ? ' selected' : '') + '>اليوم</option><option value="7"' + (PL.dp === '7' ? ' selected' : '') + '>آخر 7 أيام</option><option value="30"' + (PL.dp === '30' ? ' selected' : '') + '>آخر 30 يوم</option><option value="all"' + (PL.dp === 'all' ? ' selected' : '') + '>الكل</option></select></div>' +
    '<div class="pl-kpis">' + kpi('📥', cnt('intake'), 'استلام', 'data-plst="intake"') + kpi('🎨', cnt('design'), 'تصميم', 'data-plst="design"') + kpi('📣', cnt('publish'), 'جاهز للنشر', 'data-plst="publish"') + kpi('✅', doneIn.length, 'منشور بالفترة', 'data-plst="done"') +
    kpi('⏱', avg == null ? '—' : plDur(avg), 'متوسط الزمن حتى النشر', '') + kpi('⚠', late, 'متأخر +48س', 'data-plst="active" data-plfl="late"', late ? 'bad' : '') + kpi('🙋', unc, 'بلا مسؤول', 'data-plst="active" data-plfl="unclaimed"', unc ? 'warn' : '') + '</div>' +
    '<div class="pl-dgrid"><div><b class="pl-ht">مسار المنتجات</b>' + fun + '</div><div><b class="pl-ht">المنشور على كل منصة</b>' + plat + '</div></div>' +
    '<details class="pl-team"><summary>👥 الفريق وحالة التفرّغ (' + (S.members || []).filter(m => m.role !== 'rep').length + ')</summary>' + (team || '<div class="m">لا يوجد موظفون</div>') + '<div class="m" style="margin-top:6px">🎨 قيد التصميم · 📣 قيد النشر · ✅ منشورات الفترة. اضغط على الموظف لتعديل أدواره.</div></details></div>';
}

function plToolbar() {
  const R = plRows(), f = PL.f;
  const cnt = s => s === 'all' ? R.length : s === 'active' ? R.filter(p => p.stage !== 'done').length : R.filter(p => p.stage === s).length;
  const tabs = [['active', 'النشط'], ['intake', '📥 استلام'], ['design', '🎨 تصميم'], ['publish', '📣 نشر'], ['done', '✅ منشور'], ['all', 'الكل']];
  const sups = [...new Set(R.map(p => (p.supplier || '').trim()).filter(Boolean))].sort();
  const whoE = [...new Set(R.flatMap(p => [p.created_by, p.design_by, p.publish_by]).filter(Boolean).map(x => x.toLowerCase()))];
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const adv = [f.supplier, f.who, f.platform, f.flag, f.period !== 'all' ? 1 : ''].filter(Boolean).length;
  return '<div class="card pl-tb"><div class="pl-top">' +
    '<input id="pl_q" type="search" placeholder="🔎 بحث بالاسم أو المورد أو الوصف أو الهاشتاق…" value="' + esc(f.q) + '">' +
    '<div class="seg" style="flex:0 0 auto">' +
      '<button type="button" data-plmode="grid" class="' + (PL.mode !== 'kanban' ? 'on' : '') + '">🗂️ بطاقات</button>' +
      '<button type="button" data-plmode="kanban" class="' + (PL.mode === 'kanban' ? 'on' : '') + '">📋 مسار المراحل</button>' +
    '</div>' +
    '<button class="p s" id="pl_new">＋ منتج / منشور جديد</button>' +
    '<button class="s" id="pl_rf" title="تحديث">↻</button></div>' +
    '<div class="pl-tabs">' + tabs.map(([k, l]) => '<button data-plst="' + k + '" class="' + (f.stage === k ? 'on' : '') + '">' + l + ' <em>' + cnt(k) + '</em></button>').join('') + '</div>' +
    '<details class="pl-adv"' + (adv ? ' open' : '') + '><summary>🎚 تصفية متقدمة' + (adv ? ' <span class="chip all">' + adv + '</span>' : '') + '</summary><div class="pl-fgrid">' +
    '<label>المورد<select data-plf="supplier">' + opt('', 'الكل', f.supplier) + sups.map(s => opt(s, s, f.supplier)).join('') + '</select></label>' +
    '<label>المسؤول<select data-plf="who">' + opt('', 'الكل', f.who) + opt('__none', '🙋 بدون مسؤول', f.who) + whoE.map(e => opt(e, nm(e), f.who)).join('') + '</select></label>' +
    '<label>المنصة<select data-plf="platform">' + opt('', 'الكل', f.platform) + PL_PLATFORMS.map(p => opt(p.id, p.ic + ' ' + p.n, f.platform)).join('') + '</select></label>' +
    '<label>الحالة<select data-plf="flag">' + opt('', 'الكل', f.flag) + opt('late', '⚠ متأخر', f.flag) + opt('unclaimed', '🙋 بلا مسؤول', f.flag) + opt('high', '🔥 عاجل', f.flag) + '</select></label>' +
    '<label>تاريخ الإضافة<select data-plf="period">' + opt('all', 'أي وقت', f.period) + opt('today', 'اليوم', f.period) + opt('7', 'آخر 7 أيام', f.period) + opt('30', 'آخر 30 يوم', f.period) + '</select></label>' +
    '<label>الترتيب<select data-plf="sort">' + opt('new', 'الأحدث', f.sort) + opt('old', 'الأقدم', f.sort) + opt('prio', 'العاجل أولاً', f.sort) + opt('stuck', 'الأكثر تأخراً', f.sort) + '</select></label>' +
    '</div>' + (adv || f.q ? '<button class="s" id="pl_clear">✖ مسح التصفية</button>' : '') + '</details></div>';
}

function plFiltered() {
  const f = PL.f; let L = plRows();
  if (PL.mode !== 'kanban') {
    if (f.stage === 'active') L = L.filter(p => p.stage !== 'done'); else if (f.stage !== 'all') L = L.filter(p => p.stage === f.stage);
  }
  const q = f.q.trim().toLowerCase();
  if (q) L = L.filter(p => [p.title, p.supplier, p.content_title, p.content_desc, p.raw_desc, p.hashtags].some(x => String(x || '').toLowerCase().includes(q)));
  if (f.supplier) L = L.filter(p => (p.supplier || '').trim() === f.supplier);
  if (f.who === '__none') L = L.filter(plUnclaimed); else if (f.who) L = L.filter(p => [p.created_by, p.design_by, p.publish_by].some(x => same(x, f.who)));
  if (f.platform) L = L.filter(p => plPostsOf(p.id).some(x => x.platform === f.platform));
  if (f.flag === 'late') L = L.filter(plLate); else if (f.flag === 'unclaimed') L = L.filter(plUnclaimed); else if (f.flag === 'high') L = L.filter(p => p.priority === 'high' && p.stage !== 'done');
  const cut = plCut(f.period === 'all' ? '' : f.period); if (cut) L = L.filter(p => new Date(p.created_at) >= cut);
  const t = p => new Date(p.created_at).getTime();
  if (f.sort === 'old') L.sort((a, b) => t(a) - t(b));
  else if (f.sort === 'prio') L.sort((a, b) => (b.priority === 'high') - (a.priority === 'high') || t(b) - t(a));
  else if (f.sort === 'stuck') L.sort((a, b) => ((b.stage !== 'done') - (a.stage !== 'done')) || plAgeH(b) - plAgeH(a));
  else L.sort((a, b) => t(b) - t(a));
  return L;
}

function plListHtml() {
  const L = plFiltered();
  if (!L.length) return '<div class="card empty" style="text-align:center"><div style="font-size:34px">📭</div><div class="m">لا توجد منتجات أو منشورات مطابقة. اضغط «＋ منتج / منشور جديد» لبدء خط النشر.</div></div>';
  if (PL.mode === 'kanban') {
    return '<div class="pl-kanban">' + PL_STAGES.map(st => {
      const col = L.filter(p => p.stage === st.id);
      return '<div class="pl-kcol">' +
        '<div class="pl-kcol-hd"><span>' + st.ic + ' ' + esc(st.n) + '</span><span class="chip">' + col.length + '</span></div>' +
        '<div class="pl-kcol-bd">' + (col.length ? col.slice(0, 35).map(plCard).join('') : '<div class="m" style="text-align:center;padding:18px 6px">لا توجد عناصر</div>') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  return '<div class="m pl-count"><span>عرض ' + Math.min(L.length, PL.lim) + ' من أصل ' + L.length + ' منتج/منشور</span></div><div class="pl-grid">' + L.slice(0, PL.lim).map(plCard).join('') + '</div>' +
    (L.length > PL.lim ? '<div style="text-align:center;margin-top:12px"><button class="s" id="pl_more">عرض المزيد (' + (L.length - PL.lim) + ')</button></div>' : '');
}

function plCard(p) {
  const st = plStage(p.stage), th = plThumb(p), ps = plPostsOf(p.id), ow = plOwner(p), h = plAgeH(p), pub = ps.filter(x => x.status === 'published').length;
  const who = p.stage === 'done' ? '' : (plUnclaimed(p) ? '<span class="pl-free">🙋 متاح للاستلام</span>' : ow ? '<span class="pl-who">👤 ' + esc(nm(ow)) + '</span>' : '');
  const age = p.stage === 'done' ? '<span class="pl-age">' + ago(p.published_at || p.updated_at) + '</span>' : '<span class="pl-age' + (h >= 48 ? ' late' : h >= 24 ? ' warn' : '') + '">⏱ ' + plDur(h) + '</span>';
  const meta = [p.supplier ? '🏭 ' + esc(p.supplier) : '', p.sell_price != null ? '💰 ' + plMoney(p.sell_price) + ' ' + esc(plCur()) : (plCanCost(p) && p.source_price != null ? '🏷 ' + plMoney(p.source_price) + ' ' + esc(plCur()) : '')].filter(Boolean).join(' · ');
  const histCnt = plBuildCombinedHistory(p).length;
  return '<div class="pl-card' + (plLate(p) ? ' late' : '') + '" data-plc="' + p.id + '" tabindex="0">' +
    '<div class="pl-th">' + (th ? '<img data-pp="' + esc(th) + '" alt="" loading="lazy">' : '<span>' + (p.images_purged_at ? '🧹' : '🖼️') + '</span>') + (p.priority === 'high' && p.stage !== 'done' ? '<b class="pl-hot">🔥</b>' : '') + '</div>' +
    '<div class="pl-bd">' +
      '<div class="pl-tt">' + esc(p.content_title || p.title) + '</div>' +
      (meta ? '<div class="m pl-sub">' + meta + '</div>' : '') +
      '<div class="pl-tags">' +
        '<span class="pl-st s-' + p.stage + '">' + st.ic + ' ' + st.n + '</span>' +
        who + age +
        (ps.length ? '<span class="pl-pp">📣 ' + pub + '/' + ps.length + '</span>' : '') +
        (histCnt > 1 ? '<span title="السجل التاريخي للمراحل">🕓 ' + histCnt + '</span>' : '') +
      '</div>' +
      '<div class="row" style="margin-top:6px;gap:6px" onclick="event.stopPropagation()">' +
        '<button type="button" class="s" data-plqshare="' + p.id + '" style="padding:3px 8px;font-size:11.5px">📤 مشاركة سريعة</button>' +
        (p.stage === 'intake' ? '<button type="button" class="p s" data-plqnext="' + p.id + '" style="padding:3px 8px;font-size:11.5px">🎨 للتصميم ➜</button>' : p.stage === 'design' ? '<button type="button" class="p s" data-plqnext="' + p.id + '" style="padding:3px 8px;font-size:11.5px">📣 للنشر ➜</button>' : '') +
      '</div>' +
    '</div></div>';
}

function plRepaintList() {
  const el = $('pl_list'); if (!el) return;
  el.innerHTML = plListHtml(); plBindList(); plHydrate(el);
}
function plBindList() {
  const el = $('pl_list'); if (!el) return;
  el.onclick = e => {
    const shareBtn = e.target.closest('[data-plqshare]');
    if (shareBtn) {
      e.stopPropagation();
      const prod = plProd(shareBtn.dataset.plqshare);
      if (prod) plQuickShareProduct(prod);
      return;
    }
    const nextBtn = e.target.closest('[data-plqnext]');
    if (nextBtn) {
      e.stopPropagation();
      plOpen(nextBtn.dataset.plqnext);
      return;
    }
    const c = e.target.closest('[data-plc]');
    if (c) return plOpen(c.dataset.plc);
    if (e.target.id === 'pl_more') { PL.lim += 60; plRepaintList(); }
  };
  el.onkeydown = e => { if (e.key === 'Enter') { const c = e.target.closest('[data-plc]'); if (c) plOpen(c.dataset.plc); } };
}

function plRefresh() { if (isPipeView() && !dlg.open) render(); }

function bindPipe() {
  if (!isPipeView()) return;
  plStartHeartbeat();
  if ($('pl_retry')) $('pl_retry').onclick = () => { PL.loaded = false; PL.err = ''; plLoad().then(plRefresh); };
  if (!PL.busy && (!PL.loaded || Date.now() - PL.t > 20000)) plLoad().then(plRefresh);
  const R = $('pl_root'); if (!R) return;
  if ($('pl_av')) $('pl_av').onclick = plToggleAvail;
  if ($('pl_me')) $('pl_me').onclick = () => plPresDialog(S.me.email);
  if ($('pl_soc_cfg')) $('pl_soc_cfg').onclick = () => plSocialConfigDialog();
  if ($('pl_dp')) $('pl_dp').onchange = e => { PL.dp = e.target.value; render(); };
  if ($('pl_new')) $('pl_new').onclick = plNew;
  if ($('pl_rf')) $('pl_rf').onclick = () => { $('pl_rf').textContent = '⏳'; plLoad().then(plRefresh); };
  R.querySelectorAll('[data-plmode]').forEach(b => b.onclick = () => { PL.mode = b.dataset.plmode; render(); });
  R.querySelectorAll('[data-plst]').forEach(b => b.onclick = () => { PL.f.stage = b.dataset.plst; PL.f.flag = b.dataset.plfl || ''; PL.lim = 60; render(); });
  R.querySelectorAll('[data-plf]').forEach(el => el.onchange = () => { PL.f[el.dataset.plf] = el.value; PL.lim = 60; render(); });
  if ($('pl_clear')) $('pl_clear').onclick = () => { PL.f = { stage: PL.f.stage, q: '', supplier: '', who: '', platform: '', flag: '', period: 'all', sort: 'new' }; render(); };
  if ($('pl_q')) $('pl_q').oninput = e => { clearTimeout(PL.timer); PL.timer = setTimeout(() => { PL.f.q = e.target.value; PL.lim = 60; plRepaintList(); }, 180); };
  R.querySelectorAll('[data-pteam]').forEach(r => r.onclick = () => { if (isAdmin() || same(r.dataset.pteam, S.me.email)) plPresDialog(r.dataset.pteam); });
  plBindList(); plHydrate(R);
  clearInterval(PL.poll);
  PL.poll = setInterval(() => {
    if (!isPipeView()) return clearInterval(PL.poll);
    if (document.hidden || dlg.open || !navigator.onLine) return;
    const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    plLoad().then(plRefresh);
  }, 45000);
}

// مرادفات لضمان عمل التبويب سواء استُدعي باسم pubView أو pipeView
const pubView = pipeView;
const bindPub = bindPipe;

/* ---------- التفرّغ للردود والأدوار (بنظام Microsoft Teams الذكي) ---------- */
function plStartHeartbeat() {
  if (PL.hbTimer) clearInterval(PL.hbTimer);
  PL.hbTimer = setInterval(async () => {
    if (!S.me || !navigator.onLine) return;
    const pr = plPres(S.me.email);
    if (pr && pr.reply_available) {
      const now = plNow();
      pr.updated_at = now;
      await sb.from('pl_presence').update({ updated_at: now }).eq('email', String(S.me.email).toLowerCase());
      plSaveCache();
    }
  }, 35000);

  if (!window._plNetBound) {
    window._plNetBound = true;
    window.addEventListener('offline', () => {
      if (isPipeView()) render();
    });
    window.addEventListener('online', async () => {
      if (S.me) {
        const pr = plPres(S.me.email);
        if (pr && pr.reply_available) {
          const now = plNow();
          pr.updated_at = now;
          await sb.from('pl_presence').update({ updated_at: now }).eq('email', String(S.me.email).toLowerCase());
        }
      }
      if (isPipeView()) render();
    });
    window.addEventListener('pagehide', () => {
      if (!S.me) return;
      const pr = plPres(S.me.email);
      if (pr && pr.reply_available) {
        // عند إغلاق الصفحة، نضع updated_at في الماضي ليظهر لبقية الفريق فوراً أنه لم يعد متصلاً
        const past = new Date(Date.now() - 10 * 60000).toISOString();
        try {
          fetch(API + '/rest/v1/pl_presence?email=eq.' + encodeURIComponent(String(S.me.email).toLowerCase()), {
            method: 'PATCH',
            keepalive: true,
            headers: { apikey: KEY, Authorization: 'Bearer ' + (AUTH.s ? AUTH.s.access_token : KEY), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ updated_at: past })
          });
        } catch (e) {}
      }
    });
  }
}

async function plSavePres(email, patch) {
  const old = plPres(email) || {}, was = !!(old && old.reply_available);
  const now = plNow();
  const row = {
    email: String(email).toLowerCase(),
    roles: patch.roles || old.roles || [],
    channels: patch.channels || old.channels || [],
    reply_available: patch.reply_available != null ? patch.reply_available : !!old.reply_available,
    updated_at: now
  };
  row.available_since = row.reply_available ? (was && patch.reply_available !== true ? (old.available_since || now) : now) : null;
  const { error } = await sb.from('pl_presence').upsert(row);
  if (error) { toast(error.message, false); return false; }
  const i = PL.pres.findIndex(x => same(x.email, email)); if (i >= 0) PL.pres[i] = row; else PL.pres.push(row);
  plSaveCache();
  return true;
}

async function plToggleAvail() {
  const pr = plPres(S.me.email), want = !!(pr && pr.reply_available);
  if (!want && !(pr && (pr.channels || []).length)) return plPresDialog(S.me.email, true);
  if (await plSavePres(S.me.email, { reply_available: !want })) {
    toast(want ? 'تم إنهاء تفرّغك للردود' : '🙋 أنت الآن متفرغ للردود (طالما الإنترنت متصل)');
    render();
  }
}

function plPresDialog(email, wantOn) {
  const pr = plPres(email) || {}, isMe = same(email, S.me.email);
  const st = { roles: (pr.roles || []).slice(), channels: (pr.channels || []).slice(), av: wantOn ? true : !!(pr && pr.reply_available) };
  const chips = (arr, list, key) => list.map(x => { const id = x.id || x, n = x.n || x; return '<button type="button" class="pl-pc' + (arr.includes(id) ? ' on' : '') + '" data-k="' + key + '" data-v="' + esc(id) + '">' + esc(n) + '</button>'; }).join('');
  dlg.classList.add('pl-dlg'); plBindDlg();
  dlg.innerHTML = '<h2>' + (isMe ? '⚙ أدواري وحالة التفرّغ للردود' : '⚙ أدوار ' + esc(nm(email))) + '</h2>' +
    '<div class="pl-box"><b>الأدوار (يمكن اختيار أكثر من دور)</b><div class="pl-chips" id="pp_roles">' + chips(st.roles, PL_ROLES, 'roles') + '</div></div>' +
    '<div class="pl-box"><b>قنوات الردود التي أغطيها</b><div class="pl-chips" id="pp_ch">' + chips(st.channels, PL_CHANNELS, 'channels') + '</div></div>' +
    (isMe ? '<div class="pl-box"><b>حالتي الآن</b><div class="pl-chips"><button type="button" class="pl-pc' + (st.av ? ' on' : '') + '" id="pp_av">' + (st.av ? '🟢 متفرغ للردود' : '⚪ غير متفرغ') + '</button></div><div class="m">💡 بمجرد إغلاق الإنترنت أو إغلاق التطبيق يظهر للفريق تلقائياً أنك لم تعد متاحاً (نفس نظام Teams).</div></div>' : '') +
    '<div class="row dact"><button class="s" id="pp_x">إلغاء</button><button class="p s" id="pp_ok">💾 حفظ</button></div>';
  dlg.querySelectorAll('.pl-pc[data-k]').forEach(b => b.onclick = () => { const a = st[b.dataset.k], v = b.dataset.v, i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); b.classList.toggle('on', i < 0); });
  if ($('pp_av')) $('pp_av').onclick = () => { st.av = !st.av; $('pp_av').classList.toggle('on', st.av); $('pp_av').textContent = st.av ? '🟢 متفرغ للردود' : '⚪ غير متفرغ'; };
  $('pp_x').onclick = () => dlg.close();
  $('pp_ok').onclick = async () => {
    if (isMe && st.av && !st.channels.length) return toast('اختر قناة رد واحدة على الأقل لتظهر كمتفرغ', false);
    plBusyBtn($('pp_ok'), true);
    const patch = { roles: st.roles, channels: st.channels }; if (isMe) patch.reply_available = st.av;
    if (await plSavePres(email, patch)) { dlg.close(); toast('تم الحفظ ✓'); render(); } else plBusyBtn($('pp_ok'), false);
  };
  dlg.showModal();
}

/* ---------- إعدادات الربط المباشر والمشاركة لمنصات التواصل الاجتماعي ---------- */
function plGetSocialConfig() {
  try {
    const loc = JSON.parse(localStorage.getItem('tt_soc_cfg_v1') || 'null');
    if (loc && typeof loc === 'object') return loc;
  } catch (e) {}
  if (typeof readHiddenJsonList === 'function') {
    const list = readHiddenJsonList('__socfg:');
    if (list[0]) return list[0];
  }
  return { id: 'main', fb_page_id: '', fb_token: '', tg_bot_token: '', tg_chat_id: '' };
}

function plSocialConfigDialog() {
  const cfg = plGetSocialConfig();
  dlg.classList.add('pl-dlg'); plBindDlg();
  dlg.innerHTML = '<h2>🔗 ربط منصات التواصل الاجتماعي للنشر المباشر</h2>' +
    '<p class="m" style="margin-bottom:12px">يمكنك مشاركة أي منتج مع صوره ونصه بضغطة زر عبر نافذة المشاركة الأصلية للجوال/المتصفح لجميع المنصات، أو تفعيل النشر التلقائي المباشر عبر API لصفحة فيسبوك وقناة تيليجرام:</p>' +
    '<div class="pl-box">' +
      '<b>📘 الربط المباشر مع صفحة فيسبوك (Facebook Page API)</b>' +
      '<div class="row"><label>معرّف الصفحة (Page ID)<input id="sc_fb_id" dir="ltr" value="' + esc(cfg.fb_page_id || '') + '" placeholder="مثال: 1049281928391"></label>' +
      '<label>رمز الوصول للصفحة (Page Access Token)<input id="sc_fb_tok" type="password" dir="ltr" value="' + esc(cfg.fb_token || '') + '" placeholder="EAA..."></label></div>' +
    '</div>' +
    '<div class="pl-box">' +
      '<b>✈️ الربط المباشر مع قناة / مجموعة تيليجرام (Telegram Bot API)</b>' +
      '<div class="row"><label>رمز البوت (Bot Token)<input id="sc_tg_tok" type="password" dir="ltr" value="' + esc(cfg.tg_bot_token || '') + '" placeholder="123456:ABC-DEF..."></label>' +
      '<label>معرّف القناة أو المجموعة (Chat ID)<input id="sc_tg_id" dir="ltr" value="' + esc(cfg.tg_chat_id || '') + '" placeholder="@my_channel أو -100123456789"></label></div>' +
    '</div>' +
    '<div class="row dact"><button class="s" id="sc_x">إلغاء</button><button class="p s" id="sc_sv">💾 حفظ إعدادات الربط</button></div>';
  $('sc_x').onclick = () => dlg.close();
  $('sc_sv').onclick = async () => {
    const next = {
      id: 'main',
      fb_page_id: $('sc_fb_id').value.trim(),
      fb_token: $('sc_fb_tok').value.trim(),
      tg_bot_token: $('sc_tg_tok').value.trim(),
      tg_chat_id: $('sc_tg_id').value.trim()
    };
    try { localStorage.setItem('tt_soc_cfg_v1', JSON.stringify(next)); } catch (e) {}
    if (typeof saveHiddenJsonItem === 'function') await saveHiddenJsonItem('__socfg:', next);
    dlg.close();
    toast('تم حفظ إعدادات ربط المنصات بنجاح ✓');
  };
  dlg.showModal();
}

async function plSharePostWithMedia(p, postRow) {
  const cap = (postRow && postRow.caption) || plDefaultCaption(p, (postRow && postRow.platform) || 'facebook');
  await plCopy(cap);

  // جلب صور التصميم (أو صور الاستلام إن لم توجد صور تصميم) لمشاركتها مباشرة مع النص
  const imgs = plImgsOf(p.id, 'design').length ? plImgsOf(p.id, 'design') : plImgsOf(p.id, 'source');
  const files = [];
  if (imgs.length && navigator.canShare) {
    toast('⏳ جارٍ تجهيز الصور والنص للمشاركة الفورية…');
    for (let i = 0; i < Math.min(imgs.length, 4); i++) {
      try {
        const u = await plSignOne(imgs[i].path);
        if (u) {
          const r = await fetch(u);
          const b = await r.blob();
          files.push(new File([b], (p.title || 'product') + '-' + (i + 1) + '.jpg', { type: b.type || 'image/jpeg' }));
        }
      } catch (e) {}
    }
  }

  if (navigator.share) {
    try {
      if (files.length && navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ title: p.content_title || p.title, text: cap, files });
        return;
      }
      await navigator.share({ title: p.content_title || p.title, text: cap });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }

  // بديل مباشر حسب المنصة عند عدم توفر Web Share API على سطح المكتب
  const plat = (postRow && postRow.platform) || '';
  const enc = encodeURIComponent(cap);
  if (plat === 'whatsapp') window.open('https://wa.me/?text=' + enc, '_blank');
  else if (plat === 'telegram') window.open('https://t.me/share/url?url=' + encodeURIComponent(p.supplier_url || location.origin) + '&text=' + enc, '_blank');
  else if (plat === 'facebook') window.open('https://www.facebook.com/sharer/sharer.php?quote=' + enc + (p.supplier_url ? '&u=' + encodeURIComponent(p.supplier_url) : ''), '_blank');
  else if (plat === 'x') window.open('https://twitter.com/intent/tweet?text=' + enc, '_blank');
  else toast('📋 تم نسخ نص المنشور — الصقه مباشرة في المنصة');
}

async function plQuickShareProduct(p) {
  const posts = plPostsOf(p.id);
  await plSharePostWithMedia(p, posts[0] || null);
}

async function plAutoPublishApi(p, postRow, btn) {
  const cfg = plGetSocialConfig();
  const plat = postRow.platform;
  const cap = postRow.caption || plDefaultCaption(p, plat);
  const imgs = plImgsOf(p.id, 'design').length ? plImgsOf(p.id, 'design') : plImgsOf(p.id, 'source');
  const firstImgUrl = imgs[0] ? await plSignOne(imgs[0].path) : '';

  if (plat === 'facebook') {
    if (!cfg.fb_page_id || !cfg.fb_token) {
      toast('يرجى إدخال Page ID و Access Token من زر «🔗 ربط المنصات» أولاً', false);
      return plSocialConfigDialog();
    }
    plBusyBtn(btn, true);
    try {
      const endpoint = firstImgUrl
        ? 'https://graph.facebook.com/v19.0/' + encodeURIComponent(cfg.fb_page_id) + '/photos'
        : 'https://graph.facebook.com/v19.0/' + encodeURIComponent(cfg.fb_page_id) + '/feed';
      const body = firstImgUrl
        ? { url: firstImgUrl, caption: cap, access_token: cfg.fb_token }
        : { message: cap, access_token: cfg.fb_token };
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      plBusyBtn(btn, false);
      if (!r.ok || j.error) return toast('خطأ من فيسبوك: ' + (j.error?.message || 'تحقق من الصلاحيات'), false);
      const postUrl = j.id ? ('https://facebook.com/' + j.id) : '';
      const uIn = dlg.querySelector('[data-purl="' + postRow.id + '"]');
      if (uIn && postUrl) uIn.value = postUrl;
      await plSetStatus(p, postRow.id, 'published');
      toast('🎉 تم النشر المباشر على صفحة فيسبوك بنجاح!');
    } catch (e) {
      plBusyBtn(btn, false);
      toast('تعذّر الاتصال بـ Facebook API', false);
    }
  } else if (plat === 'telegram') {
    if (!cfg.tg_bot_token || !cfg.tg_chat_id) {
      toast('يرجى إدخال Bot Token و Chat ID من زر «🔗 ربط المنصات» أولاً', false);
      return plSocialConfigDialog();
    }
    plBusyBtn(btn, true);
    try {
      const endpoint = firstImgUrl
        ? 'https://api.telegram.org/bot' + cfg.tg_bot_token + '/sendPhoto'
        : 'https://api.telegram.org/bot' + cfg.tg_bot_token + '/sendMessage';
      const body = firstImgUrl
        ? { chat_id: cfg.tg_chat_id, photo: firstImgUrl, caption: cap }
        : { chat_id: cfg.tg_chat_id, text: cap };
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      plBusyBtn(btn, false);
      if (!r.ok || !j.ok) return toast('خطأ من تيليجرام: ' + (j.description || 'تحقق من البوت'), false);
      await plSetStatus(p, postRow.id, 'published');
      toast('🎉 تم النشر المباشر على قناة تيليجرام بنجاح!');
    } catch (e) {
      plBusyBtn(btn, false);
      toast('تعذّر الاتصال بـ Telegram API', false);
    }
  }
}

/* ---------- استلام منتج جديد ---------- */
function plBindDlg() {
  if (PL.dlgBound) return; PL.dlgBound = true;
  dlg.addEventListener('close', () => dlg.classList.remove('pl-dlg'));
}
function plStrip(kind, imgs, canEdit, draft) {
  const full = imgs.length >= PL_MAX_IMG;
  return '<div class="pl-strip" id="pl_strip_' + kind + '">' + imgs.map((x, i) => '<div class="pl-im">' +
    (draft ? '<img src="' + x.url + '" alt="">' : '<img data-pp="' + esc(x.path) + '" data-open="' + esc(x.path) + '" alt="">') +
    (canEdit ? '<button type="button" class="pl-x" ' + (draft ? 'data-rmd="' + i + '"' : 'data-rmi="' + x.id + '"') + ' title="حذف">×</button>' : '') +
    (!draft ? '<button type="button" class="pl-dl" data-dl="' + esc(x.path) + '" title="تنزيل">⬇</button>' : '') + '</div>').join('') +
    (canEdit && !full ? '<button type="button" class="pl-add" data-up="' + kind + '">＋<span>صورة</span></button>' : '') + '</div>' +
    (canEdit ? '<input type="file" id="pl_file_' + kind + '" accept="image/*" multiple style="display:none">' : '');
}
function plSrcFields(p) {
  p = p || {}; const sups = [...new Set(plRows().map(x => (x.supplier || '').trim()).filter(Boolean))].sort();
  return '<label>اسم المنتج *<input id="pi_title" maxlength="160" value="' + esc(p.title || '') + '" data-auto></label>' +
    '<div class="row"><label>المورد<input id="pi_sup" list="pi_sups" maxlength="100" value="' + esc(p.supplier || '') + '" data-auto><datalist id="pi_sups">' + sups.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></label>' +
    '<label>سعر الشراء (' + esc(plCur()) + ')<input id="pi_cost" inputmode="decimal" value="' + esc(p.source_price == null ? '' : p.source_price) + '" data-auto></label></div>' +
    '<label>رابط المنتج عند المورد<input id="pi_url" dir="ltr" placeholder="https://" value="' + esc(p.supplier_url || '') + '" data-auto></label>' +
    '<label>الوصف كما هو من المورد<textarea id="pi_raw" rows="5" placeholder="الصق الوصف كما وصلك بدون تعديل — سينتقل تلقائياً لمرحلة التصميم للتعديل عليه" data-auto>' + esc(p.raw_desc || '') + '</textarea></label>' +
    '<label>الأولوية<select id="pi_prio" data-auto><option value="normal"' + (p.priority !== 'high' ? ' selected' : '') + '>عادي</option><option value="high"' + (p.priority === 'high' ? ' selected' : '') + '>🔥 عاجل</option></select></label>';
}
function plReadSrc() {
  return { title: $('pi_title').value.trim(), supplier: $('pi_sup').value.trim() || null, supplier_url: $('pi_url').value.trim() || null, source_price: plNum($('pi_cost').value), raw_desc: $('pi_raw').value.trim() || null, priority: $('pi_prio').value };
}
function plNew() {
  PL.draft = { id: plId(), files: [] }; PL.cur = null;
  dlg.classList.add('pl-dlg'); plBindDlg();
  dlg.innerHTML = '<h2>📥 منتج / منشور جديد من المورد</h2><div class="m" style="margin-bottom:12px">سجّل المنتج كما وصلك: الصور والوصف وسعر الشراء، وعند إرساله للتصميم ستُعبّأ الخانات تلقائياً مع حفظ السجل التاريخي.</div>' + plSrcFields(null) +
    '<div class="pl-box"><b>📷 صور المورد (حتى ' + PL_MAX_IMG + ')</b><div id="pl_dr"></div></div>' +
    '<div class="row dact"><button class="s" id="pn_x">إلغاء</button><button class="s" id="pn_save">💾 حفظ كمسودة</button><button class="p s" id="pn_send">حفظ وإرسال للتصميم ➜</button></div>';
  plPaintDraft(); $('pn_x').onclick = () => dlg.close();
  $('pn_save').onclick = () => plCreate(false); $('pn_send').onclick = () => plCreate(true);
  dlg.showModal();
}
function plPaintDraft() {
  const el = $('pl_dr'); if (!el) return;
  el.innerHTML = plStrip('source', PL.draft.files, true, true);
  const inp = $('pl_file_source');
  el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => inp.click());
  inp.onchange = async () => {
    for (const f of [...inp.files].slice(0, PL_MAX_IMG - PL.draft.files.length)) { try { const b = await plPrep(f); PL.draft.files.push({ blob: b, url: URL.createObjectURL(b) }); } catch (e) { toast(e.message, false); } }
    plPaintDraft();
  };
  el.querySelectorAll('[data-rmd]').forEach(b => b.onclick = () => { const x = PL.draft.files.splice(+b.dataset.rmd, 1)[0]; if (x) URL.revokeObjectURL(x.url); plPaintDraft(); });
}
async function plCreate(send) {
  const v = plReadSrc(); if (!v.title) return toast('اكتب اسم المنتج', false);
  if (send && !PL.draft.files.length && !confirm('لا توجد صور للمنتج. هل تريد الإرسال للتصميم بدون صور؟')) return;
  const bs = [$('pn_save'), $('pn_send')]; bs.forEach(b => plBusyBtn(b, true));
  const now = plNow();
  // عند الإرسال المباشر للتصميم نعبئ خانات التصميم تلقائياً من بيانات الاستلام
  const prefillDesign = send ? { content_title: v.title, content_desc: v.raw_desc || v.title } : {};
  const row = Object.assign({ id: PL.draft.id, company_id: plCo() || DEFAULT_COMPANY, stage: send ? 'design' : 'intake', created_by: S.me.email, to_design_at: send ? now : null }, v, prefillDesign);
  const { error } = await sb.from('pl_products').insert(row);
  if (error) { bs.forEach(b => plBusyBtn(b, false)); return toast(error.message, false); }
  const createdProduct = Object.assign({ created_at: now, updated_at: now }, row);
  PL.rows.unshift(createdProduct);
  plSaveCache();
  await plAppendStageHistory(createdProduct, {
    stage: send ? 'design' : 'intake',
    label: send ? '📥 استلام المنتج وتحويله المباشر للتصميم (مع التعبئة التلقائية)' : '📥 تسجيل المنتج في مرحلة الاستلام',
    title_snapshot: v.title,
    desc_snapshot: v.raw_desc
  });
  let n = 0, fail = 0;
  for (const f of PL.draft.files) { toast('⏳ رفع الصور ' + (++n) + '/' + PL.draft.files.length); const r = await plUploadBlob(row.id, 'source', f.blob, n); if (r.err) fail++; }
  if (fail) toast('تعذّر رفع ' + fail + ' صورة، يمكنك إضافتها لاحقاً', false); else toast('✅ تم حفظ المنتج' + (send ? ' وتعبئة خانات التصميم تلقائياً' : ''));
  dlg.close(); render();
}

/* ---------- نافذة المنتج ---------- */
function plOpen(id) { PL.cur = id; PL.draft = null; dlg.classList.add('pl-dlg'); plBindDlg(); plDlgRender(); if (!dlg.open) dlg.showModal(); }
const plSteps = p => { const k = PL_STAGES.findIndex(x => x.id === p.stage); return '<div class="pl-steps">' + PL_STAGES.map((s, i) => '<div class="pl-step' + (i < k ? ' dn' : i === k ? ' on' : '') + '"><i>' + (i < k ? '✓' : i + 1) + '</i><span>' + s.n + '</span></div>').join('') + '</div>'; };
function plClaimBar(p, field) {
  const by = p[field];
  if (!by) return '<div class="pl-claim free">🙋 لا أحد يتولى هذه المرحلة <button class="p s" data-claim="' + field + '">أنا أتولّاها</button></div>';
  if (same(by, S.me.email)) return '<div class="pl-claim mine">✅ أنت المسؤول عن هذه المرحلة <button class="s" data-rel="' + field + '">تخلّي</button></div>';
  return '<div class="pl-claim">👤 المسؤول: <b>' + esc(nm(by)) + '</b> <button class="s" data-claim="' + field + '">استلام منه</button></div>';
}
function plSrcRO(p) {
  const kv = (l, v) => v ? '<div class="pl-kv"><span>' + l + '</span><b>' + v + '</b></div>' : '';
  return '<details class="pl-box"><summary>🏭 بيانات مرحلة الاستلام الأصلية (محفوظة في السجل)</summary>' +
    kv('اسم المنتج الأصلي', esc(p.title || '')) +
    kv('المورد', esc(p.supplier || '')) + kv('الرابط', p.supplier_url ? '<a href="' + esc(p.supplier_url) + '" target="_blank" rel="noopener" dir="ltr">' + esc(p.supplier_url) + '</a>' : '') +
    (plCanCost(p) && p.source_price != null ? kv('سعر الشراء', plMoney(p.source_price) + ' ' + esc(plCur())) : '') +
    (p.raw_desc ? '<div class="pl-raw">' + esc(p.raw_desc) + '</div><div class="row" style="gap:6px"><button class="s" data-cp="raw">📋 نسخ الوصف الأصلي</button>' + (p.stage === 'design' ? '<button class="s" id="pd_refill_src">🔄 إعادة التعبئة من بيانات الاستلام</button>' : '') + '</div>' : '') +
    (plImgsOf(p.id, 'source').length ? plStrip('source', plImgsOf(p.id, 'source'), false) : '<div class="m">لا توجد صور من المورد</div>') + '</details>';
}
function plContentRO(p) {
  const row = (l, v, k) => v ? '<div class="pl-kv col"><span>' + l + ' <button class="s pl-cpb" data-cp="' + k + '">📋 نسخ</button></span><div class="pl-raw">' + esc(v) + '</div></div>' : '';
  return '<div class="pl-box"><div class="bar" style="margin-bottom:8px"><b>📝 المحتوى الجاهز للنشر</b><button type="button" class="p s" id="pl_share_all">📤 مشاركة المنتج مع الصور</button></div>' +
    row('العنوان', p.content_title || p.title, 'title') + row('الوصف', p.content_desc || p.raw_desc, 'desc') + row('الهاشتاقات', p.hashtags, 'tags') +
    (p.sell_price != null ? '<div class="pl-kv"><span>سعر البيع</span><b>' + plMoney(p.sell_price) + ' ' + esc(plCur()) + (plCanCost(p) && p.source_price != null ? ' <small class="m">(هامش ' + plMoney(p.sell_price - p.source_price) + ')</small>' : '') + '</b></div>' : '') + '</div>';
}
function plPostRow(x) {
  const pl = plPlat(x.platform), mx = pl.max;
  const canAutoApi = x.platform === 'facebook' || x.platform === 'telegram';
  return '<div class="pl-post ' + x.status + '" data-post="' + x.id + '">' +
    '<div class="bar" style="flex-wrap:wrap;gap:6px">' +
      '<b>' + pl.ic + ' ' + esc(pl.n) + '</b>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap">' +
        '<button type="button" class="p s" data-pshare="' + x.id + '" title="مشاركة النص والصور مباشرة إلى المنصة">📤 مشاركة / نشر الآن</button>' +
        (canAutoApi ? '<button type="button" class="s" data-pauto="' + x.id + '" title="نشر تلقائي عبر API">' + (x.platform === 'facebook' ? '📘 نشر مباشر فيسبوك' : '✈️ نشر مباشر تيليجرام') + '</button>' : '') +
        '<select data-pst="' + x.id + '" style="width:auto">' + [['pending', '⏳ بانتظار النشر'], ['published', '✅ تم النشر'], ['skipped', '⏭ تخطّي']].map(([k, l]) => '<option value="' + k + '"' + (x.status === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '</div>' +
    '</div>' +
    '<div class="m">' + esc(pl.tip) + '</div>' +
    '<textarea rows="4" data-pcap="' + x.id + '" placeholder="نص المنشور لهذه المنصة">' + esc(x.caption || '') + '</textarea>' +
    '<div class="m pl-cnt" data-pcnt="' + x.id + '">' + plCnt(x.caption, mx) + '</div>' +
    '<div class="row"><input data-purl="' + x.id + '" dir="ltr" placeholder="رابط المنشور بعد النشر (اختياري)" value="' + esc(x.url || '') + '"><button class="s" data-pcopy="' + x.id + '">📋 نسخ النص</button></div>' +
    (x.status === 'published' ? '<div class="m">نُشر بواسطة ' + esc(nm(x.posted_by)) + ' · ' + ago(x.posted_at) + '</div>' : '') + '</div>';
}
const plCnt = (t, mx) => { const n = String(t || '').length; return n + (mx ? ' / ' + mx + ' حرف' : ' حرف') + (mx && n > mx ? ' ⚠ يتجاوز الحد' : ''); };
function plPlatBlock(p) {
  const posts = plPostsOf(p.id);
  return '<div class="pl-box"><b>📣 المنصات (اختر أين سيُنشر لتوليد النص ومشاركته)</b><div class="pl-chips">' + PL_PLATFORMS.map(pl => '<button type="button" class="pl-pc' + (posts.some(x => x.platform === pl.id) ? ' on' : '') + '" data-tgl="' + pl.id + '">' + pl.ic + ' ' + esc(pl.n) + '</button>').join('') + '</div></div>' +
    (posts.length ? posts.map(plPostRow).join('') : '<div class="m" style="text-align:center;padding:10px">اختر منصة واحدة على الأقل لتجهيز نص المنشور ومشاركته</div>');
}
function plDlgRender() {
  const p = plProd(PL.cur); if (!p) { dlg.close(); return; }
  const canDel = isAdmin() || (S.me && same(p.created_by, S.me.email));
  let h = '<h2>' + plStage(p.stage).ic + ' ' + esc(p.content_title || p.title) + (p.priority === 'high' && p.stage !== 'done' ? ' <span class="chip late">🔥 عاجل</span>' : '') + '</h2>' + plSteps(p) +
    '<div class="m pl-meta">أضافه ' + esc(nm(p.created_by)) + ' · ' + ago(p.created_at) + (p.stage !== 'done' ? ' · في هذه المرحلة منذ ' + plDur(plAgeH(p)) : '') + '</div>' +
    (p.return_note && p.stage !== 'done' ? '<div class="pl-note">↩ ملاحظة الإرجاع: ' + esc(p.return_note) + '</div>' : '');
  let acts = '';
  if (p.stage === 'intake') {
    h += plSrcFields(p) + '<div class="pl-box"><b>📷 صور المورد (حتى ' + PL_MAX_IMG + ')</b>' + plStrip('source', plImgsOf(p.id, 'source'), true) + '</div>' + plHistoryBoxHtml(p) + '<div class="m" id="pl_saved"></div>';
    acts = '<button class="p s" data-act="send">إرسال للتصميم (مع تعبئة تلقائية) ➜</button><button class="s" data-act="save">💾 حفظ</button>';
  } else if (p.stage === 'design') {
    // التعبئة التلقائية من مرحلة الاستلام إذا كانت خانات التصميم فارغة
    const autoTitle = p.content_title || p.title || '';
    const autoDesc = p.content_desc || p.raw_desc || '';
    const autoPrice = p.sell_price != null ? p.sell_price : (p.source_price != null ? p.source_price : '');
    h += plClaimBar(p, 'design_by') +
      '<div class="pl-prefill-banner"><span>✨ الخانات معبّأة تلقائياً من مرحلة الاستلام — عدّل عليها مباشرة، وستبقى بيانات الاستلام الأصلية محفوظة في السجل التاريخي.</span><button type="button" class="s" id="pd_gen_tags" style="font-size:11.5px;padding:3px 9px">✨ توليد هاشتاقات</button></div>' +
      '<div class="pl-box"><b>🎨 المحتوى الاحترافي للتصميم والنشر</b><label>عنوان المنتج للنشر<input id="pd_title" maxlength="160" placeholder="' + esc(p.title) + '" value="' + esc(autoTitle) + '" data-auto></label>' +
      '<label>الوصف التسويقي<textarea id="pd_desc" rows="7" placeholder="اكتب الوصف بأسلوب احترافي جذّاب" data-auto>' + esc(autoDesc) + '</textarea></label>' +
      '<div class="row"><label>الهاشتاقات<input id="pd_tags" placeholder="#عروض #تسوق" value="' + esc(p.hashtags || '') + '" data-auto></label><label>سعر البيع (' + esc(plCur()) + ')<input id="pd_price" inputmode="decimal" value="' + esc(autoPrice) + '" data-auto></label></div></div>' +
      '<div class="pl-box"><b>🖼 الصور بعد إعادة التصميم (حتى ' + PL_MAX_IMG + ')</b>' + plStrip('design', plImgsOf(p.id, 'design'), true) + '</div>' +
      plSrcRO(p) +
      plHistoryBoxHtml(p) +
      '<div class="m" id="pl_saved"></div>';
    acts = '<button class="p s" data-act="topub">جاهز للنشر ➜</button><button class="s" data-act="save">💾 حفظ المسودة</button><button class="s" data-act="back">↩ إرجاع للاستلام</button>';
  } else if (p.stage === 'publish') {
    h += plClaimBar(p, 'publish_by') + plContentRO(p) +
      '<div class="pl-box"><b>🖼 الصور الجاهزة للنشر</b>' + (plImgsOf(p.id, 'design').length ? plStrip('design', plImgsOf(p.id, 'design'), false) + '<button class="s" data-act="dlall">⬇ تنزيل كل الصور</button>' : plImgsOf(p.id, 'source').length ? plStrip('source', plImgsOf(p.id, 'source'), false) + '<button class="s" data-act="dlall">⬇ تنزيل صور المورد</button>' : '<div class="m">لا توجد صور مصمّمة</div>') + '<div class="m">ستُحذف الصور تلقائياً من التخزين بعد إنهاء النشر.</div></div>' +
      '<div id="pl_plat">' + plPlatBlock(p) + '</div>' +
      plSrcRO(p) +
      plHistoryBoxHtml(p);
    acts = '<button class="p s" data-act="finish">✅ إنهاء النشر وحذف الصور</button><button class="s" data-act="back">↩ إرجاع للتصميم</button>';
  } else {
    const ps = plPostsOf(p.id);
    h += plContentRO(p) + '<div class="pl-box"><b>📣 ما تم نشره</b>' + (ps.length ? ps.map(x => { const pl = plPlat(x.platform); return '<div class="pl-kv"><span>' + pl.ic + ' ' + esc(pl.n) + '</span><b>' + (x.status === 'published' ? '✅ ' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">فتح المنشور</a>' : 'تم') + ' <small class="m">' + esc(nm(x.posted_by)) + ' · ' + ago(x.posted_at) + '</small>' : '⏭ تم التخطي') + '</b></div>'; }).join('') : '<div class="m">لا توجد منصات مسجلة</div>') + '</div>' +
      plHistoryBoxHtml(p) +
      '<div class="m">🧹 ' + (p.images_purged_at ? 'تم حذف الصور بعد النشر لتوفير المساحة.' : 'جارٍ حذف الصور…') + '</div>';
    acts = isAdmin() ? '<button class="s" data-act="reopen">🔄 إعادة فتح (للتصميم)</button>' : '';
  }
  dlg.innerHTML = h + '<div class="row dact"><button class="s" data-act="close">إغلاق</button>' + acts + (canDel ? '<button class="dng s" data-act="del">🗑 حذف</button>' : '') + '</div>';
  plBindProduct(p);
}

// يقرأ حقول المرحلة الحالية ويحفظها (يُستدعى قبل أي انتقال وعند الحفظ)
async function plSaveFields(p, quiet, auto) {
  let patch = null;
  if (p.stage === 'intake' && $('pi_title')) {
    patch = plReadSrc();
    if (!patch.title) { if (!auto) toast('اكتب اسم المنتج', false); return false; }
  } else if (p.stage === 'design' && $('pd_desc')) {
    patch = {
      content_title: $('pd_title').value.trim() || p.title || null,
      content_desc: $('pd_desc').value.trim() || null,
      hashtags: $('pd_tags').value.trim() || null,
      sell_price: plNum($('pd_price').value)
    };
  }
  if (!patch) return true;
  const { error } = await sb.from('pl_products').update(patch).eq('id', p.id);
  if (error) { if (!auto) toast(error.message, false); return false; }
  Object.assign(p, patch);
  plSaveCache();
  if (!quiet) toast('💾 تم الحفظ');
  return true;
}

async function plPatch(p, patch) {
  const { error } = await sb.from('pl_products').update(patch).eq('id', p.id);
  if (error) { toast(error.message, false); return false; }
  Object.assign(p, patch);
  plSaveCache();
  return true;
}

function plBindProduct(p) {
  const root = dlg;
  plHydrate(root);
  // حفظ تلقائي هادئ للمسودة أثناء الكتابة
  let tm = 0;
  root.querySelectorAll('[data-auto]').forEach(el => el.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(async () => { if (await plSaveFields(p, true, true) && $('pl_saved')) $('pl_saved').textContent = '✓ تم الحفظ تلقائياً'; }, 1200); }));
  root.querySelectorAll('[data-claim]').forEach(b => b.onclick = async () => { if (await plPatch(p, { [b.dataset.claim]: S.me.email })) { toast('✅ أصبحت مسؤولاً عن هذه المرحلة'); plSaveFields(p, true, true); plDlgRender(); } });
  root.querySelectorAll('[data-rel]').forEach(b => b.onclick = async () => { if (await plPatch(p, { [b.dataset.rel]: null })) plDlgRender(); });
  root.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => plCopy({ raw: p.raw_desc, title: p.content_title || p.title, desc: p.content_desc || p.raw_desc, tags: p.hashtags }[b.dataset.cp] || ''));
  if ($('pl_share_all')) $('pl_share_all').onclick = () => plQuickShareProduct(p);
  if ($('pd_refill_src')) {
    $('pd_refill_src').onclick = () => {
      if ($('pd_title')) $('pd_title').value = p.title || '';
      if ($('pd_desc')) $('pd_desc').value = p.raw_desc || '';
      if ($('pd_price') && p.source_price != null && !$('pd_price').value) $('pd_price').value = p.source_price;
      plSaveFields(p, false, false);
      toast('🔄 تمت استعادة العنوان والوصف من مرحلة الاستلام ✓');
    };
  }
  if ($('pd_gen_tags')) {
    $('pd_gen_tags').onclick = () => {
      const words = String(($('pd_title') ? $('pd_title').value : p.title) || '').trim().split(/\s+/).filter(w => w.length >= 3).slice(0, 5).map(w => '#' + w.replace(/[^\u0600-\u06FFa-zA-Z0-9_]/g, ''));
      const storeTag = '#' + String(plCo() || 'متجرك').trim().replace(/\s+/g, '_');
      const generated = [...new Set([...words, storeTag, '#عروض', '#جديد', '#تسوق'])].join(' ');
      if ($('pd_tags')) {
        $('pd_tags').value = ($('pd_tags').value ? $('pd_tags').value + ' ' : '') + generated;
        plSaveFields(p, true, true);
        toast('✨ تم توليد الهاشتاقات');
      }
    };
  }
  // استعادة نص من السجل التاريخي للمراحل
  const histList = plBuildCombinedHistory(p);
  root.querySelectorAll('[data-hrest]').forEach(b => {
    b.onclick = () => {
      const item = histList[+b.dataset.hrest];
      if (!item) return;
      if ($('pd_title') && item.title_snapshot) $('pd_title').value = item.title_snapshot;
      if ($('pd_desc') && item.desc_snapshot) $('pd_desc').value = item.desc_snapshot;
      plSaveFields(p, false, false);
      toast('🔄 تمت استعادة النص من السجل التاريخي ✓');
    };
  });
  plBindStrips(p);
  root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => plAct(p, b.dataset.act, b));
  if (p.stage === 'publish') plBindPlat(p);
}

function plBindStrips(p) {
  const root = dlg;
  root.querySelectorAll('[data-open]').forEach(i => i.onclick = async () => { const u = await plSignOne(i.dataset.open); if (u) window.open(u, '_blank'); });
  root.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => plDownload(b.dataset.dl, (p.title || 'image') + '.jpg'));
  root.querySelectorAll('[data-rmi]').forEach(b => b.onclick = async () => {
    const im = PL.imgs.find(x => x.id === b.dataset.rmi); if (!im || !confirm('حذف هذه الصورة؟')) return;
    if (!await plDelFiles([im.path])) return toast('تعذّر حذف الصورة', false);
    await sb.from('pl_images').delete().eq('id', im.id); PL.imgs = PL.imgs.filter(x => x.id !== im.id); plSaveCache(); plRepaintStrip(p, im.kind);
  });
  ['source', 'design'].forEach(kind => {
    const inp = $('pl_file_' + kind); if (!inp) return;
    root.querySelectorAll('[data-up="' + kind + '"]').forEach(b => b.onclick = () => inp.click());
    inp.onchange = async () => {
      const files = [...inp.files], room = PL_MAX_IMG - plImgsOf(p.id, kind).length; let n = 0, fail = 0;
      for (const f of files.slice(0, room)) {
        toast('⏳ رفع الصورة ' + (++n) + '/' + Math.min(files.length, room));
        try { const b = await plPrep(f), r = await plUploadBlob(p.id, kind, b, plImgsOf(p.id, kind).length + 1); if (r.err) { fail++; toast(r.err, false); } } catch (e) { fail++; toast(e.message, false); }
      }
      if (files.length > room) toast('الحد الأقصى ' + PL_MAX_IMG + ' صور', false); else if (!fail) toast('✅ تم رفع الصور');
      plRepaintStrip(p, kind);
    };
  });
}

function plRepaintStrip(p, kind) {
  const el = $('pl_strip_' + kind); if (!el) return;
  const wrap = document.createElement('div'); wrap.innerHTML = plStrip(kind, plImgsOf(p.id, kind), true);
  const old = $('pl_file_' + kind); if (old) old.remove();
  el.replaceWith(...wrap.childNodes); plBindStrips(p); plHydrate(dlg);
}

function plBindPlat(p) {
  const root = $('pl_plat'); if (!root) return;
  root.querySelectorAll('[data-tgl]').forEach(b => b.onclick = () => plTogglePlat(p, b.dataset.tgl));
  root.querySelectorAll('[data-pst]').forEach(s => s.onchange = () => plSetStatus(p, s.dataset.pst, s.value));
  root.querySelectorAll('[data-pshare]').forEach(b => b.onclick = () => {
    const x = PL.posts.find(y => y.id === b.dataset.pshare);
    if (x) plSharePostWithMedia(p, x);
  });
  root.querySelectorAll('[data-pauto]').forEach(b => b.onclick = () => {
    const x = PL.posts.find(y => y.id === b.dataset.pauto);
    if (x) plAutoPublishApi(p, x, b);
  });
  root.querySelectorAll('[data-pcap]').forEach(t => {
    const x = PL.posts.find(y => y.id === t.dataset.pcap), pl = plPlat(x.platform);
    t.oninput = () => { const c = root.querySelector('[data-pcnt="' + x.id + '"]'); if (c) c.textContent = plCnt(t.value, pl.max); };
    t.onchange = async () => { x.caption = t.value; await sb.from('pl_posts').update({ caption: t.value }).eq('id', x.id); plSaveCache(); };
  });
  root.querySelectorAll('[data-purl]').forEach(i => i.onchange = async () => { const x = PL.posts.find(y => y.id === i.dataset.purl); x.url = i.value.trim() || null; await sb.from('pl_posts').update({ url: x.url }).eq('id', x.id); plSaveCache(); });
  root.querySelectorAll('[data-pcopy]').forEach(b => b.onclick = () => { const t = root.querySelector('[data-pcap="' + b.dataset.pcopy + '"]'); plCopy(t ? t.value : ''); });
}

function plDefaultCaption(p, plat) {
  const pl = plPlat(plat); let t = [p.content_title || p.title, p.content_desc || p.raw_desc].filter(Boolean).join('\n\n');
  if (p.sell_price != null) t += '\n\n💰 السعر: ' + plMoney(p.sell_price) + ' ' + plCur();
  if (p.hashtags) t += '\n\n' + p.hashtags;
  return pl.max && t.length > pl.max ? t.slice(0, pl.max - 1) + '…' : t;
}

async function plTogglePlat(p, plat) {
  const ex = PL.posts.find(x => x.product_id === p.id && x.platform === plat);
  if (ex) {
    if (ex.status === 'published' && !confirm('هذه المنصة معلّمة «تم النشر». إزالتها من القائمة؟')) return;
    await sb.from('pl_posts').delete().eq('id', ex.id); PL.posts = PL.posts.filter(x => x.id !== ex.id);
  } else {
    const row = { id: plId(), product_id: p.id, platform: plat, status: 'pending', caption: plDefaultCaption(p, plat) };
    const { error } = await sb.from('pl_posts').insert(row); if (error) return toast(error.message, false);
    PL.posts.push(row);
  }
  plSaveCache();
  $('pl_plat').innerHTML = plPlatBlock(p); plBindPlat(p);
}

async function plSetStatus(p, id, status) {
  const x = PL.posts.find(y => y.id === id); if (!x) return;
  const patch = { status, posted_by: status === 'published' ? S.me.email : null, posted_at: status === 'published' ? plNow() : null };
  const t = dlg.querySelector('[data-pcap="' + id + '"]'), u = dlg.querySelector('[data-purl="' + id + '"]');
  if (t) patch.caption = t.value; if (u) patch.url = u.value.trim() || null;
  const { error } = await sb.from('pl_posts').update(patch).eq('id', id); if (error) return toast(error.message, false);
  Object.assign(x, patch);
  plSaveCache();
  if (!p.publish_by) plPatch(p, { publish_by: S.me.email });
  if ($('pl_plat')) { $('pl_plat').innerHTML = plPlatBlock(p); plBindPlat(p); }
  const ps = plPostsOf(p.id);
  if (ps.length && ps.every(y => y.status !== 'pending') && ps.some(y => y.status === 'published') && confirm('تم الانتهاء من كل المنصات المحددة.\nهل تنهي المنتج الآن وتحذف صوره من التخزين؟')) plFinish(p);
}

async function plFinish(p) {
  const ps = plPostsOf(p.id);
  if (!ps.length) return toast('اختر منصة واحدة على الأقل', false);
  const pend = ps.filter(x => x.status === 'pending');
  if (pend.length) return toast('لا تزال هناك منصات بانتظار النشر: ' + pend.map(x => plPlat(x.platform).n).join('، '), false);
  if (!ps.some(x => x.status === 'published')) return toast('كل المنصات «تخطّي» — علّم منصة واحدة على الأقل كمنشورة', false);
  if (!await plPatch(p, { stage: 'done', published_at: plNow(), publish_by: p.publish_by || S.me.email })) return;
  await plAppendStageHistory(p, {
    stage: 'done',
    label: '✅ إتمام النشر على المنصات (' + ps.filter(x => x.status === 'published').map(x => plPlat(x.platform).n).join('، ') + ')'
  });
  const ok = await plPurge(p.id);
  toast(ok ? '✅ تم إنهاء النشر وحذف الصور' : '✅ تم إنهاء النشر (سيُعاد حذف الصور تلقائياً)'); dlg.close(); render();
}

async function plAct(p, act, btn) {
  if (act === 'close') return dlg.close();
  if (act === 'save') {
    plBusyBtn(btn, true);
    if (await plSaveFields(p)) {
      await plAppendStageHistory(p, {
        stage: p.stage,
        label: '💾 حفظ تعديلات في مرحلة ' + plStage(p.stage).n
      });
    }
    plBusyBtn(btn, false);
    return;
  }
  if (act === 'dlall') {
    const L = plImgsOf(p.id, 'design').length ? plImgsOf(p.id, 'design') : plImgsOf(p.id, 'source');
    for (let i = 0; i < L.length; i++) await plDownload(L[i].path, (p.title || 'image') + '-' + (i + 1) + '.jpg');
    return;
  }
  if (act === 'del') {
    if (!confirm('حذف المنتج «' + p.title + '» نهائياً مع صوره ومنشوراته؟')) return;
    plBusyBtn(btn, true); const L = plImgsOf(p.id);
    if (L.length && !await plDelFiles(L.map(x => x.path))) { plBusyBtn(btn, false); return toast('تعذّر حذف الصور، حاول مجدداً', false); }
    const { error } = await sb.from('pl_products').delete().eq('id', p.id); if (error) { plBusyBtn(btn, false); return toast(error.message, false); }
    PL.rows = PL.rows.filter(x => x.id !== p.id); PL.posts = PL.posts.filter(x => x.product_id !== p.id); PL.imgs = PL.imgs.filter(x => x.product_id !== p.id);
    plSaveCache();
    toast('🗑 تم حذف المنتج'); dlg.close(); return render();
  }
  if (act === 'reopen') {
    if (!confirm('إعادة فتح المنتج لمرحلة التصميم؟ الصور القديمة محذوفة وستحتاج رفع صور جديدة.')) return;
    if (await plPatch(p, { stage: 'design', published_at: null })) {
      await plAppendStageHistory(p, { stage: 'design', label: '🔄 إعادة فتح المنتج لمرحلة التصميم' });
      toast('تمت إعادة الفتح'); plDlgRender(); render();
    }
    return;
  }
  if (act === 'finish') return plFinish(p);
  plBusyBtn(btn, true);
  const stop = () => plBusyBtn(btn, false);
  if (!await plSaveFields(p, true)) return stop();
  if (act === 'send') {
    if (!plImgsOf(p.id, 'source').length && !confirm('لا توجد صور للمنتج. هل تريد الإرسال للتصميم بدون صور؟')) return stop();
    // تعبئة تلقائية لخانات التصميم من مرحلة الاستلام مع حفظ نسخة الاستلام في السجل التاريخي
    const prefillPatch = {
      stage: 'design',
      to_design_at: plNow(),
      design_by: null,
      return_note: null,
      content_title: p.content_title || p.title || null,
      content_desc: p.content_desc || p.raw_desc || null
    };
    if (await plPatch(p, prefillPatch)) {
      await plAppendStageHistory(p, {
        stage: 'design',
        label: '📤 انتقال من الاستلام إلى التصميم (مع التعبئة التلقائية للخانات)',
        title_snapshot: p.title,
        desc_snapshot: p.raw_desc
      });
      toast('📤 أُرسل للتصميم وتمت تعبئة الخانات تلقائياً'); dlg.close(); render();
    } else stop();
  } else if (act === 'topub') {
    if (!p.content_desc) { toast('اكتب الوصف التسويقي أولاً', false); return stop(); }
    if (!plImgsOf(p.id, 'design').length && !confirm('لا توجد صور مصمّمة. هل تريد المتابعة للنشر بدون صور؟')) return stop();
    if (await plPatch(p, { stage: 'publish', design_done_at: plNow(), design_by: p.design_by || S.me.email, publish_by: null, return_note: null, content_title: p.content_title || p.title })) {
      await plAppendStageHistory(p, {
        stage: 'publish',
        label: '📣 انتقال من التصميم إلى جاهز للنشر',
        title_snapshot: p.content_title || p.title,
        desc_snapshot: p.content_desc,
        hashtags_snapshot: p.hashtags
      });
      toast('📣 جاهز للنشر'); dlg.close(); render();
    } else stop();
  } else if (act === 'back') {
    const note = prompt('سبب الإرجاع (يظهر للزميل ويُحفظ في السجل التاريخي):', ''); if (note === null) return stop();
    const to = p.stage === 'design' ? 'intake' : 'design';
    if (await plPatch(p, { stage: to, return_note: note.trim() || null, [to === 'intake' ? 'design_by' : 'publish_by']: null })) {
      await plAppendStageHistory(p, {
        stage: to,
        label: '↩ إرجاع إلى مرحلة ' + plStage(to).n,
        note: note.trim() || ''
      });
      toast('↩ تم الإرجاع وحُفظ في السجل'); dlg.close(); render();
    } else stop();
  }
}
