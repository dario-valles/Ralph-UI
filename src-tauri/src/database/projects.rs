// Project database operations
// NOTE: SQLite database is being phased out in favor of file-based storage.
// All functions in this module are kept for legacy compatibility during migration.
#![allow(dead_code)]

use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;

/// Project entity representing a workspace/folder
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_used_at: String,
    pub is_favorite: bool,
    pub created_at: String,
}

/// Create a new project or update if path already exists
pub fn upsert_project(conn: &Connection, path: &str, name: Option<&str>) -> Result<Project> {
    let now = Utc::now().to_rfc3339();

    // Check if project with this path already exists
    let existing: Result<Project> = conn.query_row(
        "SELECT id, path, name, last_used_at, is_favorite, created_at FROM projects WHERE path = ?1",
        params![path],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                last_used_at: row.get(3)?,
                is_favorite: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        },
    );

    match existing {
        Ok(mut project) => {
            // Update last_used_at
            conn.execute(
                "UPDATE projects SET last_used_at = ?1 WHERE id = ?2",
                params![&now, &project.id],
            )?;
            project.last_used_at = now;
            Ok(project)
        }
        Err(_) => {
            // Create new project
            let id = format!("proj_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
            let derived_name = name.unwrap_or_else(|| {
                path.split(['/', '\\']).last().unwrap_or(path)
            });

            conn.execute(
                "INSERT INTO projects (id, path, name, last_used_at, is_favorite, created_at)
                 VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                params![&id, path, derived_name, &now, &now],
            )?;

            Ok(Project {
                id,
                path: path.to_string(),
                name: derived_name.to_string(),
                last_used_at: now.clone(),
                is_favorite: false,
                created_at: now,
            })
        }
    }
}

/// Get a project by ID
pub fn get_project(conn: &Connection, project_id: &str) -> Result<Project> {
    conn.query_row(
        "SELECT id, path, name, last_used_at, is_favorite, created_at FROM projects WHERE id = ?1",
        params![project_id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                last_used_at: row.get(3)?,
                is_favorite: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        },
    )
}

/// Get a project by path
pub fn get_project_by_path(conn: &Connection, path: &str) -> Result<Project> {
    conn.query_row(
        "SELECT id, path, name, last_used_at, is_favorite, created_at FROM projects WHERE path = ?1",
        params![path],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                last_used_at: row.get(3)?,
                is_favorite: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        },
    )
}

/// Get all projects sorted by last_used_at descending
pub fn get_all_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, last_used_at, is_favorite, created_at
         FROM projects
         ORDER BY last_used_at DESC",
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            last_used_at: row.get(3)?,
            is_favorite: row.get::<_, i32>(4)? != 0,
            created_at: row.get(5)?,
        })
    })?;

    projects.collect()
}

/// Get recent projects (limited)
pub fn get_recent_projects(conn: &Connection, limit: i32) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, last_used_at, is_favorite, created_at
         FROM projects
         ORDER BY last_used_at DESC
         LIMIT ?1",
    )?;

    let projects = stmt.query_map(params![limit], |row| {
        Ok(Project {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            last_used_at: row.get(3)?,
            is_favorite: row.get::<_, i32>(4)? != 0,
            created_at: row.get(5)?,
        })
    })?;

    projects.collect()
}

/// Get favorite projects
pub fn get_favorite_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, last_used_at, is_favorite, created_at
         FROM projects
         WHERE is_favorite = 1
         ORDER BY last_used_at DESC",
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            last_used_at: row.get(3)?,
            is_favorite: row.get::<_, i32>(4)? != 0,
            created_at: row.get(5)?,
        })
    })?;

    projects.collect()
}

/// Update project name
pub fn update_project_name(conn: &Connection, project_id: &str, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE projects SET name = ?1 WHERE id = ?2",
        params![name, project_id],
    )?;
    Ok(())
}

/// Toggle project favorite status
pub fn toggle_project_favorite(conn: &Connection, project_id: &str) -> Result<bool> {
    // Get current status
    let is_favorite: i32 = conn.query_row(
        "SELECT is_favorite FROM projects WHERE id = ?1",
        params![project_id],
        |row| row.get(0),
    )?;

    let new_status = if is_favorite == 0 { 1 } else { 0 };

    conn.execute(
        "UPDATE projects SET is_favorite = ?1 WHERE id = ?2",
        params![new_status, project_id],
    )?;

    Ok(new_status == 1)
}

/// Set project favorite status explicitly
pub fn set_project_favorite(conn: &Connection, project_id: &str, is_favorite: bool) -> Result<()> {
    conn.execute(
        "UPDATE projects SET is_favorite = ?1 WHERE id = ?2",
        params![is_favorite as i32, project_id],
    )?;
    Ok(())
}

/// Update last_used_at timestamp (touch)
pub fn touch_project(conn: &Connection, project_id: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET last_used_at = ?1 WHERE id = ?2",
        params![&now, project_id],
    )?;
    Ok(())
}

/// Delete a project
pub fn delete_project(conn: &Connection, project_id: &str) -> Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                last_used_at TEXT NOT NULL,
                is_favorite INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn test_upsert_new_project() {
        let conn = setup_test_db();
        let project = upsert_project(&conn, "/test/path", None).unwrap();

        assert!(!project.id.is_empty());
        assert_eq!(project.path, "/test/path");
        assert_eq!(project.name, "path");
        assert!(!project.is_favorite);
    }

    #[test]
    fn test_upsert_existing_project() {
        let conn = setup_test_db();
        let project1 = upsert_project(&conn, "/test/path", None).unwrap();
        let project2 = upsert_project(&conn, "/test/path", None).unwrap();

        assert_eq!(project1.id, project2.id);
    }

    #[test]
    fn test_get_all_projects() {
        let conn = setup_test_db();
        upsert_project(&conn, "/test/path1", Some("Project 1")).unwrap();
        upsert_project(&conn, "/test/path2", Some("Project 2")).unwrap();

        let projects = get_all_projects(&conn).unwrap();
        assert_eq!(projects.len(), 2);
    }

    #[test]
    fn test_toggle_favorite() {
        let conn = setup_test_db();
        let project = upsert_project(&conn, "/test/path", None).unwrap();

        let is_fav = toggle_project_favorite(&conn, &project.id).unwrap();
        assert!(is_fav);

        let is_fav = toggle_project_favorite(&conn, &project.id).unwrap();
        assert!(!is_fav);
    }

    #[test]
    fn test_update_name() {
        let conn = setup_test_db();
        let project = upsert_project(&conn, "/test/path", None).unwrap();

        update_project_name(&conn, &project.id, "New Name").unwrap();

        let updated = get_project(&conn, &project.id).unwrap();
        assert_eq!(updated.name, "New Name");
    }

    #[test]
    fn test_delete_project() {
        let conn = setup_test_db();
        let project = upsert_project(&conn, "/test/path", None).unwrap();

        delete_project(&conn, &project.id).unwrap();

        let result = get_project(&conn, &project.id);
        assert!(result.is_err());
    }
}
