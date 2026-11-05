// اختصار روابط صور الأصناف للمندوب: /i/:code -> يوجّه فوراً إلى رابط الصورة الموقّع
const { supabase, SUPABASE_URL } = require('../lib/auth');
const BUCKET = 'order-images';

module.exports = async (req, res) => {
  try {
    const raw = String((req.query && (req.query.c || req.query.id || req.query.p)) || '').trim();
    if (!raw) return res.status(400).send('الرابط غير مكتمل');

    let imgPath = '';
    if (raw.includes('/')) {
      imgPath = raw;
    } else {
      // محاولة فك ترميز base64url إن كان مساراً مرمّزاً
      try {
        const dec = Buffer.from(raw, 'base64url').toString('utf8');
        if (/^[0-9a-f-]{8,}\/[0-9a-f-]{8,}\.\w+$/i.test(dec)) imgPath = dec;
      } catch (e) {}
      // أو البحث بأول محارف من معرّف البند (ord_items.id)
      if (!imgPath && /^[0-9a-f-]{6,36}$/i.test(raw)) {
        const { data: items } = await supabase.from('ord_items').select('id,image_path').not('image_path', 'is', null);
        const match = (items || []).find(x => String(x.id).toLowerCase().startsWith(raw.toLowerCase()));
        if (match && match.image_path) imgPath = match.image_path;
      }
    }

    if (!imgPath) return res.status(404).send('الصورة غير موجودة أو انتهت صلاحيتها');

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(imgPath, 7 * 24 * 3600);
    if (!error && data && data.signedUrl) {
      const target = data.signedUrl.startsWith('http') ? data.signedUrl : (SUPABASE_URL + '/storage/v1' + data.signedUrl);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.redirect(302, target);
    }

    // بديل في حال كان البكت عاماً
    return res.redirect(302, SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + imgPath);
  } catch (e) {
    return res.status(500).send('تعذّر فتح الصورة');
  }
};
