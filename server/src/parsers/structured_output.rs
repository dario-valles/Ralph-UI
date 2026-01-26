// Structured output parser - extracts JSON blocks from agent responses

use crate::models::{ExtractedPRDStructure, PRDItemType, StructuredPRDItem};
use regex::Regex;
use std::collections::HashSet;

/// Error type for structured output parsing
#[derive(Debug, Clone)]
pub struct StructuredOutputError {
    pub message: String,
    pub item_index: Option<usize>,
}

impl std::fmt::Display for StructuredOutputError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(idx) = self.item_index {
            write!(f, "Item {}: {}", idx, self.message)
        } else {
            write!(f, "{}", self.message)
        }
    }
}

impl std::error::Error for StructuredOutputError {}

/// Extract JSON code blocks from markdown content
/// Returns all ```json ... ``` blocks found in the content
pub fn extract_json_blocks(content: &str) -> Vec<String> {
    let re = Regex::new(r"```json\s*\n([\s\S]*?)```").unwrap();
    re.captures_iter(content)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}

/// Parse a JSON block into a StructuredPRDItem
/// Returns None if the JSON is not a valid PRD item (e.g., might be other JSON)
pub fn parse_json_block(json_str: &str) -> Option<StructuredPRDItem> {
    // Try to parse as a StructuredPRDItem
    serde_json::from_str::<StructuredPRDItem>(json_str).ok()
}

/// Extract all structured PRD items from content
pub fn extract_items(content: &str) -> Vec<StructuredPRDItem> {
    let json_blocks = extract_json_blocks(content);
    json_blocks
        .iter()
        .filter_map(|block| parse_json_block(block))
        .collect()
}

/// Validate a PRD item for required fields and consistency
pub fn validate_prd_item(item: &StructuredPRDItem) -> Result<(), StructuredOutputError> {
    // ID is required
    if item.id.is_empty() {
        return Err(StructuredOutputError {
            message: "Item ID is required".to_string(),
            item_index: None,
        });
    }

    // Title is required
    if item.title.is_empty() {
        return Err(StructuredOutputError {
            message: format!("Item '{}' has empty title", item.id),
            item_index: None,
        });
    }

    // Validate priority range (1-5)
    if let Some(priority) = item.priority {
        if !(1..=5).contains(&priority) {
            return Err(StructuredOutputError {
                message: format!(
                    "Item '{}' has invalid priority {} (must be 1-5)",
                    item.id, priority
                ),
                item_index: None,
            });
        }
    }

    // User stories should have acceptance criteria
    if item.item_type == PRDItemType::UserStory && item.acceptance_criteria.is_none() {
        // This is a warning, not an error - we allow it but could log it
    }

    Ok(())
}

/// Merge new items into an existing structure, deduplicating by ID
pub fn merge_items(existing: &mut ExtractedPRDStructure, new_items: Vec<StructuredPRDItem>) {
    // Track existing IDs
    let mut existing_ids: HashSet<String> = HashSet::new();

    for item in &existing.epics {
        existing_ids.insert(item.id.clone());
    }
    for item in &existing.user_stories {
        existing_ids.insert(item.id.clone());
    }
    for item in &existing.tasks {
        existing_ids.insert(item.id.clone());
    }
    for item in &existing.acceptance_criteria {
        existing_ids.insert(item.id.clone());
    }

    // Add new items, skipping duplicates
    for item in new_items {
        if existing_ids.contains(&item.id) {
            // Update existing item instead of adding duplicate
            update_existing_item(existing, &item);
        } else {
            // Add new item to appropriate list
            add_item_to_structure(existing, item.clone());
            existing_ids.insert(item.id);
        }
    }
}

/// Add an item to the appropriate list in the structure
fn add_item_to_structure(structure: &mut ExtractedPRDStructure, item: StructuredPRDItem) {
    match item.item_type {
        PRDItemType::Epic => structure.epics.push(item),
        PRDItemType::UserStory => structure.user_stories.push(item),
        PRDItemType::Task => structure.tasks.push(item),
        PRDItemType::AcceptanceCriteria => structure.acceptance_criteria.push(item),
    }
}

/// Update an existing item in the structure
fn update_existing_item(structure: &mut ExtractedPRDStructure, updated: &StructuredPRDItem) {
    let target_list = match updated.item_type {
        PRDItemType::Epic => &mut structure.epics,
        PRDItemType::UserStory => &mut structure.user_stories,
        PRDItemType::Task => &mut structure.tasks,
        PRDItemType::AcceptanceCriteria => &mut structure.acceptance_criteria,
    };

    if let Some(existing) = target_list.iter_mut().find(|i| i.id == updated.id) {
        *existing = updated.clone();
    }
}

