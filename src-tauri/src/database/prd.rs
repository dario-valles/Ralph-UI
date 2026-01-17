// PRD database operations
#![allow(dead_code)]

use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRDDocument {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub template_id: Option<String>,
    pub content: String,
    pub quality_score_completeness: Option<i32>,
    pub quality_score_clarity: Option<i32>,
    pub quality_score_actionability: Option<i32>,
    pub quality_score_overall: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
    pub version: i32,
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRDTemplate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub system_template: bool,
    pub template_structure: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRDExecution {
    pub id: String,
    pub prd_id: String,
    pub session_id: String,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_tasks: i32,
    pub completed_tasks: i32,
    pub failed_tasks: i32,
    pub config: String,
}

impl super::Database {
    // PRD Document operations

    pub fn create_prd(&self, prd: &PRDDocument) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO prd_documents (
                id, title, description, template_id, content,
                quality_score_completeness, quality_score_clarity,
                quality_score_actionability, quality_score_overall,
                created_at, updated_at, version, project_path
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                prd.id,
                prd.title,
                prd.description,
                prd.template_id,
                prd.content,
                prd.quality_score_completeness,
                prd.quality_score_clarity,
                prd.quality_score_actionability,
                prd.quality_score_overall,
                prd.created_at,
                prd.updated_at,
                prd.version,
                prd.project_path,
            ],
        )?;
        Ok(())
    }

    pub fn get_prd(&self, id: &str) -> Result<PRDDocument> {
        self.get_connection().query_row(
            "SELECT id, title, description, template_id, content,
                    quality_score_completeness, quality_score_clarity,
                    quality_score_actionability, quality_score_overall,
                    created_at, updated_at, version, project_path
             FROM prd_documents WHERE id = ?1",
            params![id],
            |row| {
                Ok(PRDDocument {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    template_id: row.get(3)?,
                    content: row.get(4)?,
                    quality_score_completeness: row.get(5)?,
                    quality_score_clarity: row.get(6)?,
                    quality_score_actionability: row.get(7)?,
                    quality_score_overall: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    version: row.get(11)?,
                    project_path: row.get(12)?,
                })
            },
        )
    }

    pub fn update_prd(&self, prd: &PRDDocument) -> Result<()> {
        self.get_connection().execute(
            "UPDATE prd_documents SET
                title = ?1, description = ?2, template_id = ?3, content = ?4,
                quality_score_completeness = ?5, quality_score_clarity = ?6,
                quality_score_actionability = ?7, quality_score_overall = ?8,
                updated_at = ?9, version = ?10, project_path = ?11
             WHERE id = ?12",
            params![
                prd.title,
                prd.description,
                prd.template_id,
                prd.content,
                prd.quality_score_completeness,
                prd.quality_score_clarity,
                prd.quality_score_actionability,
                prd.quality_score_overall,
                prd.updated_at,
                prd.version,
                prd.project_path,
                prd.id,
            ],
        )?;
        Ok(())
    }

    pub fn delete_prd(&self, id: &str) -> Result<()> {
        self.get_connection().execute(
            "DELETE FROM prd_documents WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn list_prds(&self) -> Result<Vec<PRDDocument>> {
        let conn = self.get_connection();
        let mut stmt = conn.prepare(
            "SELECT id, title, description, template_id, content,
                    quality_score_completeness, quality_score_clarity,
                    quality_score_actionability, quality_score_overall,
                    created_at, updated_at, version, project_path
             FROM prd_documents
             ORDER BY updated_at DESC",
        )?;

        let prds = stmt.query_map([], |row| {
            Ok(PRDDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                template_id: row.get(3)?,
                content: row.get(4)?,
                quality_score_completeness: row.get(5)?,
                quality_score_clarity: row.get(6)?,
                quality_score_actionability: row.get(7)?,
                quality_score_overall: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                version: row.get(11)?,
                project_path: row.get(12)?,
            })
        })?;

        prds.collect()
    }

    // PRD Template operations

    pub fn get_template(&self, id: &str) -> Result<PRDTemplate> {
        self.get_connection().query_row(
            "SELECT id, name, description, icon, system_template, template_structure, created_at, updated_at
             FROM prd_templates WHERE id = ?1",
            params![id],
            |row| {
                Ok(PRDTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    icon: row.get(3)?,
                    system_template: row.get::<_, i32>(4)? == 1,
                    template_structure: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
    }

    pub fn list_templates(&self) -> Result<Vec<PRDTemplate>> {
        let conn = self.get_connection();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, icon, system_template, template_structure, created_at, updated_at
             FROM prd_templates
             ORDER BY system_template DESC, name ASC",
        )?;

        let templates = stmt.query_map([], |row| {
            Ok(PRDTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                system_template: row.get::<_, i32>(4)? == 1,
                template_structure: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        templates.collect()
    }

    pub fn create_template(&self, template: &PRDTemplate) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO prd_templates (id, name, description, icon, system_template, template_structure, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                template.id,
                template.name,
                template.description,
                template.icon,
                if template.system_template { 1 } else { 0 },
                template.template_structure,
                template.created_at,
                template.updated_at,
            ],
        )?;
        Ok(())
    }

    // PRD Execution operations

    pub fn create_prd_execution(&self, execution: &PRDExecution) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO prd_executions (
                id, prd_id, session_id, status, started_at, completed_at,
                total_tasks, completed_tasks, failed_tasks, config
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                execution.id,
                execution.prd_id,
                execution.session_id,
                execution.status,
                execution.started_at,
                execution.completed_at,
                execution.total_tasks,
                execution.completed_tasks,
                execution.failed_tasks,
                execution.config,
            ],
        )?;
        Ok(())
    }

    pub fn get_prd_execution(&self, id: &str) -> Result<PRDExecution> {
        self.get_connection().query_row(
            "SELECT id, prd_id, session_id, status, started_at, completed_at,
                    total_tasks, completed_tasks, failed_tasks, config
             FROM prd_executions WHERE id = ?1",
            params![id],
            |row| {
                Ok(PRDExecution {
                    id: row.get(0)?,
                    prd_id: row.get(1)?,
                    session_id: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    completed_at: row.get(5)?,
                    total_tasks: row.get(6)?,
                    completed_tasks: row.get(7)?,
                    failed_tasks: row.get(8)?,
                    config: row.get(9)?,
                })
            },
        )
    }

    pub fn update_prd_execution(&self, execution: &PRDExecution) -> Result<()> {
        self.get_connection().execute(
            "UPDATE prd_executions SET
                status = ?1, completed_at = ?2, completed_tasks = ?3, failed_tasks = ?4
             WHERE id = ?5",
            params![
                execution.status,
                execution.completed_at,
                execution.completed_tasks,
                execution.failed_tasks,
                execution.id,
            ],
        )?;
        Ok(())
    }

    pub fn get_prd_executions_by_prd(&self, prd_id: &str) -> Result<Vec<PRDExecution>> {
        let conn = self.get_connection();
        let mut stmt = conn.prepare(
            "SELECT id, prd_id, session_id, status, started_at, completed_at,
                    total_tasks, completed_tasks, failed_tasks, config
             FROM prd_executions WHERE prd_id = ?1
             ORDER BY started_at DESC",
        )?;

        let executions = stmt.query_map(params![prd_id], |row| {
            Ok(PRDExecution {
                id: row.get(0)?,
                prd_id: row.get(1)?,
                session_id: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                completed_at: row.get(5)?,
                total_tasks: row.get(6)?,
                completed_tasks: row.get(7)?,
                failed_tasks: row.get(8)?,
                config: row.get(9)?,
            })
        })?;

        executions.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    #[test]
    fn test_create_and_get_prd() {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();

        let prd = PRDDocument {
            id: "test-prd-1".to_string(),
            title: "Test PRD".to_string(),
            description: Some("A test PRD".to_string()),
            template_id: Some("startup-mvp".to_string()),
            content: "{}".to_string(),
            quality_score_completeness: Some(85),
            quality_score_clarity: Some(90),
            quality_score_actionability: Some(88),
            quality_score_overall: Some(87),
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            version: 1,
            project_path: Some("/test/project".to_string()),
        };

        db.create_prd(&prd).unwrap();
        let retrieved = db.get_prd("test-prd-1").unwrap();

        assert_eq!(retrieved.id, prd.id);
        assert_eq!(retrieved.title, prd.title);
        assert_eq!(retrieved.quality_score_overall, Some(87));
    }

    #[test]
    fn test_list_prds() {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();

        let prd1 = PRDDocument {
            id: "test-prd-1".to_string(),
            title: "Test PRD 1".to_string(),
            description: None,
            template_id: None,
            content: "{}".to_string(),
            quality_score_completeness: None,
            quality_score_clarity: None,
            quality_score_actionability: None,
            quality_score_overall: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            version: 1,
            project_path: None,
        };

        db.create_prd(&prd1).unwrap();
        let prds = db.list_prds().unwrap();

        assert_eq!(prds.len(), 1);
        assert_eq!(prds[0].title, "Test PRD 1");
    }

    #[test]
    fn test_list_builtin_templates() {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();

        let templates = db.list_templates().unwrap();

        assert_eq!(templates.len(), 5);
        assert!(templates.iter().any(|t| t.id == "startup-mvp"));
        assert!(templates.iter().any(|t| t.id == "enterprise-feature"));
    }
}
