function updateBadge() {
  if (!navigator.setAppBadge || !S.me) return;
  const n = S.tasks.filter(t => mine(t) && eff(t) !== 'done').length;
  n ? navigator.setAppBadge(n).catch(() => {}) : navigator.clearAppBadge().catch(() => {});
}
function saveCache() {
  if (S.me) localStorage.setItem(CACHE_KEY, JSON.stringify({ email: S.me.email, s: { me: S.me, members: S.members, meetings: S.meetings, tasks: S.tasks, done: S.done, props: S.props, votes: S.votes } }));
}
const shrink = f => new Promise((ok, no) => { const i = new Image(); i.onload = () => { const k = Math.min(1, 1600 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = i.width * k; c.height = i.height * k; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(i.src); c.toBlob(b => b ? ok(b) : no(), 'image/jpeg', 0.8); }; i.onerror = no; i.src = URL.createObjectURL(f); });
async function stor(method, path, body, type) {
  return fetch(API + '/storage/v1/' + path, { method, headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + await tok() }, type ? { 'Content-Type': type } : {}), body });
}

// ============================================================================
// محرك توليد وإرسال فواتير وسندات PDF العربية الفوري (بدون مكتبات خارجية)
// يحوّل لوحة Canvas عالية الدقة إلى ملف PDF قياسي صالح للإرسال المباشر
// ============================================================================
function jpegBytesToPdfBlob(jpegBytes, imgW, imgH) {
  const pdfW = 595.28; // عرض A4 بالنقاط
  const pdfH = Math.max(420, +((imgH / imgW) * pdfW).toFixed(2));
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [0];

  const pushStr = s => {
    const b = enc.encode(s);
    chunks.push(b);
    offset += b.byteLength;
  };
  const pushBytes = b => {
    chunks.push(b);
    offset += b.byteLength;
  };
  const startObj = id => {
    offsets[id] = offset;
    pushStr(id + ' 0 obj\n');
  };
  const endObj = () => pushStr('\nendobj\n');

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // 2: Pages
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  // 3: Page
  startObj(3);
  pushStr('<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /MediaBox [0 0 ' + pdfW + ' ' + pdfH + '] /Contents 5 0 R >>');
  endObj();

  // 4: Image XObject (DCTDecode = JPEG)
  startObj(4);
  pushStr('<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegBytes.byteLength + ' >>\nstream\n');
  pushBytes(jpegBytes);
  pushStr('\nendstream');
  endObj();

  // 5: Page Content Stream
  const contentStream = 'q\n' + pdfW + ' 0 0 ' + pdfH + ' 0 0 cm\n/Im1 Do\nQ\n';
  const contentBytes = enc.encode(contentStream);
  startObj(5);
  pushStr('<< /Length ' + contentBytes.byteLength + ' >>\nstream\n');
  pushBytes(contentBytes);
  pushStr('endstream');
  endObj();

  // XRef Table
  const xrefPos = offset;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    pushStr(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  pushStr('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');

  return new Blob(chunks, { type: 'application/pdf' });
}

function canvasToJpegUint8(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('تعذّر إنشاء صورة الـ PDF'));
      const buf = await blob.arrayBuffer();
      resolve(new Uint8Array(buf));
    }, 'image/jpeg', quality);
  });
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ['—'];
}

