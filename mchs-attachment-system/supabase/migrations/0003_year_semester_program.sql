-- ============================================================================
-- Migration 0003: Year/Semester restructure + Program field
-- Replaces the 3-value year_of_study enum (Year 1/2/3) with 6 combined
-- year+semester values, and constrains `program` to the college's two
-- actual programs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- year_of_study: Year 1/2/3 -> 6 year+semester combinations
-- ----------------------------------------------------------------------------

alter table public.students alter column year_of_study type text;
drop type year_of_study;

create type year_of_study as enum (
  'Year 1 - Semester 1',
  'Year 1 - Semester 2',
  'Year 2 - Semester 1',
  'Year 2 - Semester 2',
  'Year 3 - Semester 1',
  'Year 3 - Semester 2'
);

-- Best-effort mapping of any existing data from the old 3-value scheme.
-- Existing students default to Semester 1 of their year; re-assign them
-- to the correct semester manually afterward if needed.
update public.students set year_of_study =
  case year_of_study
    when 'Year 1' then 'Year 1 - Semester 1'
    when 'Year 2' then 'Year 2 - Semester 1'
    when 'Year 3' then 'Year 3 - Semester 1'
    else 'Year 1 - Semester 1'
  end;

alter table public.students
  alter column year_of_study type year_of_study using year_of_study::year_of_study;

-- ----------------------------------------------------------------------------
-- program: free text -> constrained to the college's two actual programs
-- ----------------------------------------------------------------------------

create type program_type as enum (
  'Nursing and Midwifery',
  'Certificate in Midwifery Technicians'
);

alter table public.students alter column program drop default;

alter table public.students
  alter column program type program_type using (
    case
      when program in ('Nursing and Midwifery', 'Certificate in Midwifery Technicians')
        then program::program_type
      else 'Nursing and Midwifery'::program_type
    end
  );

alter table public.students alter column program set default 'Nursing and Midwifery';
alter table public.students alter column program set not null;
