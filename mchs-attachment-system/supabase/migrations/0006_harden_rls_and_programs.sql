-- Migration 0006: Harden profile access and finalize program values

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_super_admin" on public.profiles
  for update
  using (public.current_role_name() = 'super_admin')
  with check (public.current_role_name() = 'super_admin');

drop policy if exists "audit_select_all" on public.audit_log;
create policy "audit_select_admin" on public.audit_log
  for select
  using (public.current_role_name() in ('admin', 'super_admin'));

alter table public.students alter column program drop default;
alter table public.students alter column program type text using program::text;

update public.students
set program = 'Certificate in Midwifery assistant'
where program = 'Certificate in Midwifery Technicians';

drop type if exists program_type;
create type program_type as enum (
  'Nursing and Midwifery',
  'Certificate in Midwifery assistant',
  'Certificate in pharmacy',
  'Diploma in Community Healthy Nursing'
);

alter table public.students
  alter column program type program_type
  using program::program_type;

alter table public.students
  alter column program set default 'Nursing and Midwifery';
