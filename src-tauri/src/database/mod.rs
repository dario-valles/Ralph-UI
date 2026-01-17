// SQLite database operations and migrations

pub mod tasks;
pub mod sessions;

use rusqlite::{Connection, Result, params};
use std::path::Path;

const SCHEMA_VERSION: i32 = 1;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Self { conn })
    }

    pub fn init(&self) -> Result<()> {
        self.create_metadata_table()?;
        let version = self.get_schema_version()?;

        if version < SCHEMA_VERSION {
            self.run_migrations(version)?;
        }

        Ok(())
    }

    fn create_metadata_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    fn get_schema_version(&self) -> Result<i32> {
        let version: Result<String> = self.conn.query_row(
            "SELECT value FROM schema_metadata WHERE key = 'version'",
            [],
            |row| row.get(0),
        );

        match version {
            Ok(v) => Ok(v.parse().unwrap_or(0)),
            Err(_) => {
                self.conn.execute(
                    "INSERT INTO schema_metadata (key, value) VALUES ('version', '0')",
                    [],
                )?;
                Ok(0)
            }
        }
    }

    fn set_schema_version(&self, version: i32) -> Result<()> {
        self.conn.execute(
            "UPDATE schema_metadata SET value = ?1 WHERE key = 'version'",
            params![version.to_string()],
        )?;
        Ok(())
    }

    fn run_migrations(&self, from_version: i32) -> Result<()> {
        if from_version < 1 {
            self.migrate_to_v1()?;
        }
        // Future migrations will be added here
        Ok(())
    }

    fn migrate_to_v1(&self) -> Result<()> {
        // Create sessions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                project_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_resumed_at TEXT,
                status TEXT NOT NULL,
                max_parallel INTEGER NOT NULL,
                max_iterations INTEGER NOT NULL,
                max_retries INTEGER NOT NULL,
                agent_type TEXT NOT NULL,
                auto_create_prs INTEGER NOT NULL,
                draft_prs INTEGER NOT NULL,
                run_tests INTEGER NOT NULL,
                run_lint INTEGER NOT NULL,
                total_cost REAL NOT NULL,
                total_tokens INTEGER NOT NULL
            )",
            [],
        )?;

        // Create tasks table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                priority INTEGER NOT NULL,
                dependencies TEXT,
                assigned_agent TEXT,
                estimated_tokens INTEGER,
                actual_tokens INTEGER,
                started_at TEXT,
                completed_at TEXT,
                branch TEXT,
                worktree_path TEXT,
                error TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create agents table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                status TEXT NOT NULL,
                process_id INTEGER,
                worktree_path TEXT NOT NULL,
                branch TEXT NOT NULL,
                iteration_count INTEGER NOT NULL,
                tokens INTEGER NOT NULL,
                cost REAL NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create logs table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create indexes for better query performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agents_session_id ON agents(session_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_logs_agent_id ON logs(agent_id)",
            [],
        )?;

        self.set_schema_version(1)?;
        Ok(())
    }

    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_creation() {
        let db = Database::new(":memory:");
        assert!(db.is_ok());
    }

    #[test]
    fn test_database_init() {
        let db = Database::new(":memory:").unwrap();
        let result = db.init();
        assert!(result.is_ok());
    }

    #[test]
    fn test_schema_version() {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();
        let version = db.get_schema_version().unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }
}
