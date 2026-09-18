-- ============================================================================
-- Migration 0004: Super Admin Manual Allocation Rules
-- A rule groups students that must be allocated to the same district on future
-- allocation runs. Rules are not student-facing; audit log is the only record
-- of the administrative intervention.
-- ============================================================================

create table public.manual_allocation_rules (
  id uuid primary key default uuid_generate_v4(),
  district_id uuid not null references public.districts(id) on delete restrict,
  note text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.manual_allocation_rule_students (
  rule_id uuid not null references public.manual_allocation_rules(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rule_id, student_id)
);

create index idx_manual_rules_active on public.manual_allocation_rules(is_active);
create index idx_manual_rules_district on public.manual_allocation_rules(district_id);
create index idx_manual_rule_students_student on public.manual_allocation_rule_students(student_id);

create trigger trg_manual_rules_updated_at
before update on public.manual_allocation_rules
for each row execute function public.set_updated_at();

alter table public.manual_allocation_rules enable row level security;
alter table public.manual_allocation_rule_students enable row level security;

-- These rules are managed through the authenticated Express API using the
-- service-role key. RLS remains restrictive for direct client access.
create policy "manual_rules_select_super_admin"
on public.manual_allocation_rules
for select to authenticated
using (public.current_role_name() = 'super_admin');

create policy "manual_rule_students_select_super_admin"
on public.manual_allocation_rule_students
for select to authenticated
using (public.current_role_name() = 'super_admin');

-- Only the backend service role performs writes. No direct client write policy
-- is intentionally provided.
