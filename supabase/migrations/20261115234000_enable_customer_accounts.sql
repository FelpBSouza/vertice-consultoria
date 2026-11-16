alter table public.vertice_profiles
  drop constraint if exists vertice_profiles_role_check;

alter table public.vertice_profiles
  add constraint vertice_profiles_role_check
  check (role in ('admin', 'advisor', 'company_owner'));

alter table public.vertice_companies
  drop constraint if exists vertice_companies_name_key;

alter table public.vertice_companies
  add constraint vertice_companies_name_length_check
  check (char_length(btrim(name)) between 2 and 150);

alter table public.vertice_companies
  add constraint vertice_companies_sector_length_check
  check (char_length(btrim(sector)) between 1 and 80);

create table if not exists public.vertice_company_memberships (
  user_id uuid primary key references public.vertice_profiles (id) on delete cascade,
  company_id uuid not null references public.vertice_companies (id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now()
);

create index if not exists vertice_company_memberships_company_id_idx
  on public.vertice_company_memberships (company_id);

alter table public.vertice_company_memberships enable row level security;
revoke all on public.vertice_company_memberships from anon, authenticated;
grant select on public.vertice_company_memberships to authenticated;

drop policy if exists vertice_company_memberships_read_self_or_admin
  on public.vertice_company_memberships;
create policy vertice_company_memberships_read_self_or_admin
  on public.vertice_company_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.vertice_is_admin())
  );

create or replace function public.vertice_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text := 'company_owner';
begin
  if exists (
    select 1
    from public.vertice_admin_allowlist as allowlist
    where allowlist.email = lower(new.email)
  ) then
    assigned_role := 'admin';
  end if;

  insert into public.vertice_profiles (id, email, role)
  values (new.id, lower(new.email), assigned_role)
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop policy if exists vertice_companies_admin_select on public.vertice_companies;
drop policy if exists vertice_companies_admin_or_member_select on public.vertice_companies;
create policy vertice_companies_admin_or_member_select
  on public.vertice_companies
  for select
  to authenticated
  using (
    (select public.vertice_is_admin())
    or exists (
      select 1
      from public.vertice_company_memberships as membership
      where membership.company_id = id
        and membership.user_id = (select auth.uid())
    )
  );

create or replace function public.vertice_create_company_for_owner(
  p_name text,
  p_sector text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  company_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.vertice_profiles as profile
    where profile.id = current_user_id
      and profile.role = 'company_owner'
  ) then
    raise exception 'Company owner account required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select membership.company_id
    into company_id
  from public.vertice_company_memberships as membership
  where membership.user_id = current_user_id
  order by membership.created_at
  limit 1;

  if company_id is not null then
    return company_id;
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 150 then
    raise exception 'Company name must contain 2 to 150 characters' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_sector, ''))) not between 1 and 80 then
    raise exception 'Company sector must contain 1 to 80 characters' using errcode = '22023';
  end if;

  insert into public.vertice_companies (name, sector, status, created_by)
  values (btrim(p_name), btrim(p_sector), 'Cadastro inicial', current_user_id)
  returning id into company_id;

  insert into public.vertice_company_memberships (user_id, company_id, role)
  values (current_user_id, company_id, 'owner');

  return company_id;
end;
$$;

revoke all on function public.vertice_create_company_for_owner(text, text) from public, anon;
grant execute on function public.vertice_create_company_for_owner(text, text) to authenticated;
