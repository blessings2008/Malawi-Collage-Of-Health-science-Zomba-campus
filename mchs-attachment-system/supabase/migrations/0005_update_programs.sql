-- ============================================================================
-- Migration 0005: Update MCHS student programs
-- ============================================================================

alter table public.students
  alter column program drop default;

alter table public.students
  alter column program type text
  using program::text;

-- Preserve the existing programs and add the newly requested programs.
update public.students
set program = case program
  when 'Certificate in Midwifery assistant' then 'Certificate in Midwifery assistant'
  when 'Certificate in pharmacy' then 'Certificate in pharmacy'
  when 'Diploma in Community Healthy Nursing' then 'Diploma in Community Healthy Nursing'
  when 'Certificate in Midwifery Technicians' then 'Certificate in Midwifery Technicians'
  when 'Nursing and Midwifery' then 'Nursing and Midwifery'
  else 'Nursing and Midwifery'
end;

drop type if exists program_type;

create type program_type as enum (
  'Nursing and Midwifery',
  'Certificate in Midwifery Technicians',
  'Certificate in Midwifery assistant',
  'Certificate in pharmacy',
  'Diploma in Community Healthy Nursing'
);

alter table public.students
  alter column program type program_type
  using program::program_type;

alter table public.students
  alter column program set default 'Nursing and Midwifery';
