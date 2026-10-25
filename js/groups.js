// ===== القائمة الفرعية للمهمة (checklist) مع تحديد الفترة الزمنية وحساب التأخير لكل بند فرعي =====
function parseSubtaskMeta(rawItemOrText) {
  const rawText = typeof rawItemOrText === 'string' ? rawItemOrText : String((rawItemOrText && rawItemOrText.text) || '');
  const isDone = typeof rawItemOrText === 'object' && rawItemOrText ? !!rawItemOrText.done : false;
  let cleanText = rawText;
  let from = '', due = '', days = 0;

  const m = rawText.match(/\s*⟦sub:(\{.*?\})⟧\s*$/);
  if (m) {
    cleanText = rawText.slice(0, m.index).trim();
    try {
      const j = JSON.parse(m[1]);
      from = j.from || '';
      due = j.due || '';
      days = +j.days || 0;
    } catch (e) {}
  }

  if (!days && from && due && due >= from) {
    days = Math.max(1, Math.round((new Date(due) - new Date(from)) / 864e5));
  }
  const td = today();
  const isLate = !isDone && !!due && due < td;
  const lateDays = isLate ? Math.max(1, Math.round((new Date(td) - new Date(due)) / 864e5)) : 0;
  const remDays = (!isDone && !isLate && due) ? daysTo(due) : null;

  let badgeHtml = '';
  if (from || due || days) {
    const periodTxt = (from && due) ? (from.slice(5) + ' ⬅ ' + due.slice(5)) : (due ? ('حتى ' + due.slice(5)) : ('من ' + from.slice(5)));
    const daysTxt = days ? (' (' + (days === 1 ? 'يوم' : days === 2 ? 'يومان' : days + ' أيام') + ')') : '';
    if (isDone) {
      badgeHtml = '<span class="chip ok" style="font-size:11px;padding:1px 6px">📅 ' + esc(periodTxt + daysTxt) + ' ✓</span>';
    } else if (isLate) {
      badgeHtml = '<span class="chip late" style="font-size:11px;padding:1px 6px">🚨 متأخرة ' + lateDays + (lateDays === 1 ? ' يوم' : ' أيام') + ' (' + esc(periodTxt) + ')</span>';
    } else if (remDays === 0) {
      badgeHtml = '<span class="chip soon" style="font-size:11px;padding:1px 6px">🔥 اليوم (' + esc(periodTxt + daysTxt) + ')</span>';
    } else if (remDays === 1) {
      badgeHtml = '<span class="chip soon" style="font-size:11px;padding:1px 6px">⏱️ غداً (' + esc(periodTxt + daysTxt) + ')</span>';
    } else {
      badgeHtml = '<span class="chip" style="font-size:11px;padding:1px 6px">📅 ' + esc(periodTxt + daysTxt) + '</span>';
    }
  }

  return { cleanText, from, due, days, isLate, lateDays, remDays, badgeHtml };
}

function encodeSubtaskMeta(cleanText, from, due, days) {
  const base = String(cleanText || '').replace(/\s*⟦sub:\{.*?\}⟧\s*$/g, '').trim();
  const f = String(from || '').trim(), d = String(due || '').trim();
  let dy = +days || 0;
  if (!dy && f && d && d >= f) dy = Math.max(1, Math.round((new Date(d) - new Date(f)) / 864e5));
  if (!f && !d && !dy) return base;
  return base + ' ⟦sub:' + JSON.stringify({ from: f, due: d, days: dy || undefined }) + '⟧';
}

function hasLateSubtasks(tid) {
  const L = (S.items || []).filter(x => x.task_id === tid && !x.done);
  return L.some(x => parseSubtaskMeta(x).isLate);
}

async function ckLoad(tid) {
  const { data, error } = await sb.from('task_items').select('*').eq('task_id', tid).order('pos', { ascending: true }).order('created_at', { ascending: true });
  if (error || !data) {
    return (S.items || []).filter(x => x.task_id === tid);
  }
  return data;
}

const ckChip = t => {
  const s = (S.itemStats || {})[t.id];
  if (!s) return '';
  const lateSub = eff(t) !== 'done' && hasLateSubtasks(t.id);
  return '<span class="chip ' + (s[0] === s[1] ? 'ok' : lateSub ? 'late' : '') + '">☑ ' + s[0] + '/' + s[1] + (lateSub ? ' · ⚠️ فرعية متأخرة' : '') + '</span>';
};

