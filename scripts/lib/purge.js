// حذف صور الأصناف بعد انتهاء الطلب (تسليم/إلغاء/إرجاع) لتوفير المساحة
const BUCKET = 'order-images';
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
async function purgeImages(supabase, orderId) {
  const { data: st } = await supabase.from('ord_settings').select('image_keep_days').limit(1).maybeSingle();
  const days = st && st.image_keep_days != null ? st.image_keep_days : 1;
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  let q = supabase.from('ord_orders').select('id,delivered_at,updated_at').in('status', ['delivered', 'cancelled', 'returned']);
  if (orderId) q = q.eq('id', orderId); else q = q.limit(2000);
  const { data: orders } = await q;
  const ids = (orders || []).filter(o => (o.delivered_at || o.updated_at) <= cutoff).map(o => o.id);
  let removed = 0;
  for (const part of chunk(ids, 80)) {
    const { data: items } = await supabase.from('ord_items').select('id,image_path').in('order_id', part).not('image_path', 'is', null);
    if (!items || !items.length) continue;
    const { error } = await supabase.storage.from(BUCKET).remove(items.map(i => i.image_path));
    if (error) throw error;
    await supabase.from('ord_items').update({ image_path: null }).in('id', items.map(i => i.id));
    removed += items.length;
  }
  return { removed };
}
module.exports = { purgeImages };