/// Extract and categorize all PRD items from content
pub fn extract_prd_structure(content: &str) -> ExtractedPRDStructure {
    let items = extract_items(content);
    let mut structure = ExtractedPRDStructure::default();

    for item in items {
        if validate_prd_item(&item).is_ok() {
            add_item_to_structure(&mut structure, item);
        }
    }

    structure
}

/// Get counts of items by type
pub fn get_item_counts(structure: &ExtractedPRDStructure) -> ItemCounts {
    ItemCounts {
        epics: structure.epics.len(),
        user_stories: structure.user_stories.len(),
        tasks: structure.tasks.len(),
        acceptance_criteria: structure.acceptance_criteria.len(),
    }
}

#[derive(Debug, Clone, Default)]
pub struct ItemCounts {
    pub epics: usize,
    pub user_stories: usize,
    pub tasks: usize,
    pub acceptance_criteria: usize,
}

impl ItemCounts {
    pub fn total(&self) -> usize {
        self.epics + self.user_stories + self.tasks + self.acceptance_criteria
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EffortSize;

    #[test]
    fn test_extract_json_blocks_single() {
        let content = r#"
Here's an epic:

```json
{
  "type": "epic",
  "id": "EP-1",
  "title": "User Authentication",
  "description": "Implement user auth"
}
```

That's the epic.
"#;

        let blocks = extract_json_blocks(content);
        assert_eq!(blocks.len(), 1);
        assert!(blocks[0].contains("EP-1"));
    }

    #[test]
    fn test_extract_json_blocks_multiple() {
        let content = r#"
```json
{
  "type": "epic",
  "id": "EP-1",
  "title": "Epic 1",
  "description": "First epic"
}
```

```json
{
  "type": "user_story",
  "id": "US-1.1",
  "parentId": "EP-1",
  "title": "Story 1",
  "description": "First story"
}
```
"#;

        let blocks = extract_json_blocks(content);
        assert_eq!(blocks.len(), 2);
    }

    #[test]
    fn test_extract_json_blocks_empty() {
        let content = "No JSON blocks here, just text.";
        let blocks = extract_json_blocks(content);
        assert!(blocks.is_empty());
    }

    #[test]
    fn test_parse_json_block_epic() {
        let json = r#"{
            "type": "epic",
            "id": "EP-1",
            "title": "User Authentication",
            "description": "Complete auth system"
        }"#;

        let item = parse_json_block(json).unwrap();
        assert_eq!(item.item_type, PRDItemType::Epic);
        assert_eq!(item.id, "EP-1");
        assert_eq!(item.title, "User Authentication");
    }

    #[test]
    fn test_parse_json_block_user_story_full() {
        let json = r#"{
            "type": "user_story",
            "id": "US-1.1",
            "parentId": "EP-1",
            "title": "User Login",
            "description": "As a user, I want to log in",
            "acceptanceCriteria": [
                "User can enter email and password",
                "Invalid credentials show error"
            ],
            "priority": 1,
            "estimatedEffort": "medium"
        }"#;

