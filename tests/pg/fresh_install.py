import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pgserver, tempfile, psycopg2, json
srv = pgserver.get_server(tempfile.mkdtemp()); uri = srv.get_uri()
c = psycopg2.connect(uri); c.autocommit = True; ac = c.cursor()
ac.execute("""
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
create publication supabase_realtime;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text); alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;
""")
sql = open(ROOT + '/sql/setup_all.sql', encoding='utf-8').read()
try:
    ac.execute(sql); print('SETUP OK on fresh database')
except Exception as e:
    print('SETUP FAILED:', str(e)[:600]); raise SystemExit
ac.execute("grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;")
ac.execute("select count(*) from pg_tables where schemaname='public'"); print('tables:', ac.fetchone()[0])
ac.execute("select count(*) from pg_tables where schemaname='public' and not rowsecurity"); print('tables without RLS:', ac.fetchone()[0])
ac.execute("select tablename from pg_tables where schemaname='public' and not rowsecurity"); print([r[0] for r in ac.fetchall()])
# smoke: first admin + staff + rep flow
ac.execute("insert into members (email,name,role) values ('boss@x.com','المالك','admin'),('staff@x.com','موظف','member')")
def as_(email):
    cc = psycopg2.connect(uri); cc.autocommit = True; cur = cc.cursor(); cur.execute("set role authenticated"); cur.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps({'email': email, 'sub': '11111111-1111-1111-1111-111111111111'}),)); return cur
b = as_('boss@x.com'); s = as_('staff@x.com')
b.execute("update members set title='المسؤول المالي' where email='staff@x.com'"); print('admin sets title rows:', b.rowcount)
s.execute("update members set title='x' where email='boss@x.com'"); print('staff edits others title rows (expect 0):', s.rowcount)
b.execute("update ord_settings set hidden_views = array['log','props']"); print('admin hides views rows:', b.rowcount)
s.execute("update ord_settings set hidden_views = '{}'"); print('staff changes views rows (expect 0):', s.rowcount)
s.execute("insert into tasks (title, created_by, assignee_email) values ('t','staff@x.com','staff@x.com') returning id"); print('task insert OK')
s.execute("select count(*) from tasks"); print('tasks visible', s.fetchone()[0])
