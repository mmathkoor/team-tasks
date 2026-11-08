// اختصار وعرض صور الأصناف مباشرة: /i/:code -> يجلب الصورة ويعرضها فوراً (أو يوجّه إليها)
const { supabase, SUPABASE_URL } = require('../lib/auth');
const BUCKET = 'order-images';

module.exports = async (req, res) => {
  try {
    let raw = String((req.query && (req.query.c || req.query.id || req.query.p)) || '').trim();
    if (!raw && req.url) {
      const m = String(req.url).match(/\/i\/([^/?#]+)/);
      if (m) raw = decodeURIComponent(m[1]);
    }
    if (!raw) {
      res.statusCode = 400;
      return res.end('الرابط غير مكتمل');
    }

    let imgPath = '';
    if (raw.includes('/')) {
      imgPath = raw;
    } else {
      // 1) محاولة فك ترميز مسار مضغوط من 32 بايت (UUID الطلب + UUID الصنف)
      try {
        const buf = Buffer.from(raw, 'base64url');
        if (buf.length === 32) {
          const hex = buf.toString('hex');
          const u1 = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
          const u2 = [hex.slice(32, 40), hex.slice(40, 44), hex.slice(44, 48), hex.slice(48, 52), hex.slice(52, 64)].join('-');
          imgPath = u1 + '/' + u2 + '.jpg';
        } else {
          const dec = buf.toString('utf8');
          if (/^[0-9a-f-]{8,}\/[0-9a-f-]{8,}\.\w+$/i.test(dec)) imgPath = dec;
        }
      } catch (e) {}

      // 2) البحث بأول محارف من معرّف البند (ord_items.id)
      if (!imgPath && /^[0-9a-f-]{6,36}$/i.test(raw)) {
        const { data: items } = await supabase.from('ord_items').select('id,order_id,image_path').not('image_path', 'is', null).limit(5000);
        const match = (items || []).find(x => String(x.id).toLowerCase().startsWith(raw.toLowerCase()));
        if (match && match.image_path) imgPath = match.image_path;
      }
    }

    if (!imgPath) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('الصورة غير موجودة أو انتهت صلاحيتها');
    }

    // محاولة تنزيل الصورة مباشرة وإرسالها كـ image/jpeg لكي تفتح فوراً وتظهر كمعاينة في واتساب
    const dl = await supabase.storage.from(BUCKET).download(imgPath);
    if (!dl.error && dl.data) {
      const ab = await dl.data.arrayBuffer();
      const buf = Buffer.from(ab);
      res.statusCode = 200;
      res.setHeader('Content-Type', dl.data.type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(buf);
    }

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(imgPath, 7 * 24 * 3600);
    if (!error && data && data.signedUrl) {
      const target = data.signedUrl.startsWith('http') ? data.signedUrl : (SUPABASE_URL + '/storage/v1' + data.signedUrl);
      res.writeHead(302, { Location: target, 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }

    const pubUrl = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + imgPath;
    res.writeHead(302, { Location: pubUrl });
    return res.end();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('تعذّر فتح الصورة');
  }
};
