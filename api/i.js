// اختصار وعرض صور الأصناف للمندوب: /i/:code -> يعيد بناء الرابط الموقّع أو يجلب الصورة ويعرضها فوراً بدون الحاجة لتسجيل دخول
const { supabase, SUPABASE_URL } = require('../lib/auth');
const BUCKET = 'order-images';

function hexToUuid(hex) {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

module.exports = async (req, res) => {
  try {
    let raw = String((req.query && (req.query.c || req.query.id || req.query.p)) || '').trim();
    if (!raw && req.url) {
      const m = String(req.url).match(/\/i\/([^/?#]+)/);
      if (m) raw = decodeURIComponent(m[1]);
    }
    if (!raw) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('الرابط غير مكتمل');
    }

    let directSignedUrl = '';
    let imgPath = '';

    if (raw.includes('/')) {
      imgPath = raw;
    } else {
      try {
        const buf = Buffer.from(raw, 'base64url');
        // 1) حزمة 72 بايت الذاتية: تحتوي على (UUID الطلب 16B + UUID الصنف 16B + iat 4B + exp 4B + توقيع 32B)
        // تعمل بنسبة 100% بدون أي استعلام قاعدة بيانات أو مفتاح صلاحيات خاص
        if (buf.length === 72) {
          const u1 = hexToUuid(buf.subarray(0, 16).toString('hex'));
          const u2 = hexToUuid(buf.subarray(16, 32).toString('hex'));
          const iat = buf.readUInt32BE(32);
          const exp = buf.readUInt32BE(36);
          const sigB64 = buf.subarray(40, 72).toString('base64url');
          const payStr = '{"url":"' + BUCKET + '/' + u1 + '/' + u2 + '.jpg","iat":' + iat + ',"exp":' + exp + '}';
          const payB64 = Buffer.from(payStr, 'utf8').toString('base64url');
          const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + payB64 + '.' + sigB64;
          imgPath = u1 + '/' + u2 + '.jpg';
          directSignedUrl = SUPABASE_URL + '/storage/v1/object/sign/' + BUCKET + '/' + imgPath + '?token=' + token;
        } else if (buf.length === 32) {
          const hex = buf.toString('hex');
          imgPath = hexToUuid(hex.slice(0, 32)) + '/' + hexToUuid(hex.slice(32, 64)) + '.jpg';
        } else {
          const dec = buf.toString('utf8');
          if (dec.startsWith('http://') || dec.startsWith('https://')) {
            directSignedUrl = dec;
          } else if (/^[0-9a-f-]{8,}\/[0-9a-f-]{8,}\.\w+$/i.test(dec)) {
            imgPath = dec;
          }
        }
      } catch (e) {}

      // 2) البحث بأول محارف من معرّف البند (ord_items.id) في حال توفر صلاحية الخادم
      if (!directSignedUrl && !imgPath && /^[0-9a-f-]{6,36}$/i.test(raw)) {
        const { data: items } = await supabase.from('ord_items').select('id,order_id,image_path').not('image_path', 'is', null).limit(5000);
        const match = (items || []).find(x => String(x.id).toLowerCase().startsWith(raw.toLowerCase()));
        if (match && match.image_path) imgPath = match.image_path;
      }
    }

    // إذا كان لدينا رابط موقّع جاهز، نجلب الصورة ونعرضها مباشرة كـ image/jpeg (أو نوجّه إليها)
    if (directSignedUrl) {
      try {
        const upstream = await fetch(directSignedUrl);
        if (upstream.ok) {
          const ab = await upstream.arrayBuffer();
          res.statusCode = 200;
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.end(Buffer.from(ab));
        }
      } catch (e) {}
      res.writeHead(302, { Location: directSignedUrl, 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }

    if (!imgPath) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('الصورة غير موجودة أو انتهت صلاحيتها');
    }

    const dl = await supabase.storage.from(BUCKET).download(imgPath);
    if (!dl.error && dl.data) {
      const ab = await dl.data.arrayBuffer();
      res.statusCode = 200;
      res.setHeader('Content-Type', dl.data.type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(Buffer.from(ab));
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
