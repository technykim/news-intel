-- =========================================================
-- Run ONCE after creating your own account in Supabase
-- (Authentication > Users > "Add user" with your email + password).
-- Promotes that account to platform admin (히포티앤씨 운영자).
-- =========================================================
update public.profiles
set role = 'platform_admin', password_set = true, name = coalesce(name, '플랫폼 관리자')
where email = 'technykim@gmail.com';   -- ← 본인 이메일로 변경
