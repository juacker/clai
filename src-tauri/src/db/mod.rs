//! Database module for workspace state persistence.
//!
//! Uses SQLite via SQLx to store tabs and commands state.
//! This enables full workspace restoration on app restart.

use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::PathBuf;

/// Type alias for SQLite connection pool
pub type DbPool = Pool<Sqlite>;

/// Get the database file path in the app's data directory
fn get_db_path() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir().ok_or_else(|| "Could not find data directory".to_string())?;

    let app_dir = data_dir.join("clai");

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_dir.join("workspace.db"))
}

/// Initialize the database connection pool and run migrations
pub async fn init_db() -> Result<DbPool, String> {
    let db_path = get_db_path()?;
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    tracing::info!("Initializing database at: {}", db_path.display());

    // Create connection pool
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Run schema migrations
    run_migrations(&pool).await?;

    tracing::info!("Database initialized successfully");
    Ok(pool)
}

/// Run database schema migrations
async fn run_migrations(pool: &DbPool) -> Result<(), String> {
    // Create tabs table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tabs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            root_tile TEXT NOT NULL,
            context TEXT NOT NULL,
            position INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create tabs table: {}", e))?;

    // Create commands table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS commands (
            id TEXT PRIMARY KEY,
            tab_id TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
            tile_id TEXT NOT NULL,
            type TEXT NOT NULL,
            args TEXT,
            state TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create commands table: {}", e))?;

    // Create index on commands.tab_id
    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_commands_tab ON commands(tab_id)
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create commands index: {}", e))?;

    // Create workspace_meta table for active tab tracking
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workspace_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create workspace_meta table: {}", e))?;

    // Enable foreign keys
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    Ok(())
}