        let item = parse_json_block(json).unwrap();
        assert_eq!(item.item_type, PRDItemType::UserStory);
        assert_eq!(item.id, "US-1.1");
        assert_eq!(item.parent_id, Some("EP-1".to_string()));
        assert_eq!(item.acceptance_criteria.as_ref().unwrap().len(), 2);
        assert_eq!(item.priority, Some(1));
        assert_eq!(item.estimated_effort, Some(EffortSize::Medium));
    }

    #[test]
    fn test_parse_json_block_invalid() {
        let json = "not valid json";
        assert!(parse_json_block(json).is_none());
    }

    #[test]
    fn test_parse_json_block_non_prd_item() {
        // Valid JSON but not a PRD item structure
        let json = r#"{"name": "test", "value": 42}"#;
        assert!(parse_json_block(json).is_none());
    }

    #[test]
    fn test_validate_prd_item_valid() {
        let item = StructuredPRDItem {
            item_type: PRDItemType::Epic,
            id: "EP-1".to_string(),
            parent_id: None,
            title: "Test Epic".to_string(),
            description: "Description".to_string(),
            acceptance_criteria: None,
            priority: Some(3),
            dependencies: None,
            estimated_effort: Some(EffortSize::Medium),
            tags: None,
        };

        assert!(validate_prd_item(&item).is_ok());
    }

    #[test]
    fn test_validate_prd_item_empty_id() {
        let item = StructuredPRDItem {
            item_type: PRDItemType::Epic,
            id: "".to_string(),
            parent_id: None,
            title: "Test".to_string(),
            description: "Description".to_string(),
            acceptance_criteria: None,
            priority: None,
            dependencies: None,
            estimated_effort: None,
            tags: None,
        };

        assert!(validate_prd_item(&item).is_err());
    }

    #[test]
    fn test_validate_prd_item_invalid_priority() {
        let item = StructuredPRDItem {
            item_type: PRDItemType::Task,
            id: "T-1".to_string(),
            parent_id: None,
            title: "Test".to_string(),
            description: "Description".to_string(),
            acceptance_criteria: None,
            priority: Some(10), // Invalid: should be 1-5
            dependencies: None,
            estimated_effort: None,
            tags: None,
        };

        assert!(validate_prd_item(&item).is_err());
    }

    #[test]
    fn test_merge_items_no_duplicates() {
        let mut structure = ExtractedPRDStructure::default();

        let items = vec![
            StructuredPRDItem {
                item_type: PRDItemType::Epic,
                id: "EP-1".to_string(),
                parent_id: None,
                title: "Epic 1".to_string(),
                description: "First".to_string(),
                acceptance_criteria: None,
                priority: None,
                dependencies: None,
                estimated_effort: None,
                tags: None,
            },
            StructuredPRDItem {
                item_type: PRDItemType::Task,
                id: "T-1".to_string(),
                parent_id: Some("EP-1".to_string()),
                title: "Task 1".to_string(),
                description: "First task".to_string(),
                acceptance_criteria: None,
                priority: None,
                dependencies: None,
                estimated_effort: None,
                tags: None,
            },
        ];

        merge_items(&mut structure, items);

        assert_eq!(structure.epics.len(), 1);
        assert_eq!(structure.tasks.len(), 1);
    }

    #[test]
    fn test_merge_items_with_duplicates() {
        let mut structure = ExtractedPRDStructure::default();
        structure.epics.push(StructuredPRDItem {
            item_type: PRDItemType::Epic,
            id: "EP-1".to_string(),
            parent_id: None,
            title: "Old Title".to_string(),
            description: "Old".to_string(),
            acceptance_criteria: None,
            priority: None,
            dependencies: None,
            estimated_effort: None,
            tags: None,
        });

        let items = vec![StructuredPRDItem {
            item_type: PRDItemType::Epic,
            id: "EP-1".to_string(), // Same ID - should update
            parent_id: None,
            title: "New Title".to_string(),
            description: "Updated".to_string(),
            acceptance_criteria: None,
            priority: Some(1),
            dependencies: None,
            estimated_effort: None,
            tags: None,
        }];

        merge_items(&mut structure, items);

        assert_eq!(structure.epics.len(), 1);
        assert_eq!(structure.epics[0].title, "New Title");
        assert_eq!(structure.epics[0].priority, Some(1));
    }

    #[test]
    fn test_extract_prd_structure() {
        let content = r#"
Let me define the structure:

```json
{
  "type": "epic",
  "id": "EP-1",
  "title": "User Authentication",
  "description": "Complete auth system"
}
```

And a story:

```json
{
  "type": "user_story",
  "id": "US-1.1",
  "parentId": "EP-1",
  "title": "User Login",
  "description": "As a user I want to login",
  "acceptanceCriteria": ["Can enter credentials", "Shows error on failure"]
}
```

And a task:

```json
{
  "type": "task",
  "id": "T-1",
  "parentId": "US-1.1",
  "title": "Create login form",
  "description": "Build the UI"
}
```
"#;

        let structure = extract_prd_structure(content);

        assert_eq!(structure.epics.len(), 1);
        assert_eq!(structure.user_stories.len(), 1);
        assert_eq!(structure.tasks.len(), 1);
        assert_eq!(structure.acceptance_criteria.len(), 0);
    }

    #[test]
    fn test_get_item_counts() {
        let mut structure = ExtractedPRDStructure::default();
        structure.epics.push(StructuredPRDItem {
            item_type: PRDItemType::Epic,
            id: "EP-1".to_string(),
            parent_id: None,
            title: "Test".to_string(),
            description: "".to_string(),
            acceptance_criteria: None,
            priority: None,
            dependencies: None,
            estimated_effort: None,
            tags: None,
        });
        structure.user_stories.push(StructuredPRDItem {
            item_type: PRDItemType::UserStory,
            id: "US-1".to_string(),
            parent_id: None,
            title: "Test".to_string(),
            description: "".to_string(),
            acceptance_criteria: None,
            priority: None,
            dependencies: None,
            estimated_effort: None,
            tags: None,
        });
        structure.user_stories.push(StructuredPRDItem {
            item_type: PRDItemType::UserStory,
            id: "US-2".to_string(),
            parent_id: None,
            title: "Test 2".to_string(),
            description: "".to_string(),
            acceptance_criteria: None,
            priority: None,
            dependencies: None,
            estimated_effort: None,
            tags: None,
        });

        let counts = get_item_counts(&structure);

        assert_eq!(counts.epics, 1);
        assert_eq!(counts.user_stories, 2);
        assert_eq!(counts.tasks, 0);
        assert_eq!(counts.total(), 3);
    }
}
