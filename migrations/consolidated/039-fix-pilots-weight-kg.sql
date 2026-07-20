-- Fix: pilots.weight_kg column — present in Prisma schema but never added via SQL migrations
-- (was previously only created by `prisma db push` running outside the migration pipeline)
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,1) DEFAULT 80.0;
