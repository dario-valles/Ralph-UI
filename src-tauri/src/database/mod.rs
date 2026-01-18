// SQLite database operations and migrations

pub mod tasks;
pub mod sessions;
pub mod agents;
pub mod prd;
pub mod prd_chat;
pub mod projects;

use rusqlite::{Connection, Result, params};
use std::path::Path;

const SCHEMA_VERSION: i32 = 7;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        // Enable foreign key enforcement - must be done on each connection
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        Ok(Self { conn })
    }

    pub fn init(&self) -> Result<()> {
        self.create_metadata_table()?;
        let version = self.get_schema_version()?;

        // Forward compatibility check: prevent app from using database created by newer version
        if version > SCHEMA_VERSION {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Database schema version {} is newer than application version {}. Please upgrade the application.",
                version, SCHEMA_VERSION
            )));
        }

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
        if from_version < 2 {
            self.migrate_to_v2()?;
        }
        if from_version < 3 {
            self.migrate_to_v3()?;
        }
        if from_version < 4 {
            self.migrate_to_v4()?;
        }
        if from_version < 5 {
            self.migrate_to_v5()?;
        }
        if from_version < 6 {
            self.migrate_to_v6()?;
        }
        if from_version < 7 {
            self.migrate_to_v7()?;
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

    fn migrate_to_v2(&self) -> Result<()> {
        // Create session_templates table for Phase 6
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS session_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                config TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // Create session_recovery table for crash recovery
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS session_recovery (
                session_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                state TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.set_schema_version(2)?;
        Ok(())
    }

    fn migrate_to_v3(&self) -> Result<()> {
        // Phase 7.5: PRD Management Tables

        // Create PRD documents table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS prd_documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                template_id TEXT,
                content TEXT NOT NULL,
                quality_score_completeness INTEGER,
                quality_score_clarity INTEGER,
                quality_score_actionability INTEGER,
                quality_score_overall INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                project_path TEXT,
                FOREIGN KEY (template_id) REFERENCES prd_templates(id)
            )",
            [],
        )?;

        // Create PRD templates table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS prd_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                system_template INTEGER DEFAULT 0,
                template_structure TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // Create PRD executions table for tracking execution status
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS prd_executions (
                id TEXT PRIMARY KEY,
                prd_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                total_tasks INTEGER NOT NULL,
                completed_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                config TEXT NOT NULL,
                FOREIGN KEY (prd_id) REFERENCES prd_documents(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Add PRD reference fields to tasks table
        self.conn.execute(
            "ALTER TABLE tasks ADD COLUMN prd_id TEXT",
            [],
        )?;

        self.conn.execute(
            "ALTER TABLE tasks ADD COLUMN prd_section TEXT",
            [],
        )?;

        // Create indexes for PRD tables
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_prd_executions_prd_id ON prd_executions(prd_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_prd_executions_session_id ON prd_executions(session_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_prd_id ON tasks(prd_id)",
            [],
        )?;

        // Insert built-in PRD templates
        self.insert_builtin_templates()?;

        self.set_schema_version(3)?;
        Ok(())
    }

    fn migrate_to_v4(&self) -> Result<()> {
        // Phase 7.5: PRD Chat Tables

        // Create chat_sessions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                prd_id TEXT,
                agent_type TEXT NOT NULL,
                project_path TEXT,
                title TEXT,
                prd_type TEXT,
                guided_mode INTEGER DEFAULT 1,
                quality_score INTEGER,
                template_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (prd_id) REFERENCES prd_documents(id) ON DELETE SET NULL
            )",
            [],
        )?;

        // Create chat_messages table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create indexes for better query performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_sessions_prd_id ON chat_sessions(prd_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at)",
            [],
        )?;

        self.set_schema_version(4)?;
        Ok(())
    }

    fn migrate_to_v5(&self) -> Result<()> {
        // Add source_chat_session_id to track PRDs created from chat
        self.conn.execute(
            "ALTER TABLE prd_documents ADD COLUMN source_chat_session_id TEXT",
            [],
        )?;

        // Add prd_type column to store the type of PRD
        self.conn.execute(
            "ALTER TABLE prd_documents ADD COLUMN prd_type TEXT",
            [],
        )?;

        // Create index for source tracking
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_prd_documents_source_chat ON prd_documents(source_chat_session_id)",
            [],
        )?;

        self.set_schema_version(5)?;
        Ok(())
    }

    fn migrate_to_v6(&self) -> Result<()> {
        // Phase 8: Projects table for workspace organization

        // Create projects table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                last_used_at TEXT NOT NULL,
                is_favorite INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // Create index for faster queries
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_last_used_at ON projects(last_used_at)",
            [],
        )?;

        self.set_schema_version(6)?;
        Ok(())
    }

    fn migrate_to_v7(&self) -> Result<()> {
        // Mission Control: Add indexes for cross-project queries

        // Index for agent status queries (get all active agents)
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)",
            [],
        )?;

        // Index for session status queries (get active sessions)
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)",
            [],
        )?;

        // Index for session project path queries (group sessions by project)
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path)",
            [],
        )?;

        // Index for task status queries
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
            [],
        )?;

        // Index for task completion time (for activity feed)
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at)",
            [],
        )?;

        self.set_schema_version(7)?;
        Ok(())
    }

    fn insert_builtin_templates(&self) -> Result<()> {
        let templates = vec![
            (
                "startup-mvp",
                "Startup MVP",
                "Lean, focused on core features and rapid iteration",
                "🚀",
                r#"{
                    "sections": [
                        {"id": "problem", "title": "Problem Statement", "required": true},
                        {"id": "solution", "title": "Proposed Solution", "required": true},
                        {"id": "users", "title": "Target Users", "required": true},
                        {"id": "user_stories", "title": "User Stories", "required": true},
                        {"id": "mvp_scope", "title": "MVP Scope", "required": true},
                        {"id": "success_metrics", "title": "Success Metrics", "required": true},
                        {"id": "timeline", "title": "Timeline", "required": false}
                    ]
                }"#,
            ),
            (
                "enterprise-feature",
                "Enterprise Feature",
                "Comprehensive with compliance, security, scalability",
                "🏢",
                r#"{
                    "sections": [
                        {"id": "business_case", "title": "Business Case", "required": true},
                        {"id": "requirements", "title": "Requirements", "required": true},
                        {"id": "architecture", "title": "Architecture", "required": true},
                        {"id": "security", "title": "Security & Compliance", "required": true},
                        {"id": "rollout", "title": "Rollout Plan", "required": true}
                    ]
                }"#,
            ),
            (
                "bug-fix",
                "Bug Fix",
                "Structured approach to bug resolution",
                "🐛",
                r#"{
                    "sections": [
                        {"id": "bug_description", "title": "Bug Description", "required": true},
                        {"id": "reproduction", "title": "Steps to Reproduce", "required": true},
                        {"id": "root_cause", "title": "Root Cause Analysis", "required": false},
                        {"id": "solution", "title": "Proposed Solution", "required": true},
                        {"id": "testing", "title": "Testing Plan", "required": true}
                    ]
                }"#,
            ),
            (
                "refactoring",
                "Refactoring",
                "Code improvement and technical debt reduction",
                "⚡",
                r#"{
                    "sections": [
                        {"id": "current_state", "title": "Current State", "required": true},
                        {"id": "issues", "title": "Technical Issues", "required": true},
                        {"id": "goals", "title": "Refactoring Goals", "required": true},
                        {"id": "approach", "title": "Approach", "required": true},
                        {"id": "risks", "title": "Risks & Mitigation", "required": true}
                    ]
                }"#,
            ),
            (
                "api-integration",
                "API/Integration",
                "Third-party service integration",
                "🔌",
                r#"{
                    "sections": [
                        {"id": "integration_goal", "title": "Integration Goal", "required": true},
                        {"id": "api_overview", "title": "API Overview", "required": true},
                        {"id": "endpoints", "title": "Endpoints to Integrate", "required": true},
                        {"id": "data_flow", "title": "Data Flow", "required": true},
                        {"id": "error_handling", "title": "Error Handling", "required": true},
                        {"id": "testing", "title": "Testing Strategy", "required": true}
                    ]
                }"#,
            ),
            (
                "ui-component",
                "UI Component",
                "Frontend component or design system element",
                "🎨",
                r#"{
                    "sections": [
                        {"id": "component_overview", "title": "Component Overview", "required": true},
                        {"id": "design_specs", "title": "Design Specifications", "required": true},
                        {"id": "props_api", "title": "Props & API", "required": true},
                        {"id": "states", "title": "Component States", "required": true},
                        {"id": "accessibility", "title": "Accessibility Requirements", "required": true},
                        {"id": "examples", "title": "Usage Examples", "required": false}
                    ]
                }"#,
            ),
            (
                "backend-service",
                "Backend Service",
                "Microservice or backend module development",
                "🔧",
                r#"{
                    "sections": [
                        {"id": "service_overview", "title": "Service Overview", "required": true},
                        {"id": "api_design", "title": "API Design", "required": true},
                        {"id": "data_model", "title": "Data Model", "required": true},
                        {"id": "business_logic", "title": "Business Logic", "required": true},
                        {"id": "dependencies", "title": "Dependencies", "required": false},
                        {"id": "deployment", "title": "Deployment & Scaling", "required": false}
                    ]
                }"#,
            ),
            (
                "database-migration",
                "Database Migration",
                "Schema changes and data migrations",
                "🗄️",
                r#"{
                    "sections": [
                        {"id": "migration_goal", "title": "Migration Goal", "required": true},
                        {"id": "current_schema", "title": "Current Schema", "required": true},
                        {"id": "target_schema", "title": "Target Schema", "required": true},
                        {"id": "migration_steps", "title": "Migration Steps", "required": true},
                        {"id": "rollback_plan", "title": "Rollback Plan", "required": true},
                        {"id": "data_validation", "title": "Data Validation", "required": true}
                    ]
                }"#,
            ),
            (
                "performance-optimization",
                "Performance Optimization",
                "Speed and efficiency improvements",
                "⚡",
                r#"{
                    "sections": [
                        {"id": "current_metrics", "title": "Current Performance Metrics", "required": true},
                        {"id": "bottlenecks", "title": "Identified Bottlenecks", "required": true},
                        {"id": "target_metrics", "title": "Target Performance", "required": true},
                        {"id": "optimization_plan", "title": "Optimization Approach", "required": true},
                        {"id": "benchmarks", "title": "Benchmarking Strategy", "required": true}
                    ]
                }"#,
            ),
            (
                "security-feature",
                "Security Feature",
                "Authentication, authorization, and security implementations",
                "🔒",
                r#"{
                    "sections": [
                        {"id": "security_goal", "title": "Security Goal", "required": true},
                        {"id": "threat_model", "title": "Threat Model", "required": true},
                        {"id": "implementation", "title": "Security Implementation", "required": true},
                        {"id": "testing", "title": "Security Testing", "required": true},
                        {"id": "compliance", "title": "Compliance Requirements", "required": false}
                    ]
                }"#,
            ),
            (
                "mobile-feature",
                "Mobile Feature",
                "iOS/Android app feature development",
                "📱",
                r#"{
                    "sections": [
                        {"id": "feature_overview", "title": "Feature Overview", "required": true},
                        {"id": "user_flow", "title": "User Flow", "required": true},
                        {"id": "ui_screens", "title": "UI Screens", "required": true},
                        {"id": "platform_specifics", "title": "Platform Specifics", "required": true},
                        {"id": "offline_support", "title": "Offline Support", "required": false},
                        {"id": "testing", "title": "Testing Plan", "required": true}
                    ]
                }"#,
            ),
            (
                "devops-automation",
                "DevOps/Automation",
                "CI/CD, infrastructure, and automation tasks",
                "🔄",
                r#"{
                    "sections": [
                        {"id": "automation_goal", "title": "Automation Goal", "required": true},
                        {"id": "current_process", "title": "Current Process", "required": true},
                        {"id": "target_process", "title": "Target Process", "required": true},
                        {"id": "tools", "title": "Tools & Technologies", "required": true},
                        {"id": "implementation_steps", "title": "Implementation Steps", "required": true},
                        {"id": "monitoring", "title": "Monitoring & Alerts", "required": false}
                    ]
                }"#,
            ),
            (
                "documentation",
                "Documentation",
                "Technical docs, guides, or API documentation",
                "📚",
                r#"{
                    "sections": [
                        {"id": "doc_purpose", "title": "Documentation Purpose", "required": true},
                        {"id": "audience", "title": "Target Audience", "required": true},
                        {"id": "outline", "title": "Document Outline", "required": true},
                        {"id": "examples", "title": "Code Examples", "required": false},
                        {"id": "maintenance", "title": "Maintenance Plan", "required": false}
                    ]
                }"#,
            ),
            (
                "testing-strategy",
                "Testing Strategy",
                "Test plans and quality assurance",
                "🧪",
                r#"{
                    "sections": [
                        {"id": "test_scope", "title": "Test Scope", "required": true},
                        {"id": "test_types", "title": "Test Types", "required": true},
                        {"id": "test_cases", "title": "Key Test Cases", "required": true},
                        {"id": "coverage_goals", "title": "Coverage Goals", "required": true},
                        {"id": "automation", "title": "Test Automation", "required": false},
                        {"id": "environments", "title": "Test Environments", "required": false}
                    ]
                }"#,
            ),
        ];

        let now = chrono::Utc::now().to_rfc3339();

        for (id, name, description, icon, structure) in templates {
            self.conn.execute(
                "INSERT OR IGNORE INTO prd_templates (id, name, description, icon, system_template, template_structure, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7)",
                params![id, name, description, icon, structure, &now, &now],
            )?;
        }

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

    #[test]
    fn test_forward_compatibility_check() {
        let db = Database::new(":memory:").unwrap();
        db.create_metadata_table().unwrap();
        // Set a future schema version that's higher than SCHEMA_VERSION
        db.conn.execute(
            "INSERT INTO schema_metadata (key, value) VALUES ('version', '999')",
            [],
        ).unwrap();

        // init() should fail with forward compatibility error
        let result = db.init();
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("newer than application version"));
    }
}
