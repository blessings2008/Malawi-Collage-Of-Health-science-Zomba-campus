-- ============================================================================
-- Migration 0005: Update MCHS student programs
-- ============================================================================

-- Keep existing student records valid while replacing the old program enum.
alter table public.students
  alter column program drop default;

alter table public.students
  alter column program type text
  using program::text;

-- Map the previous program names to the new official program names.
update public.students
set program = case program
  when 'Certificate in Midwifery Technicians'
    then 'Certificate in Midwifery assistant'
  when 'Nursing and Midwifery'
    then 'Diploma in Community Healthy Nursing'
  else program
end;

drop type if exists program_type;

create type program_type as enum (
  'Certificate in Midwifery assistant',
  'Certificate in pharmacy',
  'Diploma in Community Healthy Nursing'
);

alter table public.students
  alter column program type program_type
  using program::program_type;

alter table public.students
  alter column program set default 'Certificate in Midwifery assistant';
