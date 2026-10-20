import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pgserver, tempfile, psycopg2, json
srv = pgserver.get_server(tempfile.mkdtemp()); uri = srv.get_uri()
c = psycopg2.connect(uri); c.autocommit = True; ac = c.cursor()
ac.execute("""create role anon nologin; create role authenticated nologin; create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated; alter default privileges in schema public grant all on sequences to authenticated;
create publication supabase_realtime;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text); alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;""")
# simulate the LIVE database: base (with the OLD buggy policy) + 001..005 + 007 already applied
base = open(ROOT + '/sql/000_base.sql', encoding='utf-8').read().replace("lower(created_by) = lower(auth.jwt() ->> 'email')) with check (is_member());", "lower(created_by) = lower(auth.jwt() ->> 'email'));")
ac.execute(base)
for f in ['001_features','002_workflow','003_recurring_for_all','004_activity_checklist','005_priority_realtime','007_group_inbox_meetings']:
    ac.execute(open(fROOT + '/sql/{f}.sql', encoding='utf-8').read())
ac.execute("grant all on all tables in schema public to authenticated;")
ac.execute("insert into members (email,name,role) values ('boss@x.com','المالك','admin'),('staff@x.com','موظف','member'),('next@x.com','التالي','member'),('other@x.com','آخر','member')")
def as_(email):
    cc = psycopg2.connect(uri); cc.autocommit = True; cur = cc.cursor(); cur.execute("set role authenticated"); cur.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps({'email': email, 'sub': '11111111-1111-1111-1111-111111111111'}),)); return cur
st = as_('staff@x.com')
as_('boss@x.com').execute("insert into tasks (id,title,created_by,assignee_email) values ('cccccccc-0000-0000-0000-000000000001','مهمة المسار','boss@x.com','staff@x.com')")
try:
    st.execute("update tasks set assignee_email='next@x.com' where id='cccccccc-0000-0000-0000-000000000001'"); print('BEFORE FIX: reassign succeeded (unexpected)')
except Exception as e: print('BEFORE FIX reproduces the bug:', str(e).split('\n')[0])
upd = open(ROOT + '/sql/update_all.sql', encoding='utf-8').read()
for i in range(2): ac.execute(upd)
ac.execute("grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;")
print('update_all applied twice OK')
st = as_('staff@x.com')
st.execute("update tasks set assignee_email='next@x.com' where id='cccccccc-0000-0000-0000-000000000001'"); print('AFTER FIX staff hands task to next person, rows:', st.rowcount)
oth = as_('other@x.com'); oth.execute("update tasks set title='x' where id='cccccccc-0000-0000-0000-000000000001'"); print('unrelated member cannot edit (expect 0):', oth.rowcount)
nx = as_('next@x.com'); nx.execute("update tasks set assignee_email='other@x.com' where id='cccccccc-0000-0000-0000-000000000001'"); print('new assignee can pass it on, rows:', nx.rowcount)
try:
    nx.execute("update tasks set assignee_email='nobody@x.com' where id='cccccccc-0000-0000-0000-000000000001'"); print('assign to non-member rows:', nx.rowcount)
except Exception as e: print('assign to unknown email blocked by FK:', str(e).split('\n')[0][:70])
ac.execute("select count(*) from pg_tables where schemaname='public' and not rowsecurity"); print('tables without RLS:', ac.fetchone()[0])
