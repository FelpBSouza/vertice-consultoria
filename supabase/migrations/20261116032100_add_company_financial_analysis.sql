create table if not exists public.vertice_financial_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vertice_companies (id) on delete restrict,
  period_start date not null check (date_trunc('month', period_start::timestamp)::date = period_start),
  revenue numeric(16, 2) not null check (revenue >= 0),
  cost_of_goods_sold numeric(16, 2) not null check (cost_of_goods_sold >= 0),
  purchases numeric(16, 2) not null check (purchases >= 0),
  variable_expenses numeric(16, 2) not null check (variable_expenses >= 0),
  fixed_expenses numeric(16, 2) not null check (fixed_expenses >= 0),
  accounts_receivable numeric(16, 2) not null check (accounts_receivable >= 0),
  inventory numeric(16, 2) not null check (inventory >= 0),
  supplier_payables numeric(16, 2) not null check (supplier_payables >= 0),
  gross_debt numeric(16, 2) not null check (gross_debt >= 0),
  cash_balance numeric(16, 2) not null check (cash_balance >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start)
);

create table if not exists public.vertice_cash_forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vertice_companies (id) on delete restrict,
  period_start date not null check (date_trunc('month', period_start::timestamp)::date = period_start),
  expected_inflows numeric(16, 2) not null check (expected_inflows >= 0),
  expected_outflows numeric(16, 2) not null check (expected_outflows >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start)
);

create or replace function public.vertice_can_access_company(p_company_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select public.vertice_is_admin())
    or exists (
      select 1
      from public.vertice_company_memberships as membership
      where membership.company_id = p_company_id
        and membership.user_id = (select auth.uid())
    );
$$;

revoke all on function public.vertice_can_access_company(uuid) from public, anon;
grant execute on function public.vertice_can_access_company(uuid) to authenticated;

create or replace function public.vertice_set_financial_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := pg_catalog.now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.vertice_set_financial_audit_fields() from public, anon, authenticated;

drop trigger if exists vertice_financial_periods_set_audit_fields on public.vertice_financial_periods;
create trigger vertice_financial_periods_set_audit_fields
  before insert or update on public.vertice_financial_periods
  for each row execute function public.vertice_set_financial_audit_fields();

drop trigger if exists vertice_cash_forecasts_set_audit_fields on public.vertice_cash_forecasts;
create trigger vertice_cash_forecasts_set_audit_fields
  before insert or update on public.vertice_cash_forecasts
  for each row execute function public.vertice_set_financial_audit_fields();

alter table public.vertice_financial_periods enable row level security;
alter table public.vertice_cash_forecasts enable row level security;

revoke all on public.vertice_financial_periods, public.vertice_cash_forecasts from public, anon, authenticated;
grant select, insert, update on public.vertice_financial_periods, public.vertice_cash_forecasts to authenticated;

drop policy if exists vertice_financial_periods_select_access on public.vertice_financial_periods;
create policy vertice_financial_periods_select_access
  on public.vertice_financial_periods
  for select
  to authenticated
  using ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_financial_periods_insert_access on public.vertice_financial_periods;
create policy vertice_financial_periods_insert_access
  on public.vertice_financial_periods
  for insert
  to authenticated
  with check ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_financial_periods_update_access on public.vertice_financial_periods;
create policy vertice_financial_periods_update_access
  on public.vertice_financial_periods
  for update
  to authenticated
  using ((select public.vertice_can_access_company(company_id)))
  with check ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_cash_forecasts_select_access on public.vertice_cash_forecasts;
create policy vertice_cash_forecasts_select_access
  on public.vertice_cash_forecasts
  for select
  to authenticated
  using ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_cash_forecasts_insert_access on public.vertice_cash_forecasts;
create policy vertice_cash_forecasts_insert_access
  on public.vertice_cash_forecasts
  for insert
  to authenticated
  with check ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_cash_forecasts_update_access on public.vertice_cash_forecasts;
create policy vertice_cash_forecasts_update_access
  on public.vertice_cash_forecasts
  for update
  to authenticated
  using ((select public.vertice_can_access_company(company_id)))
  with check ((select public.vertice_can_access_company(company_id)));
