-- 017: إصلاح مخزن الصور order-images لضمان ظهور صور المنشورات والطلبات دائماً
-- شغّله في Supabase ← SQL Editor مرة واحدة (آمن تماماً لإعادة التشغيل)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-images', 'order-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880;

-- سياسة قراءة الصور للجميع بدون انقطاع (تحل مشكلة اختفاء الصور السابقة فوراً)
drop policy if exists "allow public read order-images" on storage.objects;
create policy "allow public read order-images" on storage.objects
  for select using (bucket_id = 'order-images');

-- سياسة رفع وتعديل وحذف الصور للأعضاء المسجلين
drop policy if exists "allow auth manage order-images" on storage.objects;
create policy "allow auth manage order-images" on storage.objects
  for all to authenticated
  using (bucket_id = 'order-images')
  with check (bucket_id = 'order-images');
