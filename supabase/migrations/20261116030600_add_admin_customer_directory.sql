alter table public.vertice_profiles
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists company_name text,
  add column if not exists company_sector text;

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

  insert into public.vertice_profiles (
    id,
    email,
    role,
    email_confirmed_at,
    company_name,
    company_sector
  )
  values (
    new.id,
    lower(new.email),
    assigned_role,
    new.email_confirmed_at,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'company_name', '')), 150), ''),
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'company_sector', '')), 80), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        email_confirmed_at = excluded.email_confirmed_at,
        company_name = excluded.company_name,
        company_sector = excluded.company_sector;

  return new;
end;
$$;

create or replace function public.vertice_sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vertice_profiles
  set email = lower(new.email),
      email_confirmed_at = new.email_confirmed_at
  where id = new.id;

  return new;
end;
$$;

revoke all on function public.vertice_sync_auth_user_profile() from public, anon, authenticated;

drop trigger if exists vertice_sync_auth_user_profile_after_update on auth.users;
create trigger vertice_sync_auth_user_profile_after_update
  after update of email, email_confirmed_at on auth.users
  for each row
  when (
    old.email is distinct from new.email
    or old.email_confirmed_at is distinct from new.email_confirmed_at
  )
  execute function public.vertice_sync_auth_user_profile();

update public.vertice_profiles as profile
set email = lower(auth_user.email),
    email_confirmed_at = auth_user.email_confirmed_at,
    company_name = nullif(left(btrim(coalesce(auth_user.raw_user_meta_data ->> 'company_name', '')), 150), ''),
    company_sector = nullif(left(btrim(coalesce(auth_user.raw_user_meta_data ->> 'company_sector', '')), 80), '')
from auth.users as auth_user
where auth_user.id = profile.id;
