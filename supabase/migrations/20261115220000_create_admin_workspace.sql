create table if not exists public.vertice_admin_allowlist (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.vertice_admin_allowlist enable row level security;
revoke all on public.vertice_admin_allowlist from anon, authenticated;

create table if not exists public.vertice_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null default 'advisor' check (role in ('admin', 'advisor')),
  created_at timestamptz not null default now()
);

create table if not exists public.vertice_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sector text not null default 'Outro',
  monthly_revenue numeric(14, 2) not null default 0 check (monthly_revenue >= 0),
  ebitda numeric(14, 2),
  status text not null default 'Cadastro inicial',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.vertice_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vertice_profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  );
$$;

revoke all on function public.vertice_is_admin() from public, anon;
grant execute on function public.vertice_is_admin() to authenticated;

create or replace function public.vertice_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text := 'advisor';
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

revoke all on function public.vertice_handle_new_user() from public, anon, authenticated;

drop trigger if exists vertice_on_auth_user_created on auth.users;
create trigger vertice_on_auth_user_created
  after insert on auth.users
  for each row execute function public.vertice_handle_new_user();

alter table public.vertice_profiles enable row level security;
alter table public.vertice_companies enable row level security;

drop policy if exists vertice_profiles_read_self_or_admin on public.vertice_profiles;
create policy vertice_profiles_read_self_or_admin
  on public.vertice_profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.vertice_is_admin()));

drop policy if exists vertice_companies_admin_select on public.vertice_companies;
create policy vertice_companies_admin_select
  on public.vertice_companies
  for select
  to authenticated
  using ((select public.vertice_is_admin()));

drop policy if exists vertice_companies_admin_insert on public.vertice_companies;
create policy vertice_companies_admin_insert
  on public.vertice_companies
  for insert
  to authenticated
  with check ((select public.vertice_is_admin()));

drop policy if exists vertice_companies_admin_update on public.vertice_companies;
create policy vertice_companies_admin_update
  on public.vertice_companies
  for update
  to authenticated
  using ((select public.vertice_is_admin()))
  with check ((select public.vertice_is_admin()));

drop policy if exists vertice_companies_admin_delete on public.vertice_companies;
create policy vertice_companies_admin_delete
  on public.vertice_companies
  for delete
  to authenticated
  using ((select public.vertice_is_admin()));

revoke all on public.vertice_profiles, public.vertice_companies from anon;
grant select on public.vertice_profiles to authenticated;
grant select, insert, update, delete on public.vertice_companies to authenticated;

insert into public.vertice_companies (name, sector, monthly_revenue, ebitda, status)
values
  ('Orla Café e Alimentos Ltda.', 'Alimentação', 720000, 116000, 'Análise em andamento'),
  ('NorteLog Transportes Ltda.', 'Logística', 1800000, 190000, 'Dados pendentes'),
  ('VivaForma Saúde Ltda.', 'Saúde', 540000, 92000, 'Análise em andamento'),
  ('Casa Brava Móveis Ltda.', 'Comércio', 380000, 42000, 'Revisão necessária'),
  ('TecnoLume Sistemas Ltda.', 'Tecnologia', 650000, 155000, 'Análise em andamento')
on conflict (name) do nothing;
