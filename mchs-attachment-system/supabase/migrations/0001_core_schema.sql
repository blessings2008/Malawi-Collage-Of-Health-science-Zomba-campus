-- ============================================================================
-- Malawi College of Health Sciences — Zomba Campus
-- Clinical Attachment Allocation System
-- Migration 0001: Core Schema
-- ============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------

create type user_role as enum ('super_admin', 'admin', 'lecturer');

create type student_gender as enum ('Male', 'Female', 'Other');

create type year_of_study as enum ('Year 1', 'Year 2', 'Year 3');

create type allocation_status as enum ('Unallocated', 'Allocated', 'Locked');

create type period_status as enum ('Upcoming', 'Current', 'Completed');

create type rotation_status as enum ('New District', 'Repeat Allocation');

create type notification_type as enum (
  'allocation_generated',
  'allocation_finalized',
  'students_unallocated',
  'capacity_exceeded',
  'duplicate_detected',
  'manual_change'
);

-- ----------------------------------------------------------------------------
-- PROFILES (extends Supabase auth.users)
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'lecturer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users with role and display info for admins/lecturers.';

-- ----------------------------------------------------------------------------
-- COHORTS
-- ----------------------------------------------------------------------------

create table public.cohorts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,               -- e.g. "2024 Intake"
  intake_year int not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

-- ----------------------------------------------------------------------------
-- DISTRICTS
-- ----------------------------------------------------------------------------

create table public.districts (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,        -- e.g. "Zomba"
  region text not null,             -- Northern / Central / Southern
  capacity int not null default 0,
  is_active boolean not null default true,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ATTACHMENT PERIODS
-- ----------------------------------------------------------------------------

create table public.attachment_periods (
  id uuid primary key default uuid_generate_v4(),
  name text not null,               -- e.g. "Attachment Period 2 — 2026"
  start_date date not null,
  end_date date not null,
  academic_year int not null,
  status period_status not null default 'Upcoming',
  is_locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_period_dates check (end_date > start_date)
);

-- ----------------------------------------------------------------------------
-- STUDENTS
-- ----------------------------------------------------------------------------

create table public.students (
  id uuid primary key default uuid_generate_v4(),
  student_number text not null unique,   -- e.g. "MCHS-0241"
  full_name text not null,
  gender student_gender not null,
  year_of_study year_of_study not null,
  program text not null default 'Clinical Medicine',
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  phone text,
  email text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_students_cohort on public.students(cohort_id);
create index idx_students_year on public.students(year_of_study);
create index idx_students_gender on public.students(gender);

-- ----------------------------------------------------------------------------
-- ALLOCATIONS (one row per student per attachment period)
-- ----------------------------------------------------------------------------

create table public.allocations (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.students(id) on delete cascade,
  attachment_period_id uuid not null references public.attachment_periods(id) on delete cascade,
  district_id uuid references public.districts(id) on delete set null,
  status allocation_status not null default 'Unallocated',
  rotation_status rotation_status,
  rotation_reason text,             -- e.g. "All alternative districts unavailable"
  is_manual_override boolean not null default false,
  finalized boolean not null default false,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, attachment_period_id)
);

create index idx_allocations_period on public.allocations(attachment_period_id);
create index idx_allocations_district on public.allocations(district_id);
create index idx_allocations_student on public.allocations(student_id);

-- ----------------------------------------------------------------------------
-- AUDIT LOG
-- ----------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  user_name text not null,
  action text not null,             -- e.g. "moved student MCHS-0241 from Ntcheu to Zomba"
  entity_type text not null,        -- 'student' | 'allocation' | 'cohort' | 'district' | 'period' | 'user'
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_entity on public.audit_log(entity_type, entity_id);
create index idx_audit_created on public.audit_log(created_at desc);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  type notification_type not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now()
);

create index idx_notifications_read on public.notifications(is_read, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_cohorts_updated_at before update on public.cohorts
  for each row execute function public.set_updated_at();
create trigger trg_districts_updated_at before update on public.districts
  for each row execute function public.set_updated_at();
create trigger trg_periods_updated_at before update on public.attachment_periods
  for each row execute function public.set_updated_at();
create trigger trg_students_updated_at before update on public.students
  for each row execute function public.set_updated_at();
create trigger trg_allocations_updated_at before update on public.allocations
  for each row execute function public.set_updated_at();