async function generateInvoicePdfBlob(data) {
  if (document.fonts && document.fonts.ready) {
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]); } catch (e) {}
  }

  const W = 1200;
  const pad = 56;
  const innerW = W - pad * 2;
  const items = Array.isArray(data.items) && data.items.length ? data.items : [{ name: 'إجمالي الطلب', qty: 1, price: data.total || 0, line_total: data.total || 0 }];
  const rowH = 54;
  const H = Math.max(960, 620 + items.length * rowH + (data.notes ? 90 : 0));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.dir = 'rtl';
  const ctx = c.getContext('2d');
  ctx.direction = 'rtl';

  const font = (weight, size) => `${weight} ${size}px "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif`;
  const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const cur = data.currency || 'ر.ي';
  const accent = data.accent || '#c9a24e';
  const navy = '#0b1426';

  // خلفية بيضاء نقية
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // شريط علوي مزدوج الهوية
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, W, 16);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 16, W, 6);

  let y = 58;

  // ترويسة المتجر (يمين)
  ctx.textAlign = 'right';
  ctx.fillStyle = navy;
  ctx.font = font('700', 36);
  ctx.fillText(data.storeName || 'متجرك', W - pad, y + 28);

  let subY = y + 62;
  if (data.slogan) {
    ctx.fillStyle = accent;
    ctx.font = font('700', 20);
    ctx.fillText(data.slogan, W - pad, subY);
    subY += 30;
  }
  const contactParts = [
    data.storePhone ? 'هاتف: ' + data.storePhone : '',
    data.storeAddress ? data.storeAddress : '',
    data.taxNo ? 'الرقم الضريبي: ' + data.taxNo : ''
  ].filter(Boolean).join('  ·  ');
  if (contactParts) {
    ctx.fillStyle = '#475467';
    ctx.font = font('400', 18);
    ctx.fillText(contactParts, W - pad, subY);
  }

  // صندوق رقم الفاتورة (يسار)
  const boxW = 360, boxH = 122, boxX = pad, boxY = y - 8;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = accent;
  ctx.fillRect(boxX + boxW - 6, boxY, 6, boxH);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = font('700', 17);
  ctx.fillText(data.docTitle || 'فاتورة مبيعات إلكترونية معتمدة', boxX + boxW - 20, boxY + 30);

  ctx.fillStyle = navy;
  ctx.font = font('700', 30);
  ctx.fillText('#' + (data.orderNo || '—'), boxX + boxW - 20, boxY + 66);

  ctx.fillStyle = '#475467';
  ctx.font = font('400', 17);
  ctx.fillText('التاريخ: ' + (data.orderDate || ''), boxX + boxW - 20, boxY + 98);

  // شارة التصنيف (مستعجل / VIP / إلخ) إن وجدت
  if (data.categoryLabel && data.categoryLabel !== 'عادي') {
    ctx.fillStyle = data.categoryBg || '#fef2f2';
    ctx.fillRect(boxX + 14, boxY + 16, 125, 34);
    ctx.fillStyle = data.categoryColor || '#b91c1c';
    ctx.font = font('700', 16);
    ctx.textAlign = 'center';
    ctx.fillText(data.categoryLabel, boxX + 76, boxY + 39);
  }

  y = Math.max(subY + 24, boxY + boxH + 24);

  // خط فاصل
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 24;

  // بطاقة بيانات العميل والطلب
  const custH = 104;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(pad, y, innerW, custH);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, y, innerW, custH);

  const colW = innerW / 3;
  ctx.textAlign = 'right';

  // العمود 1: العميل
  ctx.fillStyle = '#64748b';
  ctx.font = font('400', 16);
  ctx.fillText('بيانات العميل', W - pad - 18, y + 32);
  ctx.fillStyle = '#0f172a';
  ctx.font = font('700', 22);
  ctx.fillText(String(data.customerName || 'عميل الكرام').slice(0, 32), W - pad - 18, y + 66);
  if (data.customerPhone) {
    ctx.fillStyle = '#475467';
    ctx.font = font('400', 17);
    ctx.fillText('هاتف: ' + data.customerPhone, W - pad - 18, y + 92);
  }

  // العمود 2: العنوان
  ctx.fillStyle = '#64748b';
  ctx.font = font('400', 16);
  ctx.fillText('عنوان التوصيل', W - pad - colW - 18, y + 32);
  ctx.fillStyle = '#0f172a';
  ctx.font = font('700', 19);
  ctx.fillText(String(data.customerAddress || '—').slice(0, 38), W - pad - colW - 18, y + 66);

  // العمود 3: حالة السداد والمندوب
  ctx.fillStyle = '#64748b';
  ctx.font = font('400', 16);
  ctx.fillText('حالة الفاتورة والتوصيل', W - pad - colW * 2 - 18, y + 32);
  const isPaid = (+data.balance || 0) <= 0 && (+data.total || 0) > 0;
  ctx.fillStyle = isPaid ? '#15803d' : '#b42318';
  ctx.font = font('700', 19);
  ctx.fillText(isPaid ? '✓ مسدّدة بالكامل' : 'المطلوب تحصيله: ' + fmt(data.balance) + ' ' + cur, W - pad - colW * 2 - 18, y + 64);
  if (data.repName) {
    ctx.fillStyle = '#475467';
    ctx.font = font('400', 16);
    ctx.fillText('المندوب: ' + data.repName, W - pad - colW * 2 - 18, y + 90);
  }

  y += custH + 26;

  // جدول الأصناف
  const thH = 50;
  ctx.fillStyle = navy;
  ctx.fillRect(pad, y, innerW, thH);

  // أعمدة الجدول من اليمين لليسار: # (60) | الصنف (520) | الكمية (120) | السعر (180) | الإجمالي (208)
  const c1 = W - pad - 30;
  const c2 = W - pad - 75;
  const c3 = pad + 388 + 60;
  const c4 = pad + 208 + 90;
  const c5 = pad + 24;

  ctx.fillStyle = '#f6e3a8';
  ctx.font = font('700', 18);
  ctx.textAlign = 'center';
  ctx.fillText('#', c1, y + 32);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText('الصنف / البيان', c2, y + 32);
  ctx.textAlign = 'center';
  ctx.fillText('الكمية', c3, y + 32);
  ctx.fillText('سعر الوحدة', c4, y + 32);
  ctx.textAlign = 'left';
  ctx.fillText('الإجمالي (' + cur + ')', c5, y + 32);

  y += thH;

  let totQty = 0;
  items.forEach((it, idx) => {
    const q = +it.qty || 1;
    const p = +it.price || 0;
    const lt = it.line_total != null ? +it.line_total : (q * p);
    totQty += q;

    ctx.fillStyle = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(pad, y, innerW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, y, innerW, rowH);

    ctx.fillStyle = '#64748b';
    ctx.font = font('700', 18);
    ctx.textAlign = 'center';
    ctx.fillText(String(idx + 1), c1, y + 34);

    ctx.fillStyle = '#0f172a';
    ctx.font = font('700', 19);
    ctx.textAlign = 'right';
    const itemTitle = wrapCanvasText(ctx, it.name || 'صنف', 490)[0];
    ctx.fillText(itemTitle, c2, y + 34);

    ctx.font = font('700', 19);
    ctx.textAlign = 'center';
    ctx.fillText(String(q), c3, y + 34);

    ctx.font = font('400', 19);
    ctx.fillText(fmt(p), c4, y + 34);

    ctx.font = font('700', 20);
    ctx.textAlign = 'left';
    ctx.fillText(fmt(lt), c5, y + 34);

    y += rowH;
  });

  // شريط مجموع القطع
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(pad, y, innerW, 44);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(pad, y, innerW, 44);
  ctx.fillStyle = '#334155';
  ctx.font = font('700', 17);
  ctx.textAlign = 'right';
  ctx.fillText('إجمالي الأصناف: ' + items.length + ' صنف  |  إجمالي القطع: ' + totQty, W - pad - 18, y + 28);
  y += 66;

  // ملخص الحساب النهائي (يسار) + ختم الاعتماد (يمين)
  const sumW = 460;
  const sumX = pad;
  let sumY = y;

  const drawSumRow = (label, val, isBold, bg, fg) => {
    const rh = isBold ? 50 : 38;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(sumX, sumY, sumW, rh);
    }
    ctx.fillStyle = fg || '#0f172a';
    ctx.font = font(isBold ? '700' : '400', isBold ? 21 : 18);
    ctx.textAlign = 'right';
    ctx.fillText(label, sumX + sumW - 16, sumY + (isBold ? 32 : 26));
    ctx.textAlign = 'left';
    ctx.fillText(val, sumX + 16, sumY + (isBold ? 32 : 26));
    sumY += rh;
  };

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(sumX, y, sumW, 210);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(sumX, y, sumW, 210);

  drawSumRow('المجموع الفرعي:', fmt(data.subtotal) + ' ' + cur, false);
  if (+data.deliveryFee > 0) drawSumRow('رسوم التوصيل:', '+' + fmt(data.deliveryFee) + ' ' + cur, false);
  if (+data.discount > 0) drawSumRow('الخصم الممنوح:', '-' + fmt(data.discount) + ' ' + cur, false, null, '#b42318');
  drawSumRow('الإجمالي النهائي:', fmt(data.total) + ' ' + cur, true, navy, '#f6e3a8');
  drawSumRow('المبلغ المدفوع:', fmt(data.paid) + ' ' + cur, false, null, '#15803d');
  drawSumRow('المتبقي للتحصيل:', fmt(data.balance) + ' ' + cur, true, (+data.balance > 0 ? '#fef2f2' : '#dcfce7'), (+data.balance > 0 ? '#b42318' : '#15803d'));

  // صندوق الاعتماد والملاحظات (يمين)
  const rightW = innerW - sumW - 28;
  const rightX = W - pad - rightW;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(rightX, y, rightW, 130);
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(rightX, y, rightW, 130);

  ctx.textAlign = 'right';
  ctx.fillStyle = navy;
  ctx.font = font('700', 20);
  ctx.fillText('🛡️ وثيقة إلكترونية رسمية معتمدة', rightX + rightW - 18, y + 38);
  ctx.fillStyle = '#475467';
  ctx.font = font('400', 17);
  ctx.fillText('صدرت آلياً من نظام ' + (data.storeName || 'المتجر') + ' للطلب رقم #' + (data.orderNo || ''), rightX + rightW - 18, y + 72);
  ctx.fillText('معتمدة إلكترونياً ولا تتطلب توقيعاً أو ختماً يدوياً.', rightX + rightW - 18, y + 102);

  // التذييل
  const footY = Math.max(sumY + 42, H - 40);
  ctx.fillStyle = '#475467';
  ctx.font = font('700', 20);
  ctx.textAlign = 'center';
  ctx.fillText(data.footer || 'شكراً لتعاملكم معنا 🌹', W / 2, footY);

  const jpegBytes = await canvasToJpegUint8(c, 0.92);
  return jpegBytesToPdfBlob(jpegBytes, W, H);
}

