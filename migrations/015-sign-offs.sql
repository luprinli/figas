-- 015-sign-offs.sql
-- Digital certification records for maintenance work and inspections.

CREATE TABLE IF NOT EXISTS sign_offs (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       INTEGER NOT NULL,
    signed_by       INTEGER NOT NULL REFERENCES users(id),
    signed_at       TIMESTAMPTZ DEFAULT NOW(),
    certification_statement TEXT,
    licence_number  VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sign_offs_entity ON sign_offs(entity_type, entity_id);
