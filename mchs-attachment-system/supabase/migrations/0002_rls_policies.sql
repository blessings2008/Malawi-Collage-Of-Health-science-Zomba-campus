-- ============================================================================
-- Migration 0002: Row Level Security
-- The Express API uses the Supabase SERVICE ROLE key and enforces role checks
-- itself (see server/middleware/auth.js), so RLS here is a defense-in-depth
-- backstop in case anon/authenticated keys are ever used directly.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.cohorts enable row level security;
alter table public.districts enable row level security;
alter table public.attachment_periods enable row level security;
alter table public.students enable row level security;
alter table public.allocations enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;

-- Helper: current user's role
create or replace function public.current_role_name()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- Profiles: users can read their own profile; super_admins can read/manage all
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.current_role_name() = 'super_admin');

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.current_role_name() = 'super_admin');

create policy "profiles_insert_super_admin" on public.profiles
  for insert with check (public.current_role_name() = 'super_admin');

-- Read access: all authenticated staff can view core data
create policy "cohorts_select_all" on public.cohorts for select using (auth.uid() is not null);
create policy "districts_select_all" on public.districts for select using (auth.uid() is not null);
create policy "periods_select_all" on public.attachment_periods for select using (auth.uid() is not null);
create policy "students_select_all" on public.students for select using (auth.uid() is not null);
create policy "allocations_select_all" on public.allocations for select using (auth.uid() is not null);
create policy "audit_select_all" on public.audit_log for select using (auth.uid() is not null);
create policy "notifications_select_all" on public.notifications for select using (auth.uid() is not null);

-- Write access: admin + super_admin only (lecturers are read-only per spec)
create policy "cohorts_write_admin" on public.cohorts for all
  using (public.current_role_name() in ('admin', 'super_admin'))
  with check (public.current_role_name() in ('admin', 'super_admin'));

create policy "districts_write_admin" on public.districts for all
  using (public.current_role_name() in ('admin', 'super_admin'))
  with check (public.current_role_name() in ('admin', 'super_admin'));

create policy "periods_write_admin" on public.attachment_periods for all
  using (public.current_role_name() in ('admin', 'super_admin'))
  with check (public.current_role_name() in ('admin', 'super_admin'));

create policy "students_write_admin" on public.students for all
  using (public.current_role_name() in ('admin', 'super_admin'))
  with check (public.current_role_name() in ('admin', 'super_admin'));

create policy "allocations_write_admin" on public.allocations for all
  using (public.current_role_name() in ('admin', 'super_admin'))
  with check (public.current_role_name() in ('admin', 'super_admin'));
