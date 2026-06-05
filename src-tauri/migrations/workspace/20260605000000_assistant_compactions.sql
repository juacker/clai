-- Conversation compaction records.
--
-- The full transcript remains in assistant_messages. These rows record which
-- prefix of a session was summarized and which hidden system message should be
-- used as the provider-facing replacement for that prefix.

CREATE TABLE assistant_compactions (
    id                     TEXT PRIMARY KEY,
    session_id             TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    trigger                TEXT NOT NULL CHECK (trigger IN ('"manual"', '"automatic"', '"error_recovery"')),
    strategy               TEXT NOT NULL CHECK (strategy IN ('"local_summary"', '"session_rotation_summary"')),
    status                 TEXT NOT NULL CHECK (status IN ('"running"', '"completed"', '"failed"')),
    source_from_message_id TEXT REFERENCES assistant_messages(id) ON DELETE SET NULL,
    source_to_message_id   TEXT REFERENCES assistant_messages(id) ON DELETE SET NULL,
    summary_message_id     TEXT REFERENCES assistant_messages(id) ON DELETE SET NULL,
    created_run_id         TEXT REFERENCES assistant_runs(id) ON DELETE SET NULL,
    provider_id            TEXT NOT NULL,
    model_id               TEXT NOT NULL,
    input_message_count    INTEGER NOT NULL DEFAULT 0,
    created_at             INTEGER NOT NULL,
    completed_at           INTEGER,
    error                  TEXT
);

CREATE INDEX idx_assistant_compactions_session_created
    ON assistant_compactions(session_id, created_at DESC);

CREATE INDEX idx_assistant_compactions_session_status
    ON assistant_compactions(session_id, status, created_at DESC);
