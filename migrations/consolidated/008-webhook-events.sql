-- webhook_events: Dead letter queue for payment gateway webhooks
-- Tracks every inbound webhook for observability and replay capability.

CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL DEFAULT 'stripe',
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'received',
    attempts INTEGER NOT NULL DEFAULT 1,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);
