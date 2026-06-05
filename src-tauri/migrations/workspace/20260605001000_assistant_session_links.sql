-- Explicit assistant session ancestry for rotated sessions.
--
-- A child session can continue the same workspace after compaction/rotation
-- while older transcript pages remain available through its parent chain.

CREATE TABLE assistant_session_links (
    child_session_id  TEXT PRIMARY KEY REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    parent_session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    kind              TEXT NOT NULL CHECK (kind IN ('rotation')),
    created_at        INTEGER NOT NULL
);

CREATE INDEX idx_assistant_session_links_parent
    ON assistant_session_links(parent_session_id, created_at DESC);
