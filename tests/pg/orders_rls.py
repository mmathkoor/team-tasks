import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pgserver, tempfile, psycopg2, json, sys
srv = pgserver.get_server(tempfile.mkdtemp())
uri = srv.get_uri()
adm = psycopg2.connect(uri); adm.autocommit = True; ac = adm.cursor()
ac.execute("""
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
create table members(email text primary key, name text, telegram_chat_id text, role text default 'member');
create table notifications(id uuid primary key default gen_random_uuid(), to_email text not null, title text not null, body text, task_id uuid, from_name text, created_at timestamptz default now(), read_at timestamptz);
alter table notifications enable row level security;
create policy "v4 notif read" on notifications for select using (lower(to_email)=lower(auth.jwt()->>'email'));
create function is_member() returns boolean language sql stable security definer as $$ select exists(select 1 from members where lower(email)=lower(auth.jwt()->>'email')) $$;
create function is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from members where lower(email)=lower(auth.jwt()->>'email') and role='admin') $$;
alter table members enable row level security;
create policy "members read" on members for select using (is_member());
create publication supabase_realtime;
grant all on all tables in schema public to authenticated;
insert into members values ('Boss@x.com','مروان','','admin'),('Staff@x.com','عثمان','','member'),('rep1@x.com','شهاب','','rep'),('rep2@x.com','آخر','','rep');
""")
ac.execute('''
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated; grant select on storage.buckets to authenticated;
''')
sql = open(ROOT + '/sql/008_orders.sql', encoding='utf-8').read()
for i in range(2):   # مرتين للتأكد أنه آمن لإعادة التشغيل
    ac.execute(sql)
ac.execute("grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;")
sql9 = open(ROOT + '/sql/009_orders_v2.sql', encoding='utf-8').read()
for i in range(2): ac.execute(sql9)
ac.execute("grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;")
sql10 = open(ROOT + '/sql/010_order_images.sql', encoding='utf-8').read()
for i in range(2): ac.execute(sql10)
ac.execute("grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;")
print('migrations 008+009+010 applied twice OK')

def as_(email, sub='11111111-1111-1111-1111-111111111111'):
    c = psycopg2.connect(uri); c.autocommit = True; cur = c.cursor()
    cur.execute("set role authenticated"); cur.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps({'email': email, 'sub': sub}),))
    return cur
def q(cur, s, a=None):
    try:
        cur.execute(s, a); return cur.fetchall() if cur.description else cur.rowcount
    except Exception as e:
        return 'ERR: ' + str(e).split('\n')[0]
ok = lambda name, cond, extra='': print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')

st = as_('staff@x.com'); rep = as_('rep1@x.com', '22222222-2222-2222-2222-222222222222'); boss = as_('boss@x.com', '33333333-3333-3333-3333-333333333333'); rep2 = as_('rep2@x.com', '44444444-4444-4444-4444-444444444444')
r = q(st, "insert into ord_orders (customer_name, phone, address, created_by, delivery_fee, discount, subtotal, paid) values ('عميل','777','صنعاء','spoof@x.com', 500, 100, 99999, 99999) returning id, created_by, subtotal, paid")
oid = r[0][0]; ok('created_by locked to real member; subtotal/paid forced 0', r[0][1] == 'Staff@x.com' and r[0][2] == 0 and r[0][3] == 0, r)
q(st, "insert into ord_items (order_id,pos,name,qty,price) values (%s,0,'ساعة',2,1500),(%s,1,'سوار',1,700)", (oid, oid))
q(st, "insert into ord_payments (order_id,amount,method,created_by) values (%s,1000,'cash','x')", (oid,))
r = q(st, "select subtotal,paid,total,balance from ord_orders where id=%s", (oid,)); ok('totals computed (3700 / 1000 / 4100 / 3100)', r[0] == (3700, 1000, 4100, 3100), r)
q(st, "update ord_orders set subtotal=1, paid=1, total=1 where id=%s", (oid,))
r = q(st, "select subtotal,paid from ord_orders where id=%s", (oid,)); ok('client cannot overwrite subtotal/paid', r[0] == (3700, 1000), r)
r = q(st, "update ord_orders set status='cancelled' where id=%s", (oid,)); ok('cancel without reason rejected', isinstance(r, str) and 'ord_cancel_reason' in r, r)
q(st, "update ord_orders set rep_email='rep1@x.com', status='preparing' where id=%s", (oid,))
r = q(rep, "select count(*) from notifications where order_id is null or true"); 
r = q(rep, "select title, order_id from notifications"); ok('rep got assignment notification', len(r) == 1 and 'طلب جديد' in r[0][0], r)
r = q(rep, "select count(*) from ord_orders"); ok('rep cannot read ord_orders', r[0][0] == 0, r)
r = q(rep, "select count(*) from members"); ok('rep reads only own member row', r[0][0] == 1, r)
r = q(rep, "select count(*) from ord_items"); ok('rep cannot read items', r[0][0] == 0, r)
r = q(rep, "select order_no, customer_name, items from rep_orders()"); ok('rep_orders returns the order without prices', len(r) == 1 and 'price' not in json.dumps(r[0][2]) and r[0][2][0]['qty'] == 2, r)
r = q(rep2, "select count(*) from rep_orders()"); ok('other rep sees nothing', r[0][0] == 0, r)
r = q(rep2, "select rep_set_status(%s,'delivered')", (oid,)); ok('other rep cannot change status', isinstance(r, str) and 'غير مصرّح' in r, r)
r = q(rep, "update ord_orders set status='delivered' where id=%s", (oid,)); ok('rep cannot update table directly', r == 0 or isinstance(r, str), r)
r = q(rep, "insert into notifications (to_email,title) values ('boss@x.com','spam')"); ok('rep cannot insert notifications', isinstance(r, str), r)
r = q(rep, "select rep_set_status(%s,'cancelled','')", (oid,)); ok('rep cancel requires reason', isinstance(r, str) and 'سبب' in r, r)
r = q(rep, "select rep_set_status(%s,'returned')", (oid,)); ok('rep cannot set arbitrary status', isinstance(r, str), r)
r = q(rep, "select rep_set_status(%s,'cancelled','العميل لا يرد')", (oid,)); ok('rep cancel with reason works', not isinstance(r, str), r)
r = q(st, "select title,body from notifications order by created_at"); ok('creator notified of cancel', any('أُلغي' in x[0] and 'العميل لا يرد' in x[1] for x in r), r)
r = q(boss, "select title from notifications"); ok('admin notified of cancel', any('أُلغي' in x[0] for x in r), r)
r = q(rep, "select status, cancel_reason from rep_orders()"); ok('rep still sees recent cancelled order', r and r[0] == ('cancelled', 'العميل لا يرد'), r)
r = q(st, "select kind from ord_events where order_id=%s order by id", (oid,)); ok('events logged', [x[0] for x in r][:2] == ['created', 'payment'] or 'status' in [x[0] for x in r], r)
r = q(st, "delete from ord_orders where id=%s", (oid,)); ok('staff cannot delete order', r == 0, r)
r = q(boss, "delete from ord_orders where id=%s", (oid,)); ok('admin can delete order', r == 1, r)
r = q(boss, "select count(*) from ord_items"); ok('cascade deleted items', r[0][0] == 0, r)