// مشاركة أو إرسال ملف الفاتورة PDF مباشرة للعميل بضغطة زر واحدة
async function shareOrSendInvoicePdf(invoiceData, customerPhone, btnEl) {
  const origTxt = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '⏳ جارٍ تجهيز PDF...';
  }
  try {
    const pdfBlob = await generateInvoicePdfBlob(invoiceData);
    const fileName = 'فاتورة-' + (invoiceData.orderNo || 'طلب') + '.pdf';
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
    const caption = '🧾 فاتورة مبيعات #' + (invoiceData.orderNo || '') + ' — ' + (invoiceData.storeName || '') + '\n👤 العميل: ' + (invoiceData.customerName || '') + '\n💰 الإجمالي: ' + Number(invoiceData.total || 0).toLocaleString('en-US') + ' ' + (invoiceData.currency || 'ر.ي');

    // 1) الإرسال المباشر للملف عبر نظام المشاركة الأصلي (واتساب / تيليجرام / إلخ) بدون حفظ مسبق
    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({
        files: [pdfFile],
        title: 'فاتورة #' + (invoiceData.orderNo || ''),
        text: caption
      });
      if (typeof toast === 'function') toast('تم فتح مشاركة ملف الفاتورة PDF مباشرة ✓');
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origTxt; }
      return;
    }

    // 2) في متصفحات سطح المكتب التي لا تدعم مشاركة الملفات المباشرة: تنزيل تلقائي لملف الـ PDF مع فتح محادثة العميل في واتساب مباشرة
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);

    if (customerPhone) {
      const ph = typeof waPhone === 'function' ? waPhone(customerPhone) : String(customerPhone).replace(/\D/g, '');
      window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(caption + '\n📎 (مرفق لكم ملف الفاتورة الرسمي PDF)'), '_blank');
      if (typeof toast === 'function') toast('تم تجهيز ملف الفاتورة PDF وفتح محادثة العميل لإرفاقه ✓');
    } else {
      if (typeof toast === 'function') toast('تم تحميل ملف الفاتورة PDF جاهزاً للإرسال ✓');
    }
  } catch (err) {
    if (err && err.name !== 'AbortError') {
      alert('تعذّر مشاركة ملف الـ PDF: ' + (err.message || err));
    }
  }
  if (btnEl) {
    btnEl.disabled = false;
    btnEl.innerHTML = origTxt;
  }
}
