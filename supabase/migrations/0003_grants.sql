-- =========================================================
-- 0003_grants.sql — Grant schema/table access for PostgREST roles
-- (RLS policies still enforce tenant isolation for authenticated users)
-- =========================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- Ensure initial platform admin profile is active
update public.profiles
set role = 'platform_admin', password_set = true, name = coalesce(name, '플랫폼 관리자')
where email = 'techny@hippotnc.com';