const CK_HTML =
  '<div class="bar" style="margin-bottom:6px"><b>☑ قائمة المهام الفرعية (مع تحديد الفترة الزمنية لكل بند)</b> <span class="m" id="ck_pg"></span></div>' +
  '<div id="ck_list" style="margin:6px 0"></div>' +
  '<div style="background:var(--col);padding:10px;border-radius:10px;border:1px solid var(--line)">' +
    '<div class="row" style="gap:6px;margin-bottom:6px">' +
      '<input id="ck_in" placeholder="عنوان المهمة الفرعية / البند..." style="flex:2 1 180px">' +
      '<button class="p s" type="button" id="ck_add" style="white-space:nowrap">＋ إضافة بند فرعي</button>' +
    '</div>' +
    '<div class="row s" style="gap:6px;flex-wrap:wrap;align-items:center">' +
      '<span class="m" style="font-size:11.5px">⏱️ الفترة الزمنية للبند (اختياري):</span>' +
      '<label style="font-size:11.5px;display:flex;align-items:center;gap:4px;margin:0">من:<input type="date" id="ck_from" style="padding:4px 6px;font-size:12px;width:auto"></label>' +
      '<label style="font-size:11.5px;display:flex;align-items:center;gap:4px;margin:0">المدة (أيام):<input type="number" id="ck_days" min="1" max="365" placeholder="أيام" style="padding:4px 6px;font-size:12px;width:68px"></label>' +
      '<label style="font-size:11.5px;display:flex;align-items:center;gap:4px;margin:0">إلى (الاستحقاق):<input type="date" id="ck_due" style="padding:4px 6px;font-size:12px;width:auto"></label>' +
    '</div>' +
  '</div>';

