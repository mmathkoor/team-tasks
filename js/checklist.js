// ===== القائمة الفرعية للمهمة (checklist) =====
async function ckLoad(tid) {
  const { data, error } = await sb.from('task_items').select('*').eq('task_id', tid).order('pos', { ascending: true }).order('created_at', { ascending: true });
  return error ? null : data;
}
const ckChip = t => { const s = (S.itemStats || {})[t.id]; return s ? '<span class="chip ' + (s[0] === s[1] ? 'ok' : '') + '">☑ ' + s[0] + '/' + s[1] + '</span>' : ''; };
const CK_HTML = '<b>☑ قائمة المهام الفرعية</b> <span class="m" id="ck_pg"></span><div id="ck_list" style="margin:6px 0"></div>' +
  '<div class="row"><input id="ck_in" placeholder="أضف بنداً ثم اضغط Enter"><button class="s" type="button" id="ck_add">+ إضافة</button></div>';
function ckInit(t) {
  $('ck_box').innerHTML = CK_HTML;
  let items = [], draft = [], dirty = false;
  const draw = () => {
    const L = t ? items : draft.map((x, i) => ({ id: 'd' + i, text: x, done: false }));
    const dn = L.filter(x => x.done).length;
    $('ck_pg').textContent = L.length ? '(' + dn + '/' + L.length + ' — ' + Math.round(100 * dn / L.length) + '%)' : '';
    $('ck_list').innerHTML = L.map(x => '<div class="bar" style="padding:3px 0"><div style="display:flex;gap:8px;align-items:center;flex:1">' +
      (t ? '<input type="checkbox" data-ck="' + x.id + '" ' + (x.done ? 'checked' : '') + ' style="width:18px;height:18px;flex:none;margin:0">' : '<span>•</span>') +
      '<span style="' + (x.done ? 'text-decoration:line-through;color:var(--mute)' : '') + '">' + esc(x.text) + '</span></div>' +
      '<button class="s dng" type="button" data-cd="' + x.id + '">✕</button></div>').join('') || '<div class="m">لا توجد بنود.</div>';
    if (t && L.length && $('f_pg')) { $('f_pg').value = Math.round(100 * dn / L.length); $('pg_v').textContent = $('f_pg').value + '%'; $('f_pg').parentElement.parentElement.style.display = 'none'; }
  };
  $('ck_list').onchange = async e => {
    const id = e.target.dataset.ck; if (!id) return;
    const it = items.find(x => x.id === id), done = e.target.checked; it.done = done; draw();
    const r = await sb.from('task_items').update({ done, done_by: done ? S.me.email : null, done_at: done ? new Date().toISOString() : null }).eq('id', id);
    if (r.error) { it.done = !done; draw(); return alert('خطأ: ' + r.error.message); }
    dirty = true;
    if (done && $('f_st') && $('f_st').value === 'todo') $('f_st').value = 'doing';
    if (done && items.every(x => x.done) && t.status !== 'done' && confirm('اكتملت كل البنود ✅\nهل تريد إنجاز المهمة الآن؟')) { dlg.close(); moveTask(t.id, 'done'); }
  };
  $('ck_list').onclick = async e => {
    const id = e.target.dataset.cd; if (!id) return;
    if (t) { const r = await sb.from('task_items').delete().eq('id', id); if (r.error) return alert('خطأ: ' + r.error.message); items = items.filter(x => x.id !== id); dirty = true; }
    else draft.splice(+id.slice(1), 1);
    draw();
  };
  const add = async () => {
    const text = $('ck_in').value.trim(); if (!text) return; $('ck_in').value = '';
    if (!t) { draft.push(text); return draw(); }
    const it = { id: crypto.randomUUID(), task_id: t.id, text, done: false, pos: items.length };
    const r = await sb.from('task_items').insert(it); if (r.error) return alert('خطأ: ' + r.error.message);
    items.push(it); dirty = true; draw();
  };
  $('ck_add').onclick = add; $('ck_in').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  if (t) { ckLoad(t.id).then(d => { items = d || []; draw(); }); dlg.addEventListener('close', () => { if (dirty) load(); }, { once: true }); }
  draw();
  return { flush: async tid => { if (draft.length) await sb.from('task_items').insert(draft.map((text, i) => ({ id: crypto.randomUUID(), task_id: tid, text, pos: i }))); } };
}
