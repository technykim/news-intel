-- =========================================================
-- News Intel SaaS - initial schema (multi-tenant, RLS)
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type user_role as enum ('platform_admin', 'org_admin', 'member');
create type entity_type as enum ('company', 'organization', 'person');
create type target_status as enum ('new', 'reviewing', 'to_contact', 'excluded');
create type consent_status as enum ('unknown', 'consented', 'refused');
create type campaign_status as enum ('draft', 'pending_approval', 'approved', 'rejected', 'sent');

-- ---------- Tenants & users ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  email text not null,
  name text,
  role user_role not null default 'member',
  password_set boolean not null default false,
  created_at timestamptz not null default now()
);
create index on profiles(org_id);

-- ---------- Settings ----------
create table keywords (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  keyword text not null,
  category text not null default '기타',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, keyword)
);

create table recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- ---------- Articles ----------
create table articles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  category text,
  pub_date timestamptz,
  press text,
  title text not null,
  summary text,
  link text not null,
  analyzed boolean not null default false,
  collected_at timestamptz not null default now(),
  unique (org_id, link)
);
create index on articles(org_id, pub_date desc);

-- ---------- Entities (shared across tenants) ----------
create table entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  type entity_type not null,
  homepage text,
  industry text,
  created_at timestamptz not null default now(),
  unique (normalized_name, type)
);

create table article_entities (
  article_id uuid not null references articles(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  relevance numeric(3,2),
  context text,
  primary key (article_id, entity_id)
);

create table target_companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  status target_status not null default 'new',
  memo text,
  mention_count int not null default 0,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, entity_id)
);

-- ---------- Marketing ----------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  target_company_id uuid references target_companies(id) on delete set null,
  name text,
  email text not null,
  consent consent_status not null default 'unknown',
  source text,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  subject text not null,
  body_html text not null,
  status campaign_status not null default 'draft',
  requested_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'queued',
  sent_at timestamptz,
  error text,
  unique (campaign_id, contact_id)
);

create table unsubscribes (
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);

create table run_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  run_at timestamptz not null default now(),
  article_count int not null default 0,
  status text not null,
  error text
);

-- =========================================================
-- Helper functions (security definer: avoid RLS recursion)
-- =========================================================
create or replace function public.my_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function public.my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'platform_admin' from profiles where id = auth.uid()), false)
$$;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table organizations    enable row level security;
alter table profiles         enable row level security;
alter table keywords         enable row level security;
alter table recipients       enable row level security;
alter table articles         enable row level security;
alter table entities         enable row level security;
alter table article_entities enable row level security;
alter table target_companies enable row level security;
alter table contacts         enable row level security;
alter table campaigns        enable row level security;
alter table campaign_sends   enable row level security;
alter table unsubscribes     enable row level security;
alter table run_logs         enable row level security;

-- organizations: members see own org, platform admin sees all
create policy org_select on organizations for select
  using (id = my_org_id() or is_platform_admin());
create policy org_admin_all on organizations for all
  using (is_platform_admin()) with check (is_platform_admin());

-- profiles: see colleagues in same org; update own name
create policy profiles_select on profiles for select
  using (org_id = my_org_id() or id = auth.uid() or is_platform_admin());
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = my_role() and org_id is not distinct from my_org_id());
-- inserts/role changes happen server-side with the service role key

-- Generic tenant policies: read for all org members, write for org_admin
do $$
declare t text;
begin
  foreach t in array array['keywords','recipients','unsubscribes'] loop
    execute format('create policy %1$s_select on %1$s for select using (org_id = my_org_id() or is_platform_admin())', t);
    execute format('create policy %1$s_write on %1$s for all using (org_id = my_org_id() and my_role() = ''org_admin'') with check (org_id = my_org_id() and my_role() = ''org_admin'')', t);
  end loop;

  -- members can also edit these (memo/status, contacts)
  foreach t in array array['target_companies','contacts'] loop
    execute format('create policy %1$s_select on %1$s for select using (org_id = my_org_id() or is_platform_admin())', t);
    execute format('create policy %1$s_write on %1$s for all using (org_id = my_org_id()) with check (org_id = my_org_id())', t);
  end loop;

  -- read-only for users (written by worker with service role)
  foreach t in array array['articles','run_logs'] loop
    execute format('create policy %1$s_select on %1$s for select using (org_id = my_org_id() or is_platform_admin())', t);
  end loop;
end $$;

-- entities: readable if linked to one of my org's articles or targets
create policy entities_select on entities for select using (
  is_platform_admin() or exists (
    select 1 from target_companies tc where tc.entity_id = entities.id and tc.org_id = my_org_id()
  ) or exists (
    select 1 from article_entities ae join articles a on a.id = ae.article_id
    where ae.entity_id = entities.id and a.org_id = my_org_id()
  )
);
create policy article_entities_select on article_entities for select using (
  exists (select 1 from articles a where a.id = article_id and (a.org_id = my_org_id() or is_platform_admin()))
);

-- campaigns: members create drafts / request approval; only org_admin approves
create policy campaigns_select on campaigns for select
  using (org_id = my_org_id() or is_platform_admin());
create policy campaigns_insert on campaigns for insert
  with check (org_id = my_org_id() and status in ('draft','pending_approval') and requested_by = auth.uid());
create policy campaigns_update_member on campaigns for update
  using (org_id = my_org_id() and status in ('draft','pending_approval','rejected'))
  with check (org_id = my_org_id() and (status in ('draft','pending_approval') or my_role() = 'org_admin'));
create policy campaigns_delete on campaigns for delete
  using (org_id = my_org_id() and status <> 'sent');

create policy campaign_sends_select on campaign_sends for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and (c.org_id = my_org_id() or is_platform_admin()))
);

-- =========================================================
-- Auto-create profile row when an auth user is created
-- (invited users get org_id/role/name from user metadata set by server)
-- =========================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, org_id, role, name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'org_id', '')::uuid,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'member'),
    new.raw_user_meta_data->>'name'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