# ===== 009 checks =====
q(st, "insert into ord_orders (id,customer_name,created_by,status,rep_email) values ('aaaaaaaa-0000-0000-0000-000000000001','عميل2','x','preparing','rep1@x.com')")
q(st, "insert into ord_items (id,order_id,pos,name,qty,price,supplier) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',0,'جهاز',1,5000,'تاجر الأمل')")
r = q(st, "insert into ord_item_costs (item_id,cost) values ('bbbbbbbb-0000-0000-0000-000000000001', 3500)"); ok('staff cannot write cost by default', isinstance(r, str), r)
r = q(boss, "insert into ord_item_costs (item_id,cost) values ('bbbbbbbb-0000-0000-0000-000000000001', 3500)"); ok('admin can write cost', not isinstance(r, str), r)
r = q(st, "select count(*) from ord_item_costs"); ok('staff cannot read cost', r[0][0] == 0, r)
r = q(rep, "select count(*) from ord_item_costs"); ok('rep cannot read cost', r[0][0] == 0, r)
r = q(boss, "update ord_settings set staff_can_cost = true"); ok('admin toggles staff_can_cost', r == 1, r)
r = q(st, "select cost from ord_item_costs"); ok('staff reads cost after toggle', r and r[0][0] == 3500, r)
r = q(st, "update ord_settings set staff_can_cost = false"); ok('staff cannot change settings', r == 0, r)
r = q(boss, "update ord_settings set staff_can_cost = false")
r = q(st, "select count(*) from ord_item_costs"); ok('hidden again after toggle off', r[0][0] == 0, r)
r = q(rep, "select items from rep_orders() where order_no is not null"); js = json.dumps(r, ensure_ascii=False)
ok('rep sees supplier but no price/cost', 'تاجر الأمل' in js and 'price' not in js and 'cost' not in js, js)
r = q(rep, "select count(*) from ord_settings"); ok('rep cannot read settings', r[0][0] == 0, r)

# ===== 010 checks (images) =====
O1='aaaaaaaa-0000-0000-0000-000000000001'
q(boss, "insert into ord_orders (id,customer_name,created_by,status,rep_email) values ('cccccccc-0000-0000-0000-000000000002','عميل3','x','preparing','rep2@x.com')")
r = q(st, "insert into storage.objects (bucket_id,name) values ('order-images', %s)", (O1+'/i1.jpg',)); ok('staff uploads image', not isinstance(r, str), r)
q(st, "insert into storage.objects (bucket_id,name) values ('order-images', 'cccccccc-0000-0000-0000-000000000002/i2.jpg')")
r = q(rep, "select name from storage.objects where bucket_id='order-images'"); ok('rep sees only own order image', [x[0] for x in r] == [O1+'/i1.jpg'], r)
r = q(rep2, "select name from storage.objects where bucket_id='order-images'"); ok('other rep sees only his image', [x[0] for x in r] == ['cccccccc-0000-0000-0000-000000000002/i2.jpg'], r)
r = q(rep, "insert into storage.objects (bucket_id,name) values ('order-images', %s)", (O1+'/hack.jpg',)); ok('rep cannot upload', isinstance(r, str), r)
r = q(rep, "delete from storage.objects where bucket_id='order-images'"); ok('rep cannot delete images', r == 0, r)
r = q(st, "select count(*) from storage.objects where bucket_id='order-images'"); ok('staff sees all images', r[0][0] == 2, r)
r = q(rep, "select public, file_size_limit from storage.buckets where id='order-images'"); ok('bucket private with 1MB limit', r and r[0] == (False, 1048576), r)
q(st, "insert into ord_items (order_id,pos,name,qty,price,image_path) values (%s,1,'صنف مصوّر',1,100,%s)", (O1, O1+'/i1.jpg'))
r = q(rep, "select items from rep_orders()"); ok('rep_orders exposes image path', O1+'/i1.jpg' in json.dumps(r), r)

