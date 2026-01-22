use serde::{Deserialize, Serialize};

/// Type of configuration field
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConfigFieldType {
    /// Text input
    String,
    /// Boolean toggle
    Boolean,
    /// Numeric input
    Number,
    /// Dropdown selection
    Select { options: Vec<String> },
    /// File path selection
    FilePath,
    /// Directory path selection
    DirectoryPath,
}

/// A single configuration field definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigField {
    /// Unique key for the field (used in config map)
    pub key: String,
    /// Display label for the field
    pub label: String,
    /// Description/Tooltip
    pub description: Option<String>,
    /// Type of the field
    pub field_type: ConfigFieldType,
    /// Default value (optional)
    pub default_value: Option<serde_json::Value>,
    /// Whether the field is required
    pub required: bool,
    /// Whether the field is sensitive (e.g. API keys) - should be masked
    pub secret: bool,
}

/// Schema defining configuration options for a plugin
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginConfigSchema {
    /// List of configuration fields
    pub fields: Vec<ConfigField>,
}

impl PluginConfigSchema {
    pub fn new() -> Self {
        Self { fields: Vec::new() }
    }

    pub fn add_field(mut self, field: ConfigField) -> Self {
        self.fields.push(field);
        self
    }
}
