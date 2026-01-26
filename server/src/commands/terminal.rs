// Backend commands for terminal custom commands management
//
// Stores custom commands in {projectPath}/.ralph-ui/terminal/commands.json

use serde_json::Value;
use std::path::{Path, PathBuf};

fn get_global_commands_dir() -> Result<PathBuf, String> {
    // Get home directory
    let home_dir =
        dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;

    let commands_dir = home_dir.join(".ralph-ui").join("terminal");
    Ok(commands_dir)
}

/// Save project-scoped commands to .ralph-ui/terminal/commands.json
pub async fn save_project_commands(
    project_path: String,
    commands: Vec<Value>,
) -> Result<Value, String> {
    let project_dir = Path::new(&project_path);
    let commands_dir = project_dir.join(".ralph-ui").join("terminal");

    // Create the directory if it doesn't exist
    std::fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create .ralph-ui/terminal directory: {}", e))?;

    let commands_file = commands_dir.join("commands.json");

    // Write commands to file atomically (write to temp, then rename)
    let temp_file = commands_file.with_extension("tmp");
    let json_content = serde_json::to_string_pretty(&commands)
        .map_err(|e| format!("Failed to serialize commands: {}", e))?;

    std::fs::write(&temp_file, json_content)
        .map_err(|e| format!("Failed to write commands to temp file: {}", e))?;

    // Rename temp file to final location (atomic operation)
    std::fs::rename(&temp_file, &commands_file)
        .map_err(|e| format!("Failed to save commands file: {}", e))?;

    Ok(Value::String(format!(
        "Saved {} commands to {}",
        commands.len(),
        commands_file.display()
    )))
}

/// Load project-scoped commands from .ralph-ui/terminal/commands.json
pub async fn load_project_commands(project_path: String) -> Result<Vec<Value>, String> {
    let project_dir = Path::new(&project_path);
    let commands_file = project_dir
        .join(".ralph-ui")
        .join("terminal")
        .join("commands.json");

    // If file doesn't exist, return empty list
    if !commands_file.exists() {
        return Ok(Vec::new());
    }

    // Read and parse the commands file
    let content = std::fs::read_to_string(&commands_file)
        .map_err(|e| format!("Failed to read commands file: {}", e))?;

    serde_json::from_str::<Vec<Value>>(&content)
        .map_err(|e| format!("Failed to parse commands file: {}", e))
}

/// Save global commands to ~/.ralph-ui/terminal/commands.json
pub async fn save_global_commands(commands: Vec<Value>) -> Result<Value, String> {
    let commands_dir = get_global_commands_dir()?;

    // Create the directory if it doesn't exist
    std::fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create ~/.ralph-ui/terminal directory: {}", e))?;

    let commands_file = commands_dir.join("commands.json");

    // Write commands to file atomically (write to temp, then rename)
    let temp_file = commands_file.with_extension("tmp");
    let json_content = serde_json::to_string_pretty(&commands)
        .map_err(|e| format!("Failed to serialize commands: {}", e))?;

    std::fs::write(&temp_file, json_content)
        .map_err(|e| format!("Failed to write commands to temp file: {}", e))?;

    // Rename temp file to final location (atomic operation)
    std::fs::rename(&temp_file, &commands_file)
        .map_err(|e| format!("Failed to save commands file: {}", e))?;

    Ok(Value::String(format!(
        "Saved {} global commands to {}",
        commands.len(),
        commands_file.display()
    )))
}

/// Load global commands from ~/.ralph-ui/terminal/commands.json
pub async fn load_global_commands() -> Result<Vec<Value>, String> {
    let commands_dir = get_global_commands_dir()?;
    let commands_file = commands_dir.join("commands.json");

    // If file doesn't exist, return empty list
    if !commands_file.exists() {
        return Ok(Vec::new());
    }

    // Read and parse the commands file
    let content = std::fs::read_to_string(&commands_file)
        .map_err(|e| format!("Failed to read global commands file: {}", e))?;

    serde_json::from_str::<Vec<Value>>(&content)
        .map_err(|e| format!("Failed to parse global commands file: {}", e))
}