function ckInit(t) {
  $('ck_box').innerHTML = CK_HTML;
  let items = [], draft = [], dirty = false;

  const syncDatesFromDays = () => {
    const dy = +($('ck_days').value || 0);
    if (dy > 0) {
      const f = $('ck_from').value || today();
      if (!$('ck_from').value) $('ck_from').value = f;
      const d = new Date(f + 'T00:00:00Z');
      if (!isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + dy);
        $('ck_due').value = d.toISOString().slice(0, 10);
      }
    }
  };
  if ($('ck_days')) $('ck_days').oninput = syncDatesFromDays;
  if ($('ck_from')) $('ck_from').onchange = () => { if (+($('ck_days').value || 0) > 0) syncDatesFromDays(); };

  const draw = () => {
    const L = t ? items : draft.map((x, i) => ({ id: 'd' + i, text: x, done: false }));
    const dn = L.filter(x => x.done).length;
    $('ck_pg').textContent = L.length ? '(' + dn + '/' + L.length + ' — ' + Math.round(100 * dn / L.length) + '%)' : '';
    $('ck_list').innerHTML = L.map(x => {
      const meta = parseSubtaskMeta(x);
      return '<div class="bar" style="padding:6px 8px;margin-bottom:4px;background:var(--col);border-radius:8px;gap:6px;flex-wrap:wrap">' +
        '<div style="display:flex;gap:8px;align-items:center;flex:1;min-width:180px">' +
          (t ? '<input type="checkbox" data-ck="' + x.id + '" ' + (x.done ? 'checked' : '') + ' style="width:18px;height:18px;flex:none;margin:0">' : '<span>•</span>') +
          '<span style="' + (x.done ? 'text-decoration:line-through;color:var(--mute)' : 'font-weight:600') + '">' + esc(meta.cleanText) + '</span>' +
        '</div>' +
        '<div class="row s" style="gap:4px;align-items:center">' +
          meta.badgeHtml +
          '<button class="s" type="button" data-cedit="' + x.id + '" title="تحديد أو تعديل الفترة الزمنية للبند الفرعي" style="padding:2px 7px;font-size:11.5px">📅 الفترة</button>' +
          '<button class="s dng" type="button" data-cd="' + x.id + '" style="padding:2px 7px;font-size:11.5px">✕</button>' +
        '</div>' +
      '</div>';
    }).join('') || '<div class="m" style="padding:4px 0">لا توجد مهام فرعية بعد.</div>';
    if (t && L.length && $('f_pg')) {
      $('f_pg').value = Math.round(100 * dn / L.length);
      $('pg_v').textContent = $('f_pg').value + '%';
      $('f_pg').parentElement.parentElement.style.display = 'none';
    }
  };

  $('ck_list').onchange = async e => {
    const id = e.target.dataset.ck; if (!id) return;
    const it = items.find(x => x.id === id), done = e.target.checked;
    if (!it) return;
    it.done = done; draw();
    const r = await sb.from('task_items').update({ done, done_by: done ? S.me.email : null, done_at: done ? new Date().toISOString() : null }).eq('id', id);
    if (r.error) { it.done = !done; draw(); return alert('خطأ: ' + r.error.message); }
    dirty = true;
    if (done && $('f_st') && $('f_st').value === 'todo') $('f_st').value = 'doing';
    if (done && items.every(x => x.done) && t.status !== 'done' && confirm('اكتملت كل البنود ✅\nهل تريد إنجاز المهمة الآن؟')) { dlg.close(); moveTask(t.id, 'done'); }
  };

  $('ck_list').onclick = async e => {
    const editBtn = e.target.closest('[data-cedit]');
    if (editBtn) {
      const id = editBtn.dataset.cedit;
      const targetObj = t ? items.find(x => x.id === id) : { text: draft[+id.slice(1)] };
      if (!targetObj) return;
      const m = parseSubtaskMeta(targetObj);
      const newFrom = prompt('تاريخ بداية المهمة الفرعية (YYYY-MM-DD):', m.from || today());
      if (newFrom === null) return;
      const newDue = prompt('تاريخ استحقاق/نهاية المهمة الفرعية (YYYY-MM-DD):', m.due || newFrom || today());
      if (newDue === null) return;
      const newText = encodeSubtaskMeta(m.cleanText, newFrom.trim(), newDue.trim(), 0);
      if (t) {
        const r = await sb.from('task_items').update({ text: newText }).eq('id', id);
        if (r.error) return alert('خطأ: ' + r.error.message);
        targetObj.text = newText;
        const gItem = (S.items || []).find(x => x.id === id);
        if (gItem) gItem.text = newText;
        dirty = true;
      } else {
        draft[+id.slice(1)] = newText;
      }
      draw();
      return;
    }
    const delBtn = e.target.closest('[data-cd]');
    if (!delBtn) return;
    const id = delBtn.dataset.cd;
    if (t) {
      const r = await sb.from('task_items').delete().eq('id', id);
      if (r.error) return alert('خطأ: ' + r.error.message);
      items = items.filter(x => x.id !== id);
      dirty = true;
    } else {
      draft.splice(+id.slice(1), 1);
    }
    draw();
  };

  const add = async () => {
    const rawTitle = $('ck_in').value.trim();
    if (!rawTitle) return $('ck_in').focus();
    const fromVal = $('ck_from') ? $('ck_from').value : '';
    const dueVal = $('ck_due') ? $('ck_due').value : '';
    const daysVal = $('ck_days') ? +$('ck_days').value || 0 : 0;
    const text = encodeSubtaskMeta(rawTitle, fromVal, dueVal, daysVal);
    $('ck_in').value = '';
    if ($('ck_days')) $('ck_days').value = '';
    if (!t) { draft.push(text); return draw(); }
    const it = { id: crypto.randomUUID(), task_id: t.id, text, done: false, pos: items.length };
    const r = await sb.from('task_items').insert(it);
    if (r.error) return alert('خطأ: ' + r.error.message);
    items.push(it);
    S.items = S.items || [];
    if (!S.items.some(x => x.id === it.id)) S.items.push(it);
    dirty = true;
    draw();
  };

  $('ck_add').onclick = add;
  $('ck_in').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  if (t) {
    ckLoad(t.id).then(d => { items = d || []; draw(); });
    dlg.addEventListener('close', () => { if (dirty) load(); }, { once: true });
  }
  draw();
  return {
    flush: async tid => {
      if (draft.length) {
        const rows = draft.map((text, i) => ({ id: crypto.randomUUID(), task_id: tid, text, done: false, pos: i }));
        await sb.from('task_items').insert(rows);
      }
    }
  };
}

