-- =========================================================
-- 0002_schedules.sql — Per-organization collection schedules
-- Allows each organization to configure 1 or more KST hours/day
-- =========================================================

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  hour_kst smallint not null check (hour_kst >= 0 and hour_kst <= 23),
  send_email boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, hour_kst)
);
create index if not exists idx_schedules_hour_active on schedules(hour_kst) where active = true;

alter table schedules enable row level security;

create policy schedules_select on schedules for select
  using (org_id = my_org_id() or is_platform_admin());

create policy schedules_write on schedules for all
  using (org_id = my_org_id() and my_role() = 'org_admin')
  with check (org_id = my_org_id() and my_role() = 'org_admin');

-- Seed default 08:00 KST schedule for existing organizations
insert into schedules (org_id, hour_kst, send_email, active)
select id, 8, true, true from organizations
on conflict (org_id, hour_kst) do nothing;
