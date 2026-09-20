-- Migration 0007: Normalize manual allocation rule schema

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'manual_allocation_rules'
      AND column_name = 'is_active'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'manual_allocation_rules'
      AND column_name = 'active'
  ) THEN
    ALTER TABLE public.manual_allocation_rules RENAME COLUMN is_active TO active;
  END IF;
END $$;

ALTER TABLE public.manual_allocation_rules
  ALTER COLUMN active SET DEFAULT true;

DROP INDEX IF EXISTS idx_manual_rules_active;
CREATE INDEX IF NOT EXISTS idx_manual_rules_active
  ON public.manual_allocation_rules(active)
  WHERE active = true;

ALTER TABLE public.manual_allocation_rules
  DROP COLUMN IF EXISTS updated_by;
