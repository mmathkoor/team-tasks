function parseOptions(p) {
  let arr = ['موافق', 'معارض'];
  if (p && p.options) {
      if (Array.isArray(p.options)) arr = p.options;
      else try { const j = JSON.parse(p.options); if(Array.isArray(j)) arr = j; } catch(e){}
  }
  let isMulti = false;
  if(arr[0] === '__MULTI__') { isMulti = true; arr = arr.slice(1); }
  return { opts: arr, isMulti };
}

function propCard(p) {
  const parsed = parseOptions(p);
  const opts = parsed.opts;
  const isMulti = parsed.isMulti;
  
  const vts = (S.votes || []).filter(x => x.proposal_id === p.id);
  const myVote = S.me ? vts.find(x => same(x.email, S.me.email)) : null;
  
  let optCounts = opts.map(()=>0);
  let optVoters = opts.map(()=>[]);
  
  vts.forEach(v => {
      let nStr = v.note || '';
      let selections = [];
      if(v.option_idx === -1 && nStr.startsWith('MULTI:')) {
          let parts = nStr.substring(6).split('||');
          selections = parts[0].split(',').map(Number);
          v.actualNote = parts[1] || '';
      } else {
          selections = [v.option_idx != null ? v.option_idx : (v.value===1?0:1)];
          v.actualNote = nStr;
      }
      selections.forEach(idx => {
          if(optCounts[idx] !== undefined) {
              optCounts[idx]++;
              optVoters[idx].push(v);
          }
      });
  });

  const totalVotes = vts.length;
  const can = S.me && (same(p.author_email, S.me.email) || isAdmin());
  const open = !isClosed(p);

  let res = opts.map((opt, i) => {
    let count = optCounts[i];
    let w = totalVotes ? ((count / totalVotes) * 100).toFixed(0) : 0;
    
    let vlist = '';
    if (count > 0) {
      let items = optVoters[i].map(x => '<b>' + esc(nm(x.email)) + '</b>' + (x.actualNote ? ' <span style="color:var(--mute)">(' + esc(x.actualNote) + ')</span>' : '')).join('<br>');
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
    if(myVote) {
        if(myVote.option_idx === -1 && (myVote.note||'').startsWith('MULTI:')) {
            let parts = myVote.note.substring(6).split('||');
            mySelections = parts[0].split(',').map(Number);
            myNote = parts[1] || '';
        } else {
            mySelections = [myVote.option_idx != null ? myVote.option_idx : (myVote.value===1?0:1)];
            myNote = myVote.note || '';
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
    
    let btnText = myVote ? 'تحديث التصويت' : 'إرسال التصويت';
    act = '<div style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--line);">' +
      '<h3 style="font-size:14px;margin:0 0 10px;color:var(--acc)">صوّت الآن:</h3>' +
      inputUI +
      '<input id="v_n_' + p.id + '" placeholder="اكتب ملاحظة ليروها الجميع (اختياري)..." value="' + esc(myNote) + '" style="width:100%;margin-top:8px">' +
      '<button class="p" data-cast="' + p.id + '" data-ismulti="' + isMulti + '" style="width:100%;margin-top:12px">' + btnText + '</button>' +
    '</div>';
  }
  
  let actionBtns = can ? (open ? '<button data-ps="' + p.id + '" data-to="accepted">اعتماد</button><button data-ps="' + p.id + '" data-to="rejected">رفض</button>' : '<button data-ps="' + p.id + '" data-to="open">إعادة فتح</button>') + '<button class="dng" data-pdel="' + p.id + '">حذف</button>' : '';
  let detHtml = p.details ? '<div class="det">' + esc(p.details) + '</div>' : '';

  return '<div class="card pr">' +
    '<div class="bar"><span class="ttl">' + esc(p.title) + '</span><span class="chip ' + (p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'late' : 'all') + '">' + esc(PST[p.status] || p.status) + '</span></div>' +
    detHtml +
    '<div class="m">بواسطة ' + esc(nm(p.author_email)) + ' · ' + esc((p.created_at || '').slice(0, 10)) + '</div>' +
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
  const list = S.props.filter(p => S.pf === 'open' ? !isClosed(p) : isClosed(p));
  
  let listHtml = list.length ? list.map(propCard).join('') : '<div class="card empty">لا توجد مقترحات في هذه القائمة.</div>';
  
  return '<div class="tools"><div class="seg"><button data-pf="open" class="' + (S.pf === 'open' ? 'on' : '') + '">قيد التصويت</button><button data-pf="closed" class="' + (S.pf === 'closed' ? 'on' : '') + '">المغلقة</button></div><span class="sp"></span><button class="p" id="np">➕ مقترح/تصويت جديد</button></div>' +
  listHtml;
}

function bindProps() {
  if (S.propsErr) return;
  document.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { S.pf = b.dataset.pf; render(); });
  $('np').onclick = propDialog;
  
  document.querySelectorAll('[data-cast]').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.cast;
      const isMulti = btn.dataset.ismulti === 'true';
      let selectedIdx = -1;
      let finalNote = '';
      let userNote = $('v_n_' + pid).value.trim();
      
      if (isMulti) {
          let checks = document.querySelectorAll('#v_m_' + pid + ' input[type="checkbox"]:checked');
          if(checks.length === 0) return alert('الرجاء اختيار خيار واحد على الأقل.');
          let vals = Array.from(checks).map(c => c.value);
          selectedIdx = -1;
          finalNote = 'MULTI:' + vals.join(',') + '||' + userNote;
      } else {
          let sel = $('v_s_' + pid).value;
          if(sel === '') return alert('الرجاء اختيار خيار.');
          selectedIdx = parseInt(sel);
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
    
    if($('p_multi').checked) rawOpts.unshift('__MULTI__');
    
    $('p_sv').disabled = true; $('p_sv').textContent = '...';
    const { error } = await sb.from('proposals').insert({ title, details: $('p_de').value.trim() || null, author_email: S.me.email, status: 'open', options: JSON.stringify(rawOpts) });
    if (error) return alert('خطأ: ' + error.message);
    dlg.close(); load();
  };
  dlg.showModal(); $('p_ti').focus();
}
