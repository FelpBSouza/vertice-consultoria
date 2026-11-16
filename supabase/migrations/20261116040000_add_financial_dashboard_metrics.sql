alter table public.vertice_financial_periods
  add column if not exists depreciation_expenses numeric(16, 2) check (depreciation_expenses >= 0),
  add column if not exists financial_expenses numeric(16, 2) check (financial_expenses >= 0),
  add column if not exists tax_expenses numeric(16, 2) check (tax_expenses >= 0);

create table if not exists public.vertice_debt_maturities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vertice_companies (id) on delete restrict,
  period_start date not null check (date_trunc('month', period_start::timestamp)::date = period_start),
  scheduled_amount numeric(16, 2) not null check (scheduled_amount >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start)
);

drop trigger if exists vertice_debt_maturities_set_audit_fields on public.vertice_debt_maturities;
create trigger vertice_debt_maturities_set_audit_fields
  before insert or update on public.vertice_debt_maturities
  for each row execute function public.vertice_set_financial_audit_fields();

alter table public.vertice_debt_maturities enable row level security;
revoke all on public.vertice_debt_maturities from public, anon, authenticated;
grant select, insert, update on public.vertice_debt_maturities to authenticated;

drop policy if exists vertice_debt_maturities_select_access on public.vertice_debt_maturities;
create policy vertice_debt_maturities_select_access
  on public.vertice_debt_maturities
  for select
  to authenticated
  using ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_debt_maturities_insert_access on public.vertice_debt_maturities;
create policy vertice_debt_maturities_insert_access
  on public.vertice_debt_maturities
  for insert
  to authenticated
  with check ((select public.vertice_can_access_company(company_id)));

drop policy if exists vertice_debt_maturities_update_access on public.vertice_debt_maturities;
create policy vertice_debt_maturities_update_access
  on public.vertice_debt_maturities
  for update
  to authenticated
  using ((select public.vertice_can_access_company(company_id)))
  with check ((select public.vertice_can_access_company(company_id)));
