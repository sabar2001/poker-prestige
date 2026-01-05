-- Poker Prestige Database Schema
-- PostgreSQL 12+

-- Enable UUID extension (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (Steam-based)
CREATE TABLE IF NOT EXISTS users (
    steam_id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    chips BIGINT NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_chips CHECK (chips >= 0)
);

-- Hand histories table (Audit trail)
CREATE TABLE IF NOT EXISTS hand_histories (
    id SERIAL PRIMARY KEY,
    table_id VARCHAR(64) NOT NULL,
    hand_data JSONB NOT NULL,
    winner_ids VARCHAR(64)[] NOT NULL,
    pot_total BIGINT NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for queries
    CONSTRAINT positive_pot CHECK (pot_total >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hand_histories_table_id ON hand_histories(table_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_completed_at ON hand_histories(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hand_histories_winners ON hand_histories USING GIN(winner_ids);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO poker_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO poker_user;

